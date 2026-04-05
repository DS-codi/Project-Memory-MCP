import {
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  Show,
  For,
} from "solid-js";
import { useSearchParams, useNavigate } from "@solidjs/router";
import TerminalView, { type TerminalHandle } from "../components/TerminalView";
import MobileKeybar from "../components/MobileKeybar";
import FileExplorerPanel from "../components/FileExplorerPanel";
import { TerminalWsService } from "../services/terminalWs";
import { getServerConfig } from "../services/storage";
import "./MonitorScreen.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type PanelId = "terminal" | "files" | "dashboard" | "supervisor";

interface TabDef {
  id: string;
  label: string;
}

// ── Panel component ───────────────────────────────────────────────────────────

interface PanelProps {
  id: PanelId;
  label: string;
  icon: string;
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (id: string) => void;
  onAddTab?: () => void;
  focused: boolean;
  onFocus: () => void;
  onUnfocus: () => void;
  isRemoteDesktop?: boolean;
  children: any;
}

function MonitorPanel(props: PanelProps) {
  return (
    <div
      class={`monitor-panel${props.focused ? " focused" : ""}${props.isRemoteDesktop ? " rdp-mode" : ""}`}
      data-panel={props.id}
    >
      <Show when={!props.isRemoteDesktop}>
        <div class="panel-header">
          <span class="panel-icon">{props.icon}</span>
          <div class="panel-tabs">
            <For each={props.tabs}>
              {(tab) => (
                <button
                  class={`panel-tab${tab.id === props.activeTab ? " active" : ""}`}
                  onClick={() => props.onTabChange(tab.id)}
                >
                  {tab.label}
                </button>
              )}
            </For>
            <Show when={props.onAddTab}>
              <button class="panel-tab-add" onClick={props.onAddTab} title="New tab">
                +
              </button>
            </Show>
          </div>
          <button
            class="panel-focus-btn"
            title={props.focused ? "Restore" : "Maximise"}
            onClick={() => (props.focused ? props.onUnfocus() : props.onFocus())}
          >
            {props.focused ? "⊟" : "⊡"}
          </button>
        </div>
      </Show>
      <div class="panel-content">{props.children}</div>
    </div>
  );
}

// ── Terminal panel (manages one WS per session id) ────────────────────────────

interface TerminalPanelContentProps {
  sessionId: string;
  active: boolean;
}

function TerminalPanelContent(props: TerminalPanelContentProps) {
  let termHandle: TerminalHandle | undefined;
  const ws = new TerminalWsService(props.sessionId);
  const [status, setStatus] = createSignal<string>("connecting");

  ws.onData = (data) => termHandle?.write(data);
  ws.onStatus = (s) => {
    setStatus(s);
    if (s === "authenticated") setTimeout(() => termHandle?.fit(), 100);
  };

  onMount(() => { if (props.active) ws.connect(); });
  onCleanup(() => ws.disconnect());

  createEffect(() => {
    if (props.active) {
      ws.connect();
      setTimeout(() => termHandle?.fit(), 150);
    } else {
      ws.disconnect();
    }
  });

  return (
    <div class="terminal-panel-wrap">
      <TerminalView
        ref={(h) => { termHandle = h; }}
        onResize={(cols, rows) => ws.sendResize(cols, rows)}
      />
      <MobileKeybar onSend={(seq) => ws.sendData(seq)} />
      <Show when={status() !== "authenticated"}>
        <div class="terminal-overlay-mini">
          <Show when={status() === "connecting"}>
            <span class="spinner" /> Connecting…
          </Show>
          <Show when={status() === "disconnected" || status() === "auth_failed"}>
            <span>{status() === "auth_failed" ? "Auth failed" : "Disconnected"}</span>
            <button onClick={() => ws.connect()}>Reconnect</button>
          </Show>
        </div>
      </Show>
    </div>
  );
}

// ── Iframe panel ──────────────────────────────────────────────────────────────

