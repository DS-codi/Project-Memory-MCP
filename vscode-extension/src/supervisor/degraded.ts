import * as vscode from 'vscode';

/** Tracks the currently displayed degraded-mode status bar item, if any. */
let degradedStatusBarItem: vscode.StatusBarItem | undefined;

/**
 * Enter degraded mode by creating and showing a warning status bar item.
 *
 * The item surface a `$(warning) Supervisor Unavailable` badge with a tooltip
 * set to the supplied `reason` string, and wires up the
 * `project-memory.startSupervisor` command so the user can retry.
 *
 * The item is pushed onto `context.subscriptions` so VS Code disposes it when
 * the extension is deactivated.
 *
 * @param context The extension activation context.
 * @param reason  Human-readable explanation of why the supervisor is unavailable.
 */
export function enterDegradedMode(
  context: vscode.ExtensionContext,
  reason: string
): void {
  // Always clean up any pre-existing item before creating a new one.
  exitDegradedMode();

  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
  item.text = '$(warning) Supervisor Unavailable';
  item.tooltip = reason;
  item.command = 'project-memory.startSupervisor';
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
