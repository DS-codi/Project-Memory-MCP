import { createSignal, onMount, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { setServerConfig } from "../services/storage";

interface DiscoveredHost {
  name: string;
  host: string;
  httpPort: number;
  wsPort: number;
}

export default function DiscoveryScreen() {
  const navigate = useNavigate();
  const [discovered, setDiscovered] = createSignal<DiscoveredHost[]>([]);
  const [scanning, setScanning] = createSignal(false);
  const [mdnsAvailable, setMdnsAvailable] = createSignal(false);
  const [mdnsError, setMdnsError] = createSignal("");
  const [manualHost, setManualHost] = createSignal("");
  const [manualHttp, setManualHttp] = createSignal("3464");
  const [manualWs, setManualWs] = createSignal("3458");
  const [formError, setFormError] = createSignal("");

  const runMdnsScan = async () => {
    setScanning(true);
    setMdnsError("");
    setDiscovered([]);
    try {
      // Defensive dynamic import — plugin may not be installed
      const mdns = await import("@capacitor-community/mdns").catch(() => null);
      if (!mdns) {
        setMdnsAvailable(false);
        setMdnsError("mDNS plugin not available — use manual entry below");
        return;
      }
      setMdnsAvailable(true);
      const results = await (mdns as any).browse({
        serviceType: "_projectmemory._tcp",
      });
      const services: DiscoveredHost[] = (results?.services ?? []).map(
        (s: any) => ({
          name: s.serviceName ?? s.hostname ?? "Project Memory",
          host: s.ipAddress ?? s.hostname,
          httpPort: parseInt(s.txtRecord?.http_port ?? "3464", 10),
          wsPort: parseInt(s.txtRecord?.ws_port ?? "3458", 10),
        })
      );
      setDiscovered(services);
      if (services.length === 0) {
        setMdnsError("No Project Memory instances found on this network");
      }
    } catch (e: any) {
      setMdnsError(e?.message ?? "mDNS scan failed");
    } finally {
      setScanning(false);
    }
  };

  const connectTo = async (cfg: { host: string; httpPort: number; wsPort: number }) => {
    await setServerConfig(cfg);
    navigate("/dashboard");
  };

  const connectManual = async () => {
    setFormError("");
    if (!manualHost().trim()) {
      setFormError("Host IP or hostname is required");
      return;
    }
    const httpPort = parseInt(manualHttp(), 10);
    const wsPort = parseInt(manualWs(), 10);
    if (isNaN(httpPort) || isNaN(wsPort)) {
      setFormError("Ports must be valid numbers");
      return;
    }
    await connectTo({ host: manualHost().trim(), httpPort, wsPort });
  };

  onMount(() => {
    runMdnsScan();
  });

  return (
    <div class="screen">
      <h2>Discover Server</h2>

      {/* mDNS section */}
      <div class="discovery-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <h3 style="margin:0">LAN Discovery</h3>
          <button
            onClick={runMdnsScan}
            disabled={scanning()}
            style="padding:6px 14px;font-size:0.8rem"
          >
            {scanning() ? "Scanning…" : "Rescan"}
          </button>
        </div>

        <Show when={mdnsError()}>
          <p class="error">{mdnsError()}</p>
        </Show>

        <Show when={scanning()}>
          <p class="info">Scanning for Project Memory on your network…</p>
        </Show>

        <For each={discovered()}>
          {(host) => (
            <div class="discovery-item">
              <div>
                <div style="font-weight:600">{host.name}</div>
                <div class="info">{host.host} — HTTP:{host.httpPort} WS:{host.wsPort}</div>
              </div>
              <button onClick={() => connectTo(host)}>Connect</button>
            </div>
          )}
        </For>
      </div>

      <hr />

      {/* Manual entry section */}
      <div class="discovery-section">
        <h3>Manual Entry</h3>
        <Show when={formError()}>
          <p class="error">{formError()}</p>
        </Show>
        <label class="field-label">Host IP or Hostname</label>
        <input
          type="text"
          placeholder="192.168.1.x or hostname"
          value={manualHost()}
          onInput={(e) => setManualHost(e.currentTarget.value)}
          autocapitalize="none"
          autocorrect="off"
        />
        <label class="field-label">HTTP Port (Supervisor)</label>
        <input
          type="number"
          placeholder="3464"
          value={manualHttp()}
          onInput={(e) => setManualHttp(e.currentTarget.value)}
          inputmode="numeric"
        />
        <label class="field-label">WebSocket Port (Terminal)</label>
        <input
          type="number"
          placeholder="3458"
          value={manualWs()}
          onInput={(e) => setManualWs(e.currentTarget.value)}
          inputmode="numeric"
        />
        <button onClick={connectManual} style="width:100%;margin-top:8px">
          Connect Manually
        </button>
        <button
          onClick={() => navigate("/pairing")}
          style="width:100%;background:var(--color-surface-variant);color:var(--color-on-surface);border:1px solid var(--color-border)"
        >
          Scan QR Code Instead
        </button>
      </div>
    </div>
  );
}
