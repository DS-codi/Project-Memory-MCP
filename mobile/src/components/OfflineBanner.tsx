import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { ping } from "../services/supervisorApi";
import "./OfflineBanner.css";

export default function OfflineBanner() {
  const [offline, setOffline] = createSignal(false);
  const [retrying, setRetrying] = createSignal(false);

  async function check() {
    try {
      await ping();
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }

  async function retry() {
    setRetrying(true);
    await check();
    setRetrying(false);
  }

  onMount(() => {
    check();
    const id = setInterval(check, 15_000);
    onCleanup(() => clearInterval(id));
  });

  return (
    <Show when={offline()}>
      <div class="offline-banner-bar">
        <span>Supervisor unreachable</span>
        <button onClick={retry} disabled={retrying()}>
          {retrying() ? "Retrying…" : "Retry"}
        </button>
      </div>
    </Show>
  );
}
