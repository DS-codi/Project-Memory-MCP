import {
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  Show,
  For,
} from "solid-js";
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
  children: any;
}

function MonitorPanel(props: PanelProps) {
  return (
    <div
      class={`monitor-panel${props.focused ? " focused" : ""}`}
      data-panel={props.id}
    >
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
  const [focusedPanel, setFocusedPanel] = createSignal<PanelId | null>(null);

  // Terminal sessions
  const [termSessions, setTermSessions] = createSignal<TabDef[]>([
    { id: "main", label: "main" },
  ]);
  const [activeTermSession, setActiveTermSession] = createSignal("main");

  // File explorer root tabs are managed inside the component
  const fileTabs: TabDef[] = [{ id: "files", label: "Files" }];

  // Iframe URLs — derive from server config or use relative paths for browser mode
  const [dashUrl, setDashUrl] = createSignal("http://127.0.0.1:3459");
  const [supervisorUrl, setSupervisorUrl] = createSignal("http://127.0.0.1:3464/gui/ping");

  onMount(async () => {
    const isBrowser = !(window as any).Capacitor?.isNativePlatform?.();
    if (!isBrowser) {
      const cfg = await getServerConfig();
      if (cfg) {
        setDashUrl(`http://${cfg.host}:${cfg.httpPort + 1}`); // dashboard is httpPort+1 by convention
        setSupervisorUrl(`http://${cfg.host}:3464`);
      }
    }
    // In browser mode Vite proxies /gui → 3464, but we need a full URL for the
    // dashboard iframe which is a separate origin (port 3459).
  });

  function addTermSession() {
    const id = `shell-${Date.now()}`;
    setTermSessions((s) => [...s, { id, label: id.slice(-4) }]);
    setActiveTermSession(id);
  }

  function unfocus() { setFocusedPanel(null); }

  const isFocused = (id: PanelId) => focusedPanel() === id;
  const isHidden = (id: PanelId) =>
    focusedPanel() !== null && focusedPanel() !== id;

  return (
    <div class="monitor-screen">
      {/* Minimal chrome */}
      <div class="monitor-header">
        <span class="monitor-title">⬛ Virtual Monitor</span>
        <Show when={focusedPanel()}>
          <button class="monitor-restore-btn" onClick={unfocus}>
            ⊟ Restore grid
          </button>
        </Show>
      </div>

      {/* 2×2 tile grid */}
      <div class={`monitor-grid${focusedPanel() ? " has-focus" : ""}`}>

        {/* ── Terminal ─────────────────────────────────────────────────────── */}
        <Show when={!isHidden("terminal")}>
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
        <Show when={!isHidden("files")}>
          <MonitorPanel
            id="files"
            label="Files"
            icon="📁"
            tabs={fileTabs}
            activeTab="files"
            onTabChange={() => {}}
            focused={isFocused("files")}
            onFocus={() => setFocusedPanel("files")}
            onUnfocus={unfocus}
          >
            <FileExplorerPanel />
          </MonitorPanel>
        </Show>

        {/* ── Dashboard ────────────────────────────────────────────────────── */}
        <Show when={!isHidden("dashboard")}>
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
          >
            <IframePanel src={dashUrl()} title="Dashboard" />
          </MonitorPanel>
        </Show>

        {/* ── Supervisor ───────────────────────────────────────────────────── */}
        <Show when={!isHidden("supervisor")}>
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
          >
            <IframePanel src={supervisorUrl()} title="Supervisor" />
          </MonitorPanel>
        </Show>

      </div>
    </div>
  );
}
