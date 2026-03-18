import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { getRecentEvents } from "../services/supervisorApi";
import "./SessionDrawer.css";

interface SessionEntry {
  session_id: string;
  connected: boolean;
  last_seen: string;
}

interface SessionDrawerProps {
  /** Current active session — highlighted in the list. */
  currentSessionId?: string;
  onClose: () => void;
}

function generateSessionId(): string {
  return "sess_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Slide-up bottom drawer that lists known PTY sessions derived from
 * recent runtime events (type `terminal_session` or `terminal_connect`).
 * Falls back to showing only the current session when the endpoint is
 * unavailable.
 */
export default function SessionDrawer(props: SessionDrawerProps) {
  const navigate = useNavigate();
  const [sessions, setSessions] = createSignal<SessionEntry[]>([]);
  const [loading, setLoading] = createSignal(true);

  async function load() {
    setLoading(true);
    try {
      const events = await getRecentEvents();
      // Derive unique sessions from terminal-related events.
      const seen = new Map<string, SessionEntry>();
      for (const ev of events) {
        const sid = (ev as any).session_id as string | undefined;
        if (!sid) continue;
        const isTerminal =
          ev.type === "terminal_session" ||
          ev.type === "terminal_connect" ||
          ev.type === "terminal_disconnect";
        if (!isTerminal) continue;
        const connected = ev.type !== "terminal_disconnect";
        // Last event for a session_id wins.
        seen.set(sid, {
          session_id: sid,
          connected,
          last_seen: ev.timestamp ?? "",
        });
      }
      // Always include the current session even if not in events.
      if (props.currentSessionId && !seen.has(props.currentSessionId)) {
        seen.set(props.currentSessionId, {
          session_id: props.currentSessionId,
          connected: true,
          last_seen: "",
        });
      }
      setSessions([...seen.values()]);
    } catch {
      // Fallback: show at least the current session.
      if (props.currentSessionId) {
        setSessions([
          {
            session_id: props.currentSessionId,
            connected: true,
            last_seen: "",
          },
        ]);
      } else {
        setSessions([]);
      }
    }
    setLoading(false);
  }

  onMount(() => {
    load();
    const id = setInterval(load, 10_000);
    onCleanup(() => clearInterval(id));
  });

  function openSession(sid: string) {
    props.onClose();
    navigate(`/terminal/${sid}`);
  }

  function newSession() {
    const sid = generateSessionId();
    props.onClose();
    navigate(`/terminal/${sid}`);
  }

  return (
    <div class="session-drawer-backdrop" onClick={props.onClose}>
      <div class="session-drawer" onClick={(e) => e.stopPropagation()}>
        <div class="drawer-handle" />

        <div class="drawer-header">
          <h3>Terminal Sessions</h3>
          <button class="close-btn" onClick={props.onClose}>✕</button>
        </div>

        <Show when={loading()}>
          <p class="drawer-muted">Loading…</p>
        </Show>

        <Show when={!loading() && sessions().length === 0}>
          <p class="drawer-muted">No sessions found</p>
        </Show>

        <ul class="session-list">
          <For each={sessions()}>
            {(sess) => (
              <li
                class={`session-item ${sess.session_id === props.currentSessionId ? "current" : ""}`}
                onClick={() => openSession(sess.session_id)}
              >
                <span
                  class={`status-dot ${sess.connected ? "green" : "red"}`}
                />
                <span class="session-id">{sess.session_id}</span>
                <Show when={sess.last_seen}>
                  <span class="session-time">
                    {new Date(sess.last_seen).toLocaleTimeString()}
                  </span>
                </Show>
              </li>
            )}
          </For>
        </ul>

        <button class="new-session-btn" onClick={newSession}>
          + New Session
        </button>
      </div>
    </div>
  );
}