function IframePanel(props: { src: string; title: string }) {
  return (
    <iframe
      class="panel-iframe"
      src={props.src}
      title={props.title}
      allow="clipboard-read; clipboard-write"
    />
  );
}

// ── Main MonitorScreen ────────────────────────────────────────────────────────

export default function MonitorScreen() {
  const [searchParams] = useSearchParams();
  const [focusedPanel, setFocusedPanel] = createSignal<PanelId | null>(null);
  const [activeApp, setActiveApp] = createSignal<PanelId>("dashboard");

  // Terminal sessions
  const [termSessions, setTermSessions] = createSignal<TabDef[]>([
    { id: "main", label: "main" },
  ]);
  const [activeTermSession, setActiveTermSession] = createSignal("main");

  // Iframe URLs
  const [dashUrl, setDashUrl] = createSignal("http://127.0.0.1:3459");
  const [supervisorUrl, setSupervisorUrl] = createSignal("http://127.0.0.1:3464/gui/ping");

  // Allowed apps from URL
  const allowedApps = () => {
    const appsStr = searchParams.apps;
    if (!appsStr) return ["terminal", "files", "dashboard", "supervisor"] as PanelId[];
    return appsStr.split(",") as PanelId[];
  };

  const isRdpMode = () => !!searchParams.apps;
  const monitorLabel = () => searchParams.monitor ? `Monitor ${searchParams.monitor}` : "Virtual Monitor";

  const [isAuthorized, setIsAuthorized] = createSignal(false);
  const navigate = useNavigate();

  onMount(async () => {
    // 1. Check URL for API Key (from QR) or Session Token
    const urlKey = searchParams.key;
    const urlToken = searchParams.token;
    
    if (urlKey) {
      localStorage.setItem("pm_api_key", urlKey);
      setIsAuthorized(true);
    } else if (urlToken) {
      localStorage.setItem("pm_session_token", urlToken);
      localStorage.setItem("pm_token_expiry", (Date.now() + 86400000).toString());
      setIsAuthorized(true);
    } else {
      // 2. Check LocalStorage for persistent session (24h)
      const storedToken = localStorage.getItem("pm_session_token");
      const expiry = localStorage.getItem("pm_token_expiry");
      const now = Date.now();
      
      if (storedToken && expiry && parseInt(expiry) > now) {
        setIsAuthorized(true);
      } else {
        // 3. Unauthorized -> Redirect to Login
        const currentUrl = window.location.href;
        navigate(`/auth?redirect=${encodeURIComponent(currentUrl)}`);
        return;
      }
    }

    const isBrowser = !(window as any).Capacitor?.isNativePlatform?.();
    if (!isBrowser) {
      const cfg = await getServerConfig();
      if (cfg) {
        setDashUrl(`http://${cfg.host}:${cfg.httpPort + 1}`);
        setSupervisorUrl(`http://${cfg.host}:3464`);
      }
    }
    
    // Auto-select first allowed app
    const apps = allowedApps();
    if (apps.length > 0) {
      setActiveApp(apps[0]);
    }
  });

  function addTermSession() {
    const id = `shell-${Date.now()}`;
    setTermSessions((s) => [...s, { id, label: id.slice(-4) }]);
    setActiveTermSession(id);
  }

  function unfocus() { setFocusedPanel(null); }

  const isFocused = (id: PanelId) => isRdpMode() ? activeApp() === id : focusedPanel() === id;
  const isHidden = (id: PanelId) => {
    if (isRdpMode()) return activeApp() !== id;
    return focusedPanel() !== null && focusedPanel() !== id;
  };

  const appIcons: Record<PanelId, string> = {
    terminal: "⌨",
    files: "📁",
    dashboard: "🏠",
    supervisor: "🖥",
  };

  return (
    <Show when={isAuthorized()}>
      <div class={`monitor-screen${isRdpMode() ? " rdp-mode" : ""}`}>
        {/* Header */}
        <div class="monitor-header">
        <span class="monitor-title">⬛ {monitorLabel()}</span>
        <Show when={focusedPanel() && !isRdpMode()}>
          <button class="monitor-restore-btn" onClick={unfocus}>
            ⊟ Restore grid
          </button>
        </Show>
      </div>

      {/* Main View Area */}
      <div class={`monitor-grid${(focusedPanel() || isRdpMode()) ? " has-focus" : ""}`}>

        {/* ── Terminal ─────────────────────────────────────────────────────── */}
        <Show when={allowedApps().includes("terminal") && !isHidden("terminal")}>
          <MonitorPanel
            id="terminal"
            label="Terminal"
            icon="⌨"
            tabs={termSessions()}
            activeTab={activeTermSession()}
            onTabChange={setActiveTermSession}
            onAddTab={addTermSession}
            focused={isFocused("terminal")}
            onFocus={() => setFocusedPanel("terminal")}
            onUnfocus={unfocus}
            isRemoteDesktop={isRdpMode()}
          >
            <For each={termSessions()}>
              {(session) => (
                <Show when={session.id === activeTermSession()}>
                  <TerminalPanelContent
                    sessionId={session.id}
                    active={session.id === activeTermSession()}
                  />
                </Show>
              )}
            </For>
          </MonitorPanel>
        </Show>

        {/* ── File Explorer ────────────────────────────────────────────────── */}
        <Show when={allowedApps().includes("files") && !isHidden("files")}>
          <MonitorPanel
            id="files"
            label="Files"
            icon="📁"
            tabs={[{ id: "files", label: "Files" }]}
            activeTab="files"
            onTabChange={() => {}}
            focused={isFocused("files")}
            onFocus={() => setFocusedPanel("files")}
            onUnfocus={unfocus}
            isRemoteDesktop={isRdpMode()}
          >
            <FileExplorerPanel />
          </MonitorPanel>
        </Show>

        {/* ── Dashboard ────────────────────────────────────────────────────── */}
        <Show when={allowedApps().includes("dashboard") && !isHidden("dashboard")}>
          <MonitorPanel
            id="dashboard"
            label="Dashboard"
            icon="🏠"
            tabs={[{ id: "dash", label: "Dashboard" }]}
            activeTab="dash"
            onTabChange={() => {}}
            focused={isFocused("dashboard")}
            onFocus={() => setFocusedPanel("dashboard")}
            onUnfocus={unfocus}
            isRemoteDesktop={isRdpMode()}
          >
            <IframePanel src={dashUrl()} title="Dashboard" />
          </MonitorPanel>
        </Show>

        {/* ── Supervisor ───────────────────────────────────────────────────── */}
        <Show when={allowedApps().includes("supervisor") && !isHidden("supervisor")}>
          <MonitorPanel
            id="supervisor"
            label="Supervisor"
            icon="🖥"
            tabs={[{ id: "sup", label: "Supervisor" }]}
            activeTab="sup"
            onTabChange={() => {}}
            focused={isFocused("supervisor")}
            onFocus={() => setFocusedPanel("supervisor")}
            onUnfocus={unfocus}
            isRemoteDesktop={isRdpMode()}
          >
            <IframePanel src={supervisorUrl()} title="Supervisor" />
          </MonitorPanel>
        </Show>

      </div>

      {/* RDP Taskbar */}
      <Show when={isRdpMode()}>
        <div class="rdp-taskbar">
          <div class="rdp-menu-btn">⠿</div>
          <div class="rdp-apps">
            <For each={allowedApps()}>
              {(app) => (
                <button 
                  class={`rdp-app-btn${activeApp() === app ? " active" : ""}`}
                  onClick={() => setActiveApp(app)}
                >
                  <span class="rdp-app-icon">{appIcons[app]}</span>
                  <span class="rdp-app-name">{app}</span>
                </button>
              )}
            </For>
          </div>
          <div class="rdp-system-info">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </Show>
    </Show>
  );
}
