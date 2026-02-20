import { detectSupervisor } from './detect';

/** Initial poll interval (ms). */
const INITIAL_INTERVAL_MS = 200;

/** Backoff multiplier applied after each failed attempt. */
const BACKOFF_FACTOR = 1.5;

/** Maximum poll interval (ms) — backoff is capped at this value. */
const MAX_INTERVAL_MS = 2000;

/**
 * Poll {@link detectSupervisor} with exponential backoff until the Supervisor
 * reports that it is ready or the overall timeout elapses.
 *
 * Backoff schedule (intervals in ms, capped at {@link MAX_INTERVAL_MS}):
 * 200 → 300 → 450 → 675 → … → 2000 → 2000 → …
 *
 * @param timeoutMs Maximum total time (ms) to wait for the Supervisor to become ready.
 * @returns A promise that resolves when the Supervisor is detected.
 * @throws {Error} If the Supervisor is not detected within `timeoutMs` milliseconds.
 */
export function waitForSupervisorReady(timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const startTime = Date.now();
    let intervalMs = INITIAL_INTERVAL_MS;

    const attempt = async (): Promise<void> => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= timeoutMs) {
        reject(
          new Error(
            `waitForSupervisorReady: Supervisor did not become ready within ${timeoutMs} ms.`
          )
        );
        return;
      }

      // Use the remaining time as the per-probe timeout so we never overshoot.
      const remaining = timeoutMs - elapsed;
      const probeTimeout = Math.min(intervalMs, remaining);

      const isReady = await detectSupervisor(probeTimeout);

      if (isReady) {
        resolve();
        return;
      }

      // Advance the backoff interval (capped).
      intervalMs = Math.min(Math.round(intervalMs * BACKOFF_FACTOR), MAX_INTERVAL_MS);

      // Check elapsed again before scheduling the next attempt.
      const elapsedAfterProbe = Date.now() - startTime;
      if (elapsedAfterProbe >= timeoutMs) {
        reject(
          new Error(
            `waitForSupervisorReady: Supervisor did not become ready within ${timeoutMs} ms.`
          )
        );
        return;
      }

      const delay = Math.min(intervalMs, timeoutMs - elapsedAfterProbe);
      setTimeout(() => void attempt(), delay);
    };

    void attempt();
  });
}
