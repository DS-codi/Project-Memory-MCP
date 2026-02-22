import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { SupervisorSettings } from './settings';

/**
 * Launch the Supervisor as a completely detached process using PowerShell Start-Process.
 * 
 * This creates a process that is fully independent of VS Code - it will continue
 * running even if VS Code crashes or closes. Uses PowerShell Start-Process to
 * ensure complete process tree detachment on Windows.
 *
 * @param settings Supervisor settings read from workspace configuration.
 * @throws {Error} If no launch script or executable can be located.
 */
export function launchSupervisorDetached(settings: SupervisorSettings): void {
  const launchTarget = resolveLaunchTarget(settings);

  // Use PowerShell Start-Process for complete detachment
  // -WindowStyle Hidden runs in background
  // Process survives even if VS Code closes
  const psCommand = launchTarget.endsWith('.ps1')
    ? `Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-File", "${launchTarget.replace(/\\/g, '\\\\')}" -WindowStyle Hidden`
    : `Start-Process "${launchTarget.replace(/\\/g, '\\\\')}" -WindowStyle Hidden`;

  cp.exec(psCommand, { shell: 'powershell.exe' }, (error) => {
    if (error) {
      vscode.window.showErrorMessage(
        `Failed to launch Supervisor: ${error.message}\n\n` +
        `Try running manually: ${launchTarget}`
      );
    } else {
      vscode.window.showInformationMessage(
        'Supervisor launched in background. Checking for connection...'
      );
    }
  });
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
 * Get the supervisor directory path (to open in Explorer).
 * Returns the first workspace folder that contains start-supervisor.ps1,
 * or the configured launcher path directory, or null if not found.
 */
export function getSupervisorDirectory(settings: SupervisorSettings): string | null {
  // 1. Check explicit setting
  if (settings.launcherPath && settings.launcherPath.trim().length > 0) {
    const p = settings.launcherPath.trim();
    if (fs.existsSync(p)) {
      return path.dirname(p);
    }
  }

  // 2. Look for start-supervisor.ps1 in workspace roots
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of workspaceFolders) {
    const candidate = path.join(folder.uri.fsPath, 'start-supervisor.ps1');
    if (fs.existsSync(candidate)) {
      return folder.uri.fsPath;
    }
  }

  return null;
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

  // 3. Look for _deprecated_start-supervisor.ps1 as fallback
  for (const folder of workspaceFolders) {
    const candidate = path.join(folder.uri.fsPath, '_deprecated_start-supervisor.ps1');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 4. Nothing found — tell the user how to fix it.
  throw new Error(
    '[Supervisor] Could not locate start-supervisor.ps1 in any workspace folder, ' +
      'and supervisor.launcherPath is not configured. ' +
      'Add the script to your workspace root or set supervisor.launcherPath in settings.'
  );
}
