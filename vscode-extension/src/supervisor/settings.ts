import * as vscode from 'vscode';

/**
 * Typed representation of all `supervisor.*` VS Code settings.
 */
export interface SupervisorSettings {
  /**
   * Controls whether the extension auto-starts the Supervisor on activation.
   * - "off"    — never start automatically
   * - "prompt" — ask the user before starting
   * - "auto"   — start without prompting
   */
  startupMode: 'off' | 'prompt' | 'auto';

  /**
   * Path to the Supervisor launcher executable.
   * An empty string means the bundled launcher should be used.
   */
  launcherPath: string;

  /**
   * Timeout (ms) for detecting an already-running Supervisor on activation.
   */
  detectTimeoutMs: number;

  /**
   * Maximum time (ms) to wait for the Supervisor to reach the ready state
   * after launch.
   */
  startupTimeoutMs: number;
}

/**
 * Read all `supervisor.*` settings from the VS Code workspace configuration
 * and return them as a typed {@link SupervisorSettings} object.
 *
 * Falls back to the defaults defined in `package.json` when a value is not
 * explicitly set by the user.
 */
export function readSupervisorSettings(): SupervisorSettings {
  const cfg = vscode.workspace.getConfiguration('supervisorDev');

  return {
    startupMode: cfg.get<'off' | 'prompt' | 'auto'>('startupMode', 'auto'),
    launcherPath: cfg.get<string>('launcherPath', ''),
    detectTimeoutMs: cfg.get<number>('detectTimeoutMs', 1000),
    startupTimeoutMs: cfg.get<number>('startupTimeoutMs', 15000),
  };
}
