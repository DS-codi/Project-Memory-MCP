import * as vscode from 'vscode';

export interface PlanActionButtonOptions {
    showArchive?: boolean;
    showResume?: boolean;
    showRunBuild?: boolean;
    showAddStep?: boolean;
    showOpenDashboard?: boolean;
}

export interface StepLinkItem {
    index: number;
    phase: string;
    task: string;
    status: string;
}

interface PendingConfirmation {
    actionLabel: string;
    confirmCommandId: string;
    confirmArgs: unknown[];
}

const pendingConfirmations = new Map<string, PendingConfirmation>();

function toCommandLink(commandId: string, args: unknown[]): string {
    const encodedArgs = encodeURIComponent(JSON.stringify(args));
    return `command:${commandId}?${encodedArgs}`;
}

export function createCommandLink(commandId: string, args: unknown[]): string {
    return toCommandLink(commandId, args);
}

export function createPlanIdCommandLink(planId: string, label: string = planId): string {
    return `[${label}](${toCommandLink('projectMemoryDev.showPlanInChat', [planId])})`;
}

export function createTrustedMarkdown(
    value: string,
    enabledCommands: string[] = []
): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString(value, true);
    markdown.isTrusted = { enabledCommands };
    markdown.supportThemeIcons = true;
    return markdown;
}

export async function withProgress<T>(
    stream: vscode.ChatResponseStream,
    message: string,
    action: () => Promise<T>
): Promise<T> {
    stream.progress(message);
    return await action();
}

export function renderPlanActionButtons(
    stream: vscode.ChatResponseStream,
    planId: string,
    options: PlanActionButtonOptions = {},
    workspaceId?: string
): void {
    const {
        showArchive = true,
        showResume = false,
        showRunBuild = true,
        showAddStep = true,
        showOpenDashboard = true,
    } = options;

    if (showResume) {
        stream.button({
            command: 'projectMemoryDev.resumePausedPlan',
            title: 'Resume Plan',
            arguments: [workspaceId, planId]
        });
    }

    if (showArchive) {
        stream.button({
            command: 'projectMemoryDev.archivePlan',
            title: 'Archive Plan',
            arguments: [workspaceId, planId]
        });
    }

    if (showRunBuild) {
        stream.button({
            command: 'projectMemoryDev.runBuildScript',
            title: 'Run Build',
            arguments: [planId]
        });
    }

    if (showAddStep) {
        stream.button({
            command: 'projectMemoryDev.addStepToPlan',
            title: 'Add Step',
            arguments: [planId]
        });
    }

    if (showOpenDashboard) {
        stream.button({
            command: 'projectMemoryDev.openPlanInDashboard',
            title: 'Open in Dashboard',
            arguments: [undefined, planId]
        });
    }
}

export function renderStepCommandLinks(
    stream: vscode.ChatResponseStream,
    steps: StepLinkItem[],
    planId: string
): void {
    if (steps.length === 0) {
        return;
    }

    const lines = steps.map((step) => {
        const actions: string[] = [];
        if (step.status === 'pending') {
            actions.push(`[Start](${toCommandLink('projectMemoryDev.markStepActive', [planId, step.index])})`);
        }
        if (step.status === 'active') {
            actions.push(`[Done](${toCommandLink('projectMemoryDev.markStepDone', [planId, step.index])})`);
        }
        if (step.status === 'blocked') {
            actions.push(`[Create Dedicated Plan](${toCommandLink('projectMemoryDev.createDedicatedPlan', [planId, step.index])})`);
        }

        const prefix =
            step.status === 'done'
                ? '✅'
                : step.status === 'active'
                    ? '🔄'
                    : step.status === 'blocked'
                        ? '🔴'
                        : '⬜';

        const actionSuffix = actions.length > 0 ? ` — ${actions.join(' · ')}` : '';
        return `${prefix} **${step.phase}**: ${step.task}${actionSuffix}`;
    });

    stream.markdown(
        createTrustedMarkdown(
            `${lines.join('\n\n')}\n`,
            ['projectMemoryDev.markStepActive', 'projectMemoryDev.markStepDone', 'projectMemoryDev.createDedicatedPlan']
        )
    );
}

export function renderFileReferences(
    stream: vscode.ChatResponseStream,
    filePaths: string[]
): void {
    const normalized = Array.from(new Set(filePaths.filter((item) => item.trim().length > 0)));
    if (normalized.length === 0) {
        return;
    }

    for (const filePath of normalized) {
        stream.reference(vscode.Uri.file(filePath), new vscode.ThemeIcon('file'));
    }
}

export function showConfirmation(
    stream: vscode.ChatResponseStream,
    actionLabel: string,
    description: string,
    confirmCommandId: string,
    confirmArgs: unknown[] = []
): string {
    const actionId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    pendingConfirmations.set(actionId, {
        actionLabel,
        confirmCommandId,
        confirmArgs,
    });

    stream.markdown(`⚠️ **Confirm ${actionLabel}**\n\n${description}\n`);
    stream.button({
        command: 'projectMemoryDev.confirmAction',
        title: 'Yes',
        arguments: [actionId]
    });
    stream.button({
        command: 'projectMemoryDev.cancelAction',
        title: 'Cancel',
        arguments: [actionId]
    });

    return actionId;
}

export async function confirmPendingAction(actionId: string): Promise<{ executed: boolean; message: string }> {
    const pending = pendingConfirmations.get(actionId);
    if (!pending) {
        return {
            executed: false,
            message: 'No pending action found. It may have already been resolved.'
        };
    }

    pendingConfirmations.delete(actionId);

    await vscode.commands.executeCommand(pending.confirmCommandId, ...pending.confirmArgs);

    return {
        executed: true,
        message: `${pending.actionLabel} confirmed.`
    };
}

export function cancelPendingAction(actionId: string): { cancelled: boolean; message: string } {
    const pending = pendingConfirmations.get(actionId);
    if (!pending) {
        return {
            cancelled: false,
            message: 'No pending action found. It may have already been resolved.'
        };
    }

    pendingConfirmations.delete(actionId);

    return {
        cancelled: true,
        message: `${pending.actionLabel} cancelled.`
    };
}
