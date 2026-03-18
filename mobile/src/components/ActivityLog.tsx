import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { getRecentEvents } from "../services/chatbotApi";
import type { RuntimeEvent } from "../types/api";
import "./ActivityLog.css";

interface ActivityLogProps {
  maxItems?: number;
}

export default function ActivityLog(props: ActivityLogProps) {
  const maxItems = () => props.maxItems ?? 50;
  const [events, setEvents] = createSignal<RuntimeEvent[]>([]);
  const [error, setError] = createSignal("");

  const fetchEvents = async () => {
    try {
      const all = await getRecentEvents();
      setEvents(all.slice(0, maxItems()));
      setError("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load events");
    }
  };

  onMount(() => {
    fetchEvents();
    const t = setInterval(fetchEvents, 5000);
    onCleanup(() => clearInterval(t));
  });

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch { return ts; }
  };

  return (
    <div class="activity-log">
      <Show when={error()}>
        <p class="error" style="font-size:0.75rem;margin:4px 0">{error()}</p>
      </Show>
      <Show when={events().length === 0 && !error()}>
        <p class="info" style="font-size:0.8rem">No recent events.</p>
      </Show>
      <For each={events()}>
        {(ev) => (
          <div class="activity-log__item">
            <span class="activity-log__time">{formatTime(ev.timestamp)}</span>
            <span class="activity-log__type">{ev.event_type}</span>
            <span class="activity-log__msg">{ev.message}</span>
          </div>
        )}
      </For>
    </div>
  );
}
