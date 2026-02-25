/**
 * WorkspacePlanTreeProvider
 *
 * VS Code TreeDataProvider that renders:
 *   Workspace
 *     └─ Plan (active/archived)
 *          └─ Phase
 *               └─ Step
 *
 * Data comes from the dashboard REST API (GET /api/workspaces,
 * GET /api/plans/workspace/:id, GET /api/plans/:wsId/:planId).
 * No backwards-compatibility shims.
 */

import * as vscode from 'vscode';
import * as http from 'http';

// ─────────────────────────────────────────────────────────────────────────────
// File-path extraction helper (used by StepItem)
// ─────────────────────────────────────────────────────────────────────────────

const FILE_EXTS = '(?:ts|tsx|js|jsx|mjs|cjs|md|json|yaml|yml|toml|rs|py|css|scss|html|sh|ps1)';

/**
 * Extracts the first file-path reference from a text string.
 * Recognises:
 *  - `src/foo/bar.ts`
 *  - `src/foo/bar.ts:42`
 *  - `src/foo/bar.ts#L42`
 *  - `[text](src/foo/bar.ts)`
 *  - Absolute paths (Windows `C:\…` or Unix `/…`)
 */
export function parseFirstFilePath(text: string): { file: string; line?: number } | undefined {
    if (!text) return undefined;

    // Markdown link: [label](path)
    const mdMatch = text.match(/\[.*?\]\(([^)]+)\)/);
    if (mdMatch) {
        return _extractFileAndLine(mdMatch[1]);
    }

    // Absolute Windows path: C:\... or D:\...
    const winAbsMatch = text.match(/[A-Za-z]:\\[^\s]+/);
    if (winAbsMatch) {
        return _extractFileAndLine(winAbsMatch[0]);
    }

    // Absolute Unix path: /home/...
    const unixAbsMatch = text.match(/\/[a-zA-Z_.\-][^\s]*\.[a-zA-Z]{1,5}/);
    if (unixAbsMatch) {
        return _extractFileAndLine(unixAbsMatch[0]);
    }

    // Relative path with a recognised extension
    const relMatch = text.match(
        new RegExp(`(?:^|\\s)([a-zA-Z_./\\\\][^\\s]*\\.${FILE_EXTS})(?:[:#]L?(\\d+))?`, 'i'),
    );
    if (relMatch) {
        const file = relMatch[1];
        const line = relMatch[2] ? parseInt(relMatch[2], 10) : undefined;
        return { file, line };
    }

    return undefined;
}

