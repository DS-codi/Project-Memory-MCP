/**
 * SprintTreeProvider
 *
 * VS Code TreeDataProvider that renders:
 *   Workspace
 *     └─ Sprint (active/completed/archived)
 *          └─ Goal (completed/pending)
 *
 * Data comes from the dashboard REST API (GET /api/workspaces,
 * GET /api/sprints/workspace/:id).
 */

import * as vscode from 'vscode';
import * as http from 'http';

// ─────────────────────────────────────────────────────────────────────────────
// Types (minimal mirrors of server-side shapes)
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkspaceInfo {
    id: string;
    name: string;
    path: string;
}

export type SprintStatus = 'active' | 'completed' | 'archived';

export interface Goal {
    goal_id: string;
    sprint_id: string;
    description: string;
    completed: boolean;
    completed_at: string | null;
    created_at: string;
}

export interface Sprint {
    sprint_id: string;
    workspace_id: string;
    attached_plan_id: string | null;
    title: string;
    status: SprintStatus;
    goals: Goal[];
    created_at: string;
    updated_at: string;
}

export interface SprintSummary extends Sprint {
    goal_count: number;
    completed_goal_count: number;
    completion_percentage: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree item classes
// ─────────────────────────────────────────────────────────────────────────────

export class SprintWorkspaceItem extends vscode.TreeItem {
    readonly kind = 'workspace' as const;
    constructor(public readonly workspace: WorkspaceInfo) {
        super(workspace.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.id = `sprint-ws:${workspace.id}`;
        this.tooltip = workspace.path;
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'sprintWorkspaceItem';
    }
}

export class SprintItem extends vscode.TreeItem {
    readonly kind = 'sprint' as const;
    constructor(
        public readonly sprint: SprintSummary,
        public readonly workspaceId: string,
    ) {
        const pct = sprint.completion_percentage ?? 0;
        const done = sprint.completed_goal_count ?? 0;
        const total = sprint.goal_count ?? 0;
        const progress = total > 0 ? `${pct}% (${done}/${total})` : 'No goals';

        super(sprint.title, vscode.TreeItemCollapsibleState.Collapsed);
        this.id = `sprint:${workspaceId}:${sprint.sprint_id}`;
        this.description = progress;
        this.tooltip = new vscode.MarkdownString(
            `**${sprint.title}**\n\n` +
            `Status: ${sprint.status}\n\n` +
            `Goals: ${done}/${total} completed\n\n` +
            (sprint.attached_plan_id ? `Attached to plan: ${sprint.attached_plan_id}` : 'No attached plan'),
        );

        // Icon based on status
        const iconName = sprint.status === 'completed' ? 'check-all' :
                         sprint.status === 'archived' ? 'archive' : 'rocket';
        const color = sprint.status === 'completed' ? 'charts.green' :
                      sprint.status === 'archived' ? undefined : 'charts.blue';
        this.iconPath = new vscode.ThemeIcon(
            iconName,
            color ? new vscode.ThemeColor(color) : undefined,
        );
        this.contextValue = `sprintItem:${sprint.status}`;
    }
}

export class GoalItem extends vscode.TreeItem {
    readonly kind = 'goal' as const;
    constructor(
        public readonly goal: Goal,
        public readonly workspaceId: string,
        public readonly sprintId: string,
    ) {
        super(goal.description, vscode.TreeItemCollapsibleState.None);
        this.id = `goal:${workspaceId}:${sprintId}:${goal.goal_id}`;
        this.tooltip = goal.completed
            ? `Completed: ${goal.completed_at ?? 'Unknown'}`
            : 'Pending';
        this.iconPath = new vscode.ThemeIcon(
            goal.completed ? 'check' : 'circle-outline',
            goal.completed
                ? new vscode.ThemeColor('testing.iconPassed')
                : new vscode.ThemeColor('disabledForeground'),
        );
        this.contextValue = goal.completed ? 'goalItem:completed' : 'goalItem:pending';
    }
}

export type SprintTreeItem = SprintWorkspaceItem | SprintItem | GoalItem;

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export class SprintTreeProvider
    implements vscode.TreeDataProvider<SprintTreeItem>, vscode.Disposable
{
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<SprintTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    /** Whether to show archived sprints. Toggled via filter command. */
    private _showArchived = false;

    /** Cache to avoid re-fetching while the user expands nodes. */
    private _workspaceCache: WorkspaceInfo[] | undefined;
    private _sprintCache = new Map<string, SprintSummary[]>();

    constructor(public dashboardPort: number) {}

    // ── Public API ────────────────────────────────────────────────────────────

    refresh(): void {
        this._workspaceCache = undefined;
        this._sprintCache.clear();
        this._onDidChangeTreeData.fire();
    }

    toggleArchived(): void {
        this._showArchived = !this._showArchived;
        this._sprintCache.clear();
        this._onDidChangeTreeData.fire();
    }

    get showArchived(): boolean {
        return this._showArchived;
    }

    // ── TreeDataProvider ──────────────────────────────────────────────────────

    getTreeItem(element: SprintTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: SprintTreeItem): Promise<SprintTreeItem[]> {
        if (!element) {
            return this._getWorkspaces();
        }
        if (element.kind === 'workspace') {
            return this._getSprints(element.workspace.id);
        }
        if (element.kind === 'sprint') {
            return this._getGoals(element.sprint, element.workspaceId);
        }
        return [];
    }

    // ── Data fetching ─────────────────────────────────────────────────────────

    private async _getWorkspaces(): Promise<SprintWorkspaceItem[]> {
        if (this._workspaceCache) {
            return this._workspaceCache.map(ws => new SprintWorkspaceItem(ws));
        }
        try {
            const data = await this._get<{ workspaces?: WorkspaceInfo[] }>('/api/workspaces');
            const workspaces = data.workspaces ?? (Array.isArray(data) ? (data as WorkspaceInfo[]) : []);
            this._workspaceCache = workspaces;
            return workspaces.map(ws => new SprintWorkspaceItem(ws));
        } catch {
            return [];
        }
    }

    private async _getSprints(workspaceId: string): Promise<SprintItem[]> {
        if (this._sprintCache.has(workspaceId)) {
            return this._buildSprintItems(workspaceId, this._sprintCache.get(workspaceId)!);
        }
        try {
            const includeArchived = this._showArchived ? '?includeArchived=true' : '';
            const data = await this._get<{ sprints?: SprintSummary[]; count?: number } | SprintSummary[]>(
                `/api/sprints/workspace/${workspaceId}${includeArchived}`,
            );
            const sprints: SprintSummary[] = Array.isArray(data)
                ? data
                : data.sprints ?? [];
            this._sprintCache.set(workspaceId, sprints);
            return this._buildSprintItems(workspaceId, sprints);
        } catch {
            return [];
        }
    }

    private _buildSprintItems(workspaceId: string, sprints: SprintSummary[]): SprintItem[] {
        const filtered = this._showArchived
            ? sprints
            : sprints.filter(s => s.status !== 'archived');
        return filtered.map(s => new SprintItem(s, workspaceId));
    }

    private _getGoals(sprint: SprintSummary, workspaceId: string): GoalItem[] {
        return (sprint.goals ?? []).map(goal =>
            new GoalItem(goal, workspaceId, sprint.sprint_id),
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
