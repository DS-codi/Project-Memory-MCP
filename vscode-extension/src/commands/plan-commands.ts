/**
 * Plan management commands: create plan, add step to plan.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DashboardViewProvider } from '../providers/DashboardViewProvider';
import { notify, registerWorkspace } from '../utils/helpers';
import { getDashboardFrontendUrl } from '../server/ContainerDetection';

export function registerPlanCommands(
    context: vscode.ExtensionContext,
    dashboardProvider: DashboardViewProvider,
    getServerPort: () => number
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('projectMemory.createPlan', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const serverPort = getServerPort();

            // Ask brainstorm vs create
            const approach = await vscode.window.showQuickPick(
                [
                    { label: '🧠 Brainstorm First', description: 'Explore ideas with an AI agent before creating a formal plan', value: 'brainstorm' },
                    { label: '📝 Create Plan Directly', description: 'Create a formal plan with title, description, and category', value: 'create' }
                ],
                { placeHolder: 'How would you like to start?' }
            );

            if (!approach) return;

            if (approach.value === 'brainstorm') {
                const initialPrompt = await vscode.window.showInputBox({
                    prompt: 'What would you like to brainstorm?',
                    placeHolder: 'Describe the feature, problem, or idea you want to explore...',
                    validateInput: (value) => value.trim() ? null : 'Please enter a description'
                });

                if (!initialPrompt) return;

                try {
                    await vscode.commands.executeCommand('workbench.action.chat.open', {
                        query: `@brainstorm ${initialPrompt}`
                    });
                } catch {
                    const result = await vscode.window.showInformationMessage(
                        'Open GitHub Copilot Chat and use @brainstorm agent with your prompt.',
                        'Copy Prompt'
                    );
                    if (result === 'Copy Prompt') {
                        await vscode.env.clipboard.writeText(`@brainstorm ${initialPrompt}`);
                        notify('Prompt copied to clipboard');
                    }
                }
                return;
            }

            // Direct plan creation
            const title = await vscode.window.showInputBox({
                prompt: 'Enter plan title',
                placeHolder: 'My new feature...',
                validateInput: (value) => value.trim() ? null : 'Title is required'
            });
            if (!title) return;

            const description = await vscode.window.showInputBox({
                prompt: 'Enter plan description',
                placeHolder: 'Describe what this plan will accomplish, the goals, and any context...',
                validateInput: (value) => value.trim().length >= 10 ? null : 'Please provide at least a brief description (10+ characters)'
            });
            if (!description) return;

            const parseListInput = (value?: string): string[] => {
                if (!value) return [];
                return value.split(/[,\n]+/).map(item => item.trim()).filter(item => item.length > 0);
            };

            let templates: Array<{ template: string; label?: string; category?: string }> = [];
            try {
                const response = await fetch(`http://localhost:${serverPort}/api/plans/templates`);
                if (response.ok) {
                    const data: any = await response.json();
                    templates = Array.isArray(data.templates) ? data.templates : [];
                }
            } catch { /* fall through */ }

            if (templates.length === 0) {
                templates = [
                    { template: 'feature', label: 'Feature', category: 'feature' },
                    { template: 'bugfix', label: 'Bug Fix', category: 'bug' },
                    { template: 'refactor', label: 'Refactor', category: 'refactor' },
                    { template: 'documentation', label: 'Documentation', category: 'documentation' },
                    { template: 'analysis', label: 'Analysis', category: 'analysis' },
                    { template: 'investigation', label: 'Investigation', category: 'investigation' }
                ];
            }

            const templatePick = await vscode.window.showQuickPick(
                [
                    { label: 'Custom', description: 'Choose category and define your own steps', value: 'custom' },
                    ...templates.map(t => ({
                        label: t.label || t.template,
                        description: t.category || t.template,
                        value: t.template
                    }))
                ],
                { placeHolder: 'Select a plan template (optional)' }
            );
            if (!templatePick) return;

            const selectedTemplate = templatePick.value !== 'custom' ? templatePick.value : null;
            let selectedCategory: string | null = null;
            let goals: string[] = [];
            let successCriteria: string[] = [];

            if (!selectedTemplate) {
                const category = await vscode.window.showQuickPick(
                    [
                        { label: '✨ Feature', description: 'New functionality or capability', value: 'feature' },
                        { label: '🐛 Bug', description: 'Fix for an existing issue', value: 'bug' },
                        { label: '🔄 Change', description: 'Modification to existing behavior', value: 'change' },
                        { label: '🔍 Analysis', description: 'Investigation or research task', value: 'analysis' },
                        { label: '🧪 Investigation', description: 'Deep-dive analysis with findings', value: 'investigation' },
                        { label: '🐞 Debug', description: 'Debugging session for an issue', value: 'debug' },
                        { label: '♻️ Refactor', description: 'Code improvement without behavior change', value: 'refactor' },
                        { label: '📚 Documentation', description: 'Documentation updates', value: 'documentation' }
                    ],
                    { placeHolder: 'Select plan category' }
                );
                if (!category) return;
                selectedCategory = category.value;
            }

            const priority = await vscode.window.showQuickPick(
                [
                    { label: '🔴 Critical', description: 'Urgent - needs immediate attention', value: 'critical' },
                    { label: '🟠 High', description: 'Important - should be done soon', value: 'high' },
                    { label: '🟡 Medium', description: 'Normal priority', value: 'medium' },
                    { label: '🟢 Low', description: 'Nice to have - when time permits', value: 'low' }
                ],
                { placeHolder: 'Select priority level' }
            );
            if (!priority) return;

            if (!selectedTemplate && selectedCategory === 'investigation') {
                const goalsInput = await vscode.window.showInputBox({
                    prompt: 'Enter investigation goals (comma-separated)',
                    placeHolder: 'Identify root cause, confirm scope'
                });
                goals = parseListInput(goalsInput);

                const criteriaInput = await vscode.window.showInputBox({
                    prompt: 'Enter success criteria (comma-separated)',
                    placeHolder: 'Root cause identified, resolution path defined'
                });
                successCriteria = parseListInput(criteriaInput);

                if (goals.length === 0 || successCriteria.length === 0) {
                    vscode.window.showErrorMessage('Investigation plans require at least 1 goal and 1 success criteria.');
                    return;
                }
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;
            const workspaceId = await registerWorkspace(serverPort, workspacePath);
            if (!workspaceId) {
                vscode.window.showErrorMessage('Failed to register workspace with the dashboard server.');
                return;
            }

            try {
                const payloadBase = {
                    title,
                    description,
                    priority: priority.value,
                    goals: goals.length > 0 ? goals : undefined,
                    success_criteria: successCriteria.length > 0 ? successCriteria : undefined
                };

                const response = selectedTemplate
                    ? await fetch(`http://localhost:${serverPort}/api/plans/${workspaceId}/template`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...payloadBase, template: selectedTemplate })
                    })
                    : await fetch(`http://localhost:${serverPort}/api/plans/${workspaceId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...payloadBase, category: selectedCategory })
                    });

                if (response.ok) {
                    const data: any = await response.json();
                    const planId = data.plan_id || data.plan?.id || data.plan?.plan_id || data.planId;
                    notify(`Plan created: ${title}`, 'Open Dashboard').then(selection => {
                        if (selection === 'Open Dashboard' && planId) {
                            vscode.commands.executeCommand('projectMemory.openDashboardPanel',
                                `${getDashboardFrontendUrl()}/workspace/${workspaceId}/plan/${planId}`);
                        }
                    });
                } else {
                    const error = await response.text();
                    vscode.window.showErrorMessage(`Failed to create plan: ${error}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create plan: ${error}`);
            }
        }),

        vscode.commands.registerCommand('projectMemory.addToPlan', async (uri?: vscode.Uri) => {
            let filePath: string | undefined;
            let selectedText: string | undefined;
            let lineNumber: number | undefined;

            if (uri) {
                filePath = uri.fsPath;
            } else {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    filePath = editor.document.uri.fsPath;
                    const selection = editor.selection;
                    if (!selection.isEmpty) {
                        selectedText = editor.document.getText(selection);
                        lineNumber = selection.start.line + 1;
                    }
                }
            }

            if (!filePath) {
                vscode.window.showErrorMessage('No file selected');
                return;
            }

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const stepTask = await vscode.window.showInputBox({
                prompt: 'Describe the step/task for this file',
                placeHolder: 'e.g., Review and update authentication logic',
                value: selectedText ? `Review: ${selectedText.substring(0, 50)}...` : `Work on ${path.basename(filePath)}`,
            });
            if (!stepTask) return;

            const phase = await vscode.window.showQuickPick(
                ['investigation', 'research', 'analysis', 'planning', 'implementation', 'testing', 'validation', 'review', 'documentation', 'refactor', 'bugfix', 'handoff'],
                { placeHolder: 'Select the phase for this step' }
            );
            if (!phase) return;

            dashboardProvider.postMessage({
                type: 'addStepToPlan',
                data: {
                    task: stepTask,
                    phase: phase,
                    file: filePath,
                    line: lineNumber,
                    notes: selectedText ? `Selected code:\n\`\`\`\n${selectedText.substring(0, 500)}\n\`\`\`` : undefined,
                }
            });

            notify(`Added step to plan: "${stepTask}"`);
        }),

        vscode.commands.registerCommand('projectMemory.viewPrograms', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const serverPort = getServerPort();
            const workspacePath = workspaceFolders[0].uri.fsPath;
            const workspaceId = await registerWorkspace(serverPort, workspacePath);
            if (!workspaceId) {
                vscode.window.showErrorMessage('Failed to register workspace');
                return;
            }

            try {
                const res = await fetch(`http://localhost:${serverPort}/api/programs/${workspaceId}`);
                if (!res.ok) {
                    vscode.window.showInformationMessage('No programs found or programs API not available yet.');
                    return;
                }
                const data: any = await res.json();
                const programs: Array<{ program_id: string; name: string; plans: unknown[] }> = data.programs || [];

                if (programs.length === 0) {
                    vscode.window.showInformationMessage('No programs found for this workspace.');
                    return;
                }

                const pick = await vscode.window.showQuickPick(
                    programs.map((p) => ({
                        label: p.name,
                        description: `${p.plans.length} plan${p.plans.length !== 1 ? 's' : ''}`,
                        value: p.program_id,
                    })),
                    { placeHolder: 'Select a program to view in the dashboard' },
                );

                if (pick) {
                    vscode.commands.executeCommand(
                        'projectMemory.openDashboardPanel',
                        `${getDashboardFrontendUrl()}/workspace/${workspaceId}/program/${pick.value}`,
                    );
                }
            } catch {
                vscode.window.showInformationMessage('Programs feature requires the dashboard server to be running.');
            }
        }),

        vscode.commands.registerCommand('projectMemory.markStepActive', async (planId?: string, stepIndex?: number) => {
            const safePlanId = typeof planId === 'string' ? planId : '';
            const safeStepIndex = Number.isInteger(stepIndex) ? Number(stepIndex) : -1;

            if (!safePlanId || safeStepIndex < 0) {
                return;
            }

            dashboardProvider.postMessage({
                type: 'markPlanStepStatus',
                data: {
                    planId: safePlanId,
                    stepIndex: safeStepIndex,
                    status: 'active',
                }
            });
        }),

        vscode.commands.registerCommand('projectMemory.markStepDone', async (planId?: string, stepIndex?: number) => {
            const safePlanId = typeof planId === 'string' ? planId : '';
            const safeStepIndex = Number.isInteger(stepIndex) ? Number(stepIndex) : -1;

            if (!safePlanId || safeStepIndex < 0) {
                return;
            }

            dashboardProvider.postMessage({
                type: 'markPlanStepStatus',
                data: {
                    planId: safePlanId,
                    stepIndex: safeStepIndex,
                    status: 'done',
                }
            });
        }),

        vscode.commands.registerCommand('projectMemory.archivePlan', async (planId?: string, workspaceId?: string) => {
            dashboardProvider.postMessage({
                type: 'archivePlan',
                data: {
                    planId: typeof planId === 'string' ? planId : undefined,
                    workspaceId: typeof workspaceId === 'string' ? workspaceId : undefined,
                }
            });
        }),

        vscode.commands.registerCommand('projectMemory.confirmPlanStep', async (planId?: string, stepIndex?: number) => {
            dashboardProvider.postMessage({
                type: 'confirmPlanStep',
                data: {
                    planId: typeof planId === 'string' ? planId : undefined,
                    stepIndex: Number.isInteger(stepIndex) ? Number(stepIndex) : undefined,
                }
            });
        }),

        vscode.commands.registerCommand('projectMemory.confirmPlanPhase', async (planId?: string, phaseName?: string) => {
            dashboardProvider.postMessage({
                type: 'confirmPlanPhase',
                data: {
                    planId: typeof planId === 'string' ? planId : undefined,
                    phaseName: typeof phaseName === 'string' ? phaseName : undefined,
                }
            });
        }),

        vscode.commands.registerCommand('projectMemory.confirmAction', async () => {
            dashboardProvider.postMessage({
                type: 'confirmAction',
            });
        }),

        vscode.commands.registerCommand('projectMemory.cancelAction', async () => {
            dashboardProvider.postMessage({
                type: 'cancelAction',
            });
        })
    );
}
