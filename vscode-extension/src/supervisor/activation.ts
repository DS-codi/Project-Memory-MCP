import * as vscode from 'vscode';
import { SupervisorSettings } from './settings';
import { detectSupervisor } from './detect';
import { spawnLauncher } from './launcher';
import { waitForSupervisorReady } from './ready';

/**
 * Drive the full supervisor activation flow based on the current settings.
 *
 * Startup mode handling:
 * - `'off'`    — return `'skipped'` immediately without touching the supervisor.
 * - `'prompt'` — show an info message asking the user whether to start.
 *                Returns `'skipped'` if the user dismisses or picks "Skip".
 * - `'auto'`   — proceed directly to detection + launch.
 *
 * For `'auto'` or a prompted "Start":
 * 1. {@link detectSupervisor} — if the supervisor is already running, return `'ready'`.
 * 2. {@link spawnLauncher}   — attempt to launch the supervisor; log but swallow errors
 *                              so a missing launcher does not hard-crash the extension.
 * 3. {@link waitForSupervisorReady} — poll until ready or timeout; return `'ready'`
 *                                     on success, `'degraded'` on timeout.
 *
 * @param context  The extension activation context (unused here but threaded through
 *                 for symmetry with other activation helpers).
 * @param settings Typed supervisor configuration from {@link readSupervisorSettings}.
 * @returns A promise that resolves to `'ready'`, `'degraded'`, or `'skipped'`.
 */
export async function runSupervisorActivation(
  context: vscode.ExtensionContext,
  settings: SupervisorSettings
): Promise<'ready' | 'degraded' | 'skipped'> {
  // Mode: off — never start automatically.
  if (settings.startupMode === 'off') {
    return 'skipped';
  }

  // Mode: prompt — ask the user before proceeding.
  if (settings.startupMode === 'prompt') {
    const choice = await vscode.window.showInformationMessage(
      'Start Project Memory Supervisor?',
      'Start',
      'Skip'
    );
    if (choice !== 'Start') {
      return 'skipped';
    }
  }

  // Mode: auto (or prompt with user confirming "Start") — run detection + launch.

  // Step 1: Check if the supervisor is already running.
  const alreadyRunning = await detectSupervisor(settings.detectTimeoutMs);
  if (alreadyRunning) {
    return 'ready';
  }

  // Step 2: Attempt to spawn the launcher. Log errors but do not throw — a
  // missing launcher path should degrade gracefully rather than hard-crash.
  try {
    spawnLauncher(settings.launcherPath);
  } catch (err) {
    console.error('[Supervisor] spawnLauncher failed:', err);
  }

  // Step 3: Wait for the supervisor to signal readiness.
  try {
    await waitForSupervisorReady(settings.startupTimeoutMs);
    return 'ready';
  } catch {
    return 'degraded';
  }
}