function _extractFileAndLine(raw: string): { file: string; line?: number } | undefined {
    if (!raw) return undefined;
    // Strip trailing punctuation
    const trimmed = raw.replace(/[.,;)>"\]]+$/, '');
    // Check for :line or #Lline suffix
    const colonMatch = trimmed.match(/^(.*?)(?:[:#]L?(\d+))?$/);
    if (!colonMatch) return undefined;
    return {
        file: colonMatch[1],
        line: colonMatch[2] ? parseInt(colonMatch[2], 10) : undefined,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Types (minimal mirrors of server-side shapes)
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkspaceInfo {
    id: string;
    name: string;
    path: string;
}

export interface PlanSummary {
    plan_id: string;
    title: string;
    description?: string;
    status?: string;       // 'active' | 'archived' | undefined
    archived?: boolean;
    category?: string;
    priority?: string;
    steps?: PlanStep[];
}

export interface PlanStep {
    phase: string;
    task: string;
    status: 'pending' | 'active' | 'done' | 'blocked';
    notes?: string;
    assignee?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree item classes
// ─────────────────────────────────────────────────────────────────────────────

export class WorkspaceItem extends vscode.TreeItem {
    readonly kind = 'workspace' as const;
    constructor(public readonly workspace: WorkspaceInfo) {
        super(workspace.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.id = `ws:${workspace.id}`;
        this.tooltip = workspace.path;
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'workspaceItem';
    }
}

export class PlanItem extends vscode.TreeItem {
    readonly kind = 'plan' as const;
    constructor(
        public readonly plan: PlanSummary,
        public readonly workspaceId: string,
    ) {
        const done = plan.steps?.filter(s => s.status === 'done').length ?? 0;
        const total = plan.steps?.length ?? 0;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const desc = total > 0 ? `${pct}% (${done}/${total})` : undefined;

        super(plan.title, vscode.TreeItemCollapsibleState.Collapsed);
        this.id = `plan:${workspaceId}:${plan.plan_id}`;
        this.description = desc;
        this.tooltip = plan.description ?? plan.title;
        this.iconPath = new vscode.ThemeIcon(
            plan.archived ? 'archive' : 'checklist',
            plan.archived ? undefined : new vscode.ThemeColor('charts.blue'),
        );
        this.contextValue = plan.archived ? 'planItemArchived' : 'planItemActive';
        // Single-click opens plan in dashboard panel
        this.command = {
            command: 'projectMemory.openPlanInDashboard',
            title: 'Open Plan in Dashboard',
            arguments: [workspaceId, plan.plan_id, plan.title],
        };
    }
}

export class PhaseItem extends vscode.TreeItem {
    readonly kind = 'phase' as const;
    constructor(
        public readonly phaseName: string,
        public readonly steps: PlanStep[],
        public readonly workspaceId: string,
        public readonly planId: string,
    ) {
        const done = steps.filter(s => s.status === 'done').length;
        const active = steps.filter(s => s.status === 'active').length;
        super(phaseName, vscode.TreeItemCollapsibleState.Expanded);
        this.id = `phase:${workspaceId}:${planId}:${phaseName}`;
        this.description = `${done}/${steps.length}`;
        this.iconPath = new vscode.ThemeIcon(
            active > 0 ? 'sync~spin' : 'list-ordered',
        );
        this.contextValue = 'phaseItem';
    }
}

export class StepItem extends vscode.TreeItem {
    readonly kind = 'step' as const;
    /** First file-path reference detected in the step's task or notes. */
    public readonly fileRef: { file: string; line?: number } | undefined;

    private static readonly ICONS: Record<string, string> = {
        done: 'check',
        active: 'sync~spin',
        blocked: 'error',
        pending: 'circle-outline',
    };
    private static readonly COLORS: Record<string, string> = {
        done: 'testing.iconPassed',
        active: 'charts.blue',
        blocked: 'testing.iconFailed',
        pending: 'disabledForeground',
    };

    constructor(
        public readonly step: PlanStep,
        public readonly stepIndex: number,
        public readonly workspaceId: string,
        public readonly planId: string,
    ) {
        super(step.task, vscode.TreeItemCollapsibleState.None);
        this.id = `step:${workspaceId}:${planId}:${stepIndex}`;
        this.description = step.assignee ?? undefined;
        this.tooltip = step.notes
            ? new vscode.MarkdownString(`**${step.status}**\n\n${step.notes}`)
            : `Status: ${step.status}`;
        const iconName = StepItem.ICONS[step.status] ?? 'circle-outline';
        const colorId = StepItem.COLORS[step.status];
        this.iconPath = new vscode.ThemeIcon(
            iconName,
            colorId ? new vscode.ThemeColor(colorId) : undefined,
        );

        // Detect file references from task text or notes
        this.fileRef = parseFirstFilePath(step.task) ?? parseFirstFilePath(step.notes ?? '');
        const hasRef = this.fileRef !== undefined;
        this.contextValue = `stepItem:${step.status}${hasRef ? ':hasFileRef' : ''}`;
    }
}

export type TreeNode = WorkspaceItem | PlanItem | PhaseItem | StepItem;

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export class WorkspacePlanTreeProvider
    implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable
{
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    /** Whether to show archived plans too. Toggled via the filter command. */
    private _showArchived = false;

    /** Cache to avoid re-fetching while the user expands nodes. */
    private _workspaceCache: WorkspaceInfo[] | undefined;
    private _planCache = new Map<string, PlanSummary[]>();
    private _stepCache = new Map<string, PlanStep[]>();

    constructor(public dashboardPort: number) {}

    // ── Public API ────────────────────────────────────────────────────────────

    refresh(): void {
        this._workspaceCache = undefined;
        this._planCache.clear();
        this._stepCache.clear();
        this._onDidChangeTreeData.fire();
    }

    toggleArchived(): void {
        this._showArchived = !this._showArchived;
        this._planCache.clear();
        this._onDidChangeTreeData.fire();
    }

    get showArchived(): boolean {
        return this._showArchived;
    }

    // ── TreeDataProvider ──────────────────────────────────────────────────────

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (!element) {
            return this._getWorkspaces();
        }
        if (element.kind === 'workspace') {
            return this._getPlans(element.workspace.id);
        }
        if (element.kind === 'plan') {
            return this._getPhases(element.workspaceId, element.plan.plan_id);
        }
        if (element.kind === 'phase') {
            return element.steps.map((step, i) => {
                // Determine global step index relative to the plan
                const key = `${element.workspaceId}:${element.planId}`;
                const allSteps = this._stepCache.get(key) ?? [];
                const globalIdx = allSteps.indexOf(step);
                return new StepItem(step, globalIdx >= 0 ? globalIdx : i, element.workspaceId, element.planId);
            });
        }
        return [];
    }

    // ── Data fetching ─────────────────────────────────────────────────────────

    private async _getWorkspaces(): Promise<WorkspaceItem[]> {
        if (this._workspaceCache) {
            return this._workspaceCache.map(ws => new WorkspaceItem(ws));
        }
        try {
            const data = await this._get<{ workspaces?: WorkspaceInfo[] }>('/api/workspaces');
            const workspaces = data.workspaces ?? (Array.isArray(data) ? (data as WorkspaceInfo[]) : []);
            this._workspaceCache = workspaces;
            return workspaces.map(ws => new WorkspaceItem(ws));
        } catch {
            return [];
        }
    }

    private async _getPlans(workspaceId: string): Promise<PlanItem[]> {
        if (this._planCache.has(workspaceId)) {
            return this._buildPlanItems(workspaceId, this._planCache.get(workspaceId)!);
        }
        try {
            const data = await this._get<{ plans?: PlanSummary[] } | PlanSummary[]>(
                `/api/plans/workspace/${workspaceId}`,
            );
            const plans: PlanSummary[] = Array.isArray(data)
                ? data
                : (data as { plans?: PlanSummary[] }).plans ?? [];
            this._planCache.set(workspaceId, plans);
            return this._buildPlanItems(workspaceId, plans);
        } catch {
            return [];
        }
    }

    private _buildPlanItems(workspaceId: string, plans: PlanSummary[]): PlanItem[] {
        const filtered = this._showArchived
            ? plans
            : plans.filter(p => !p.archived && p.status !== 'archived');
        return filtered.map(p => new PlanItem(p, workspaceId));
    }

    private async _getPhases(workspaceId: string, planId: string): Promise<PhaseItem[]> {
        const key = `${workspaceId}:${planId}`;
        let steps = this._stepCache.get(key);
        if (!steps) {
            try {
                const plan = await this._get<PlanSummary>(`/api/plans/${workspaceId}/${planId}`);
                steps = plan.steps ?? [];
                this._stepCache.set(key, steps);
            } catch {
                return [];
            }
        }

        // Group steps by phase, preserving insertion order
        const phaseMap = new Map<string, PlanStep[]>();
        for (const step of steps) {
            const phase = step.phase ?? 'Uncategorised';
            if (!phaseMap.has(phase)) phaseMap.set(phase, []);
            phaseMap.get(phase)!.push(step);
        }

        return [...phaseMap.entries()].map(
            ([phaseName, phaseSteps]) =>
                new PhaseItem(phaseName, phaseSteps, workspaceId, planId),
        );
    }

    // ── HTTP helper ───────────────────────────────────────────────────────────

    private _get<T>(path: string): Promise<T> {
        return new Promise((resolve, reject) => {
            const options: http.RequestOptions = {
                hostname: 'localhost',
                port: this.dashboardPort,
                path,
                method: 'GET',
                headers: { Accept: 'application/json' },
            };
            const req = http.request(options, res => {
                let body = '';
                res.on('data', (chunk: Buffer) => (body += chunk.toString()));
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode} for ${path}`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(body) as T);
                    } catch {
                        reject(new Error(`Invalid JSON from ${path}`));
                    }
                });
            });
            req.on('error', reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error(`Timeout fetching ${path}`));
            });
            req.end();
        });
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}
