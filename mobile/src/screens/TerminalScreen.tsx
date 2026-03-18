import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import TerminalView, { type TerminalHandle } from "../components/TerminalView";
import MobileKeybar from "../components/MobileKeybar";
import SessionDrawer from "../components/SessionDrawer";
import { TerminalWsService, type ConnectStatus } from "../services/terminalWs";
import "./TerminalScreen.css";

export default function TerminalScreen() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id ?? "main";

  const [status, setStatus] = createSignal<ConnectStatus>("connecting");
  const [showDrawer, setShowDrawer] = createSignal(false);
  let termHandle: TerminalHandle | undefined;

  const ws = new TerminalWsService(sessionId);

  // Wire PTY output → xterm.js
  ws.onData = (data) => termHandle?.write(data);

  ws.onStatus = (s) => {
    setStatus(s);
    if (s === "authenticated") {
      setTimeout(() => termHandle?.fit(), 100);
    }
  };

  ws.onError = (msg) => console.error("[TerminalScreen]", msg);

  onMount(() => ws.connect());
  onCleanup(() => ws.disconnect());

  function retry() {
    setStatus("connecting");
    ws.connect();
  }

  return (
    <div class="screen terminal-screen">
      {/* App bar with session switcher hamburger */}
      <div class="terminal-appbar">
        <span class="terminal-session-label">{sessionId}</span>
        <button
          class="terminal-menu-btn"
          aria-label="Switch session"
          onClick={() => setShowDrawer(true)}
        >
          ☰
        </button>
      </div>

      {/* xterm.js canvas */}
      <TerminalView
        ref={(h) => { termHandle = h; }}
        onResize={(cols, rows) => ws.sendResize(cols, rows)}
      />

      {/* Mobile key toolbar — sits above the software keyboard */}
      <MobileKeybar onSend={(seq) => ws.sendData(seq)} />

      {/* Status overlay — shown until authenticated */}
      <Show when={status() !== "authenticated"}>
        <div class="terminal-overlay">
          <Show when={status() === "connecting"}>
            <div class="overlay-row">
              <span class="spinner" />
              <span>Connecting…</span>
            </div>
          </Show>
          <Show when={status() === "auth_failed"}>
            <div class="overlay-row error">
              <span>Auth failed — tap to retry</span>
              <button onClick={retry}>Retry</button>
            </div>
          </Show>
          <Show when={status() === "disconnected"}>
            <div class="overlay-row">
              <span>Disconnected</span>
              <button onClick={retry}>Reconnect</button>
            </div>
          </Show>
        </div>
      </Show>

      {/* Session switcher drawer — opened via hamburger button */}
      <Show when={showDrawer()}>
        <SessionDrawer
          currentSessionId={sessionId}
          onClose={() => setShowDrawer(false)}
        />
      </Show>
    </div>
  );
}
