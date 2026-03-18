import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { getRecentEvents } from "../services/chatbotApi";
import type { RuntimeEvent } from "../types/api";
import "./SessionList.css";

interface SessionEntry {
  id: string;
  message: string;
  timestamp: string;
}

interface SessionListProps {
  onClose?: () => void;
}

export default function SessionList(props: SessionListProps) {
  const navigate = useNavigate();
  const [sessions, setSessions] = createSignal<SessionEntry[]>([]);
  const [error, setError] = createSignal("");

  const fetchSessions = async () => {
    try {
      const events = await getRecentEvents();
      const agentEvents = events
        .filter((e: RuntimeEvent) =>
          e.event_type === "agent_session" || e.event_type === "session_start"
        )
        .map((e: RuntimeEvent) => ({
          id: e.id,
          message: e.message,
          timestamp: e.timestamp,
        }));
      setSessions(agentEvents);
      setError("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load sessions");
    }
  };

  onMount(() => {
    fetchSessions();
    const t = setInterval(fetchSessions, 10_000);
    onCleanup(() => clearInterval(t));
  });

  const joinSession = (session: SessionEntry) => {
    props.onClose?.();
    navigate("/chat");
  };

  return (
    <div class="session-list">
      <div class="session-list__header">
        <h3>Active Sessions</h3>
        <Show when={props.onClose}>
          <button class="session-list__close" onClick={props.onClose}>✕</button>
        </Show>
      </div>

      <Show when={error()}>
        <p class="error" style="font-size:0.8rem;padding:8px">{error()}</p>
      </Show>

      <Show when={sessions().length === 0 && !error()}>
        <p class="info" style="padding:12px;font-size:0.85rem">No active agent sessions.</p>
      </Show>

      <For each={sessions()}>
        {(s) => (
          <div class="session-list__item">
            <div class="session-list__info">
              <span class="session-list__msg">{s.message}</span>
              <span class="session-list__time">
                {new Date(s.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <button class="session-list__join" onClick={() => joinSession(s)}>
              Chat
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
