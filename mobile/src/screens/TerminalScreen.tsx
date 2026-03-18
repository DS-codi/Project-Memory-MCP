import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import TerminalView, { type TerminalHandle } from "../components/TerminalView";
import { TerminalWsService, type ConnectStatus } from "../services/terminalWs";
import "./TerminalScreen.css";

export default function TerminalScreen() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id ?? "main";

  const [status, setStatus] = createSignal<ConnectStatus>("connecting");
  let termHandle: TerminalHandle | undefined;

  const ws = new TerminalWsService(sessionId);

  // Wire PTY output → xterm.js
  ws.onData = (data) => termHandle?.write(data);

  ws.onStatus = (s) => {
    setStatus(s);
    if (s === "authenticated") {
      // Allow xterm.js to settle before fitting to container.
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
      {/* xterm.js canvas fills all available space above the keybar */}
      <TerminalView
        ref={(h) => {
          termHandle = h;
        }}
        onResize={(cols, rows) => ws.sendResize(cols, rows)}
      />

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
    </div>
  );
}
