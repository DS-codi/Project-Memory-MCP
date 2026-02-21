import * as vscode from 'vscode';
import { SupervisorSettings } from './settings';
import { detectSupervisor } from './detect';

/**
 * Probe for a running Supervisor on extension activation.
 *
 * The extension never starts, owns, or manages the Supervisor process — it
 * must be launched independently (e.g. via `start-supervisor.ps1`).  This
 * function purely detects whether one is already reachable.
 *
 * Startup mode handling:
 * - `'off'`    — return `'skipped'` immediately; no detection attempted.
 * - `'prompt'` — ask once whether to check; skip if the user dismisses.
 * - `'auto'`   — detect silently.
 *
 * @param context  Extension activation context (reserved for future use).
 * @param settings Typed supervisor configuration.
 * @returns `'ready'` if a running Supervisor is detected, `'degraded'` if
 *          not reachable, or `'skipped'` when detection is disabled.
 */
export async function runSupervisorActivation(
  context: vscode.ExtensionContext,
  settings: SupervisorSettings
): Promise<'ready' | 'degraded' | 'skipped'> {
  // Mode: off — skip silently.
  if (settings.startupMode === 'off') {
    return 'skipped';
  }

  // Mode: prompt — ask before probing.
  if (settings.startupMode === 'prompt') {
    const choice = await vscode.window.showInformationMessage(
      'Check for a running Project Memory Supervisor?',
      'Check',
      'Skip'
    );
    if (choice !== 'Check') {
      return 'skipped';
    }
  }

  // Probe only — the extension never launches the Supervisor.
  const running = await detectSupervisor(settings.detectTimeoutMs);
  return running ? 'ready' : 'degraded';
}
