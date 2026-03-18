import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { ping, getActivePlans } from "../services/supervisorApi";
import { getServerConfig } from "../services/storage";
import ActivityLog from "../components/ActivityLog";
import "./DashboardScreen.css";

export default function DashboardScreen() {
  const navigate = useNavigate();
  const [httpOk, setHttpOk] = createSignal(false);
  const [wsOk, setWsOk] = createSignal(false);
  const [plans, setPlans] = createSignal<{ id: string; title: string; status: string }[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [showLog, setShowLog] = createSignal(false);

  async function probeWs(): Promise<boolean> {
    const isBrowser = !(window as any).Capacitor?.isNativePlatform?.();
    let wsUrl: string;
    if (isBrowser) {
      wsUrl = `ws://${window.location.host}/ws`;
    } else {
      const cfg = await getServerConfig();
      if (!cfg) return false;
      wsUrl = `ws://${cfg.host}:${cfg.wsPort}`;
    }
    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl);
      const t = setTimeout(() => { ws.close(); resolve(false); }, 3000);
      ws.onopen = () => { clearTimeout(t); ws.close(); resolve(true); };
      ws.onerror = () => { clearTimeout(t); resolve(false); };
    });
  }

  async function refresh() {
    setLoading(true);
    const [http, ws, activePlans] = await Promise.allSettled([
      ping(),
      probeWs(),
      getActivePlans(),
    ]);
    setHttpOk(http.status === "fulfilled" && !!http.value);
    setWsOk(ws.status === "fulfilled" && !!ws.value);
    setPlans(activePlans.status === "fulfilled" ? activePlans.value : []);
    setLoading(false);
  }

  onMount(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    onCleanup(() => clearInterval(id));
  });

  return (
    <div class="screen dashboard">
      <Show when={!httpOk() && !loading()}>
        <div class="offline-banner">Server unreachable — check connection</div>
      </Show>

      <div class="status-row">
        <span class="status-dot" classList={{ green: httpOk(), red: !httpOk() }} />
        <span>HTTP {httpOk() ? "connected" : "offline"}</span>
        <span class="status-dot" classList={{ green: wsOk(), red: !wsOk() }} style="margin-left:16px" />
        <span>WS {wsOk() ? "connected" : "offline"}</span>
      </div>

      <h3>Active Plans ({plans().length})</h3>
      <Show when={plans().length === 0 && !loading()}>
        <p class="muted">No active plans</p>
      </Show>
      <ul class="plan-list">
        {plans().map((p) => (
          <li key={p.id} class="plan-item">
            <span class="plan-title">{p.title}</span>
            <span class="plan-status">{p.status}</span>
          </li>
        ))}
      </ul>

      <div class="action-row">
        <button onClick={refresh} disabled={loading()}>
          {loading() ? "Refreshing…" : "Refresh"}
        </button>
        <button onClick={() => navigate("/chat")}>Chat</button>
        <button onClick={() => navigate("/terminal/default")}>Terminal</button>
        <button onClick={() => navigate("/discovery")}>Change Server</button>
      </div>

      <div class="log-section">
        <button class="log-toggle" onClick={() => setShowLog((v) => !v)}>
          {showLog() ? "Hide" : "Show"} Activity Log ▾
        </button>
        <Show when={showLog()}>
          <ActivityLog maxItems={10} />
        </Show>
      </div>
    </div>
  );
}
