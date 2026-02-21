import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { SupervisorSettings } from './settings';

/**
 * Spawn the Supervisor launcher executable as a fully detached process.
 *
 * The child process is detached and unreferenced so it continues running
 * independently of the VS Code extension host process.
 *
 * @param launcherPath Absolute path to the launcher executable.
 * @returns The spawned {@link cp.ChildProcess} (already unref'd).
 * @throws {Error} If `launcherPath` is empty or the file does not exist.
 */
export function spawnLauncher(launcherPath: string): cp.ChildProcess {
  if (!launcherPath || launcherPath.trim().length === 0) {
    throw new Error(
      'spawnLauncher: launcherPath must not be empty. ' +
        'Provide the absolute path to the Supervisor launcher executable.'
    );
  }

  if (!fs.existsSync(launcherPath)) {
    throw new Error(
      `spawnLauncher: launcher executable not found at path "${launcherPath}". ` +
        'Ensure the Supervisor launcher is installed and the path is correct.'
    );
  }

  const child = cp.spawn(launcherPath, [], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  return child;
}

/**
 * Open a visible VS Code terminal and launch the Supervisor inside it.
 *
 * Resolution order for the launch script / executable:
 * 1. `settings.launcherPath` if non-empty (supports `.ps1` or `.exe`)
 * 2. `start-supervisor.ps1` in the first VS Code workspace root folder
 * 3. `start-supervisor.ps1` relative to the extension's install directory
 *
 * @param settings Supervisor settings read from workspace configuration.
 * @returns The VS Code {@link vscode.Terminal} used to launch the process.
 * @throws {Error} If no launch script or executable can be located.
 */
export function launchSupervisorInTerminal(settings: SupervisorSettings): vscode.Terminal {
  const launchTarget = resolveLaunchTarget(settings);

  const terminal = vscode.window.createTerminal({
    name: 'Project Memory — Supervisor',
    // Keep the terminal visible after the script exits so the user can read
    // any error output if startup fails.
    isTransient: false,
  });

  if (launchTarget.endsWith('.ps1')) {
    // Run via PowerShell so the script can use PowerShell idioms.
    terminal.sendText(`& '${launchTarget.replace(/'/g, "''")}'`);
  } else {
    // Assume it's a native executable → run directly.
    terminal.sendText(`'${launchTarget.replace(/'/g, "''")}'`);
  }

  terminal.show(/* preserveFocus */ true);
  return terminal;
}

/**
 * Determine the absolute path to the launch target (script or exe).
 * Throws a descriptive error if nothing can be found.
 */
function resolveLaunchTarget(settings: SupervisorSettings): string {
  // 1. Explicit setting takes priority.
  if (settings.launcherPath && settings.launcherPath.trim().length > 0) {
    const p = settings.launcherPath.trim();
    if (!fs.existsSync(p)) {
      throw new Error(
        `[Supervisor] Launch target from supervisor.launcherPath not found: "${p}". ` +
          'Update the setting to point to a valid script or executable.'
      );
    }
    return p;
  }

  // 2. Look for start-supervisor.ps1 in each open workspace root.
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of workspaceFolders) {
    const candidate = path.join(folder.uri.fsPath, 'start-supervisor.ps1');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 3. Nothing found — tell the user how to fix it.
  throw new Error(
    '[Supervisor] Could not locate start-supervisor.ps1 in any workspace folder, ' +
      'and supervisor.launcherPath is not configured. ' +
      'Add the script to your workspace root or set supervisor.launcherPath in settings.'
  );
}
