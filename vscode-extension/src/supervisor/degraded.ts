import * as vscode from 'vscode';

/** Tracks the currently displayed degraded-mode status bar item, if any. */
let degradedStatusBarItem: vscode.StatusBarItem | undefined;

/**
 * Enter degraded mode by creating and showing a warning status bar item.
 *
 * Shows a `$(play) Launch Supervisor` button that launches the supervisor
 * as a detached process, or `$(folder-opened) Open Directory` if the
 * supervisor script can't be found.
 *
 * The item is pushed onto `context.subscriptions` so VS Code disposes it when
 * the extension is deactivated.
 *
 * @param context The extension activation context.
 * @param reason  Human-readable explanation of why the supervisor is unavailable.
 * @param canLaunch Whether the supervisor can be launched (script exists).
 */
export function enterDegradedMode(
  context: vscode.ExtensionContext,
  reason: string,
  canLaunch: boolean = true
): void {
  // Always clean up any pre-existing item before creating a new one.
  exitDegradedMode();

  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
  
  if (canLaunch) {
    item.text = '$(play) Launch Supervisor';
    item.tooltip = `${reason}\n\nClick to launch Project Memory Supervisor`;
    item.command = 'project-memory-dev.launchSupervisor';
  } else {
    item.text = '$(folder-opened) Open Supervisor Directory';
    item.tooltip = `${reason}\n\nClick to open the supervisor directory`;
    item.command = 'project-memory-dev.openSupervisorDirectory';
  }
  
  item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  item.show();

  context.subscriptions.push(item);
  degradedStatusBarItem = item;
}

/**
 * Exit degraded mode by disposing the warning status bar item.
 *
 * Safe to call when no degraded-mode item is currently active.
 */
export function exitDegradedMode(): void {
  if (degradedStatusBarItem) {
    degradedStatusBarItem.dispose();
    degradedStatusBarItem = undefined;
  }
}
