/**
 * LibraryTreeProvider
 *
 * VS Code TreeDataProvider that renders Skills, Agents, and Instructions
 * from the ProjectMemory database. Each item exposes four inline actions:
 *
 *   Open in Dashboard  – navigate to the item in the PM dashboard
 *   Open in Editor     – pull content from DB into a temp file and open it
 *   Save               – write the temp file back to DB (only when temp exists)
 *   Copy Reference     – copy a machine-readable MCP reference to the clipboard
 *
 * Temp files live at: <os.tmpdir()>/project-memory-library/<kind>/<name>
 * contextValue is `libraryItem` (no temp) or `libraryItemDirty` (temp exists).
 */

import * as vscode from 'vscode';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LibraryKind = 'agents' | 'skills' | 'instructions';

export interface LibraryRecord {
    name: string;
    content?: string;
    description?: string;
    is_permanent?: boolean;
    updated_at?: string;
    applies_to?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree item classes
// ─────────────────────────────────────────────────────────────────────────────

export class LibraryGroupItem extends vscode.TreeItem {
    readonly kind = 'group' as const;
    constructor(
        public readonly libraryKind: LibraryKind,
        public readonly count: number,
    ) {
        const labels: Record<LibraryKind, string> = {
            agents: 'Agents',
            skills: 'Skills',
            instructions: 'Instructions',
        };
        const icons: Record<LibraryKind, string> = {
            agents: 'robot',
            skills: 'symbol-misc',
            instructions: 'book',
        };
        super(labels[libraryKind], vscode.TreeItemCollapsibleState.Collapsed);
        this.id = `library-group:${libraryKind}`;
        this.description = String(count);
        this.iconPath = new vscode.ThemeIcon(icons[libraryKind]);
        this.contextValue = 'libraryGroup';
    }
}

export class LibraryItem extends vscode.TreeItem {
    readonly kind = 'item' as const;
    public readonly tempFilePath: string;

    constructor(
        public readonly record: LibraryRecord,
        public readonly libraryKind: LibraryKind,
    ) {
        super(record.name, vscode.TreeItemCollapsibleState.None);
        this.id = `library-item:${libraryKind}:${record.name}`;

        // Determine temp file path and contextValue
        this.tempFilePath = getTempFilePath(libraryKind, record.name);
        const hasTempFile = fs.existsSync(this.tempFilePath);
        this.contextValue = hasTempFile ? 'libraryItemDirty' : 'libraryItem';

        // Description/tooltip
        this.description = record.description ?? record.applies_to ?? undefined;
        if (record.updated_at) {
            const date = new Date(record.updated_at);
            this.tooltip = new vscode.MarkdownString(
                `**${record.name}**\n\n` +
                (record.description ? `${record.description}\n\n` : '') +
                `Updated: ${date.toLocaleDateString()}` +
                (hasTempFile ? '\n\n*Local draft exists*' : ''),
            );
        } else {
            this.tooltip = record.name;
        }

        // Icon: dirty = pencil, permanent agent = shield, otherwise kind icon
        if (hasTempFile) {
            this.iconPath = new vscode.ThemeIcon('pencil', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
        } else if (record.is_permanent) {
            this.iconPath = new vscode.ThemeIcon('shield', new vscode.ThemeColor('charts.green'));
        } else {
            const icons: Record<LibraryKind, string> = {
                agents: 'symbol-method',
                skills: 'symbol-misc',
                instructions: 'symbol-file',
            };
            this.iconPath = new vscode.ThemeIcon(icons[libraryKind]);
        }
    }
}

export type LibraryNode = LibraryGroupItem | LibraryItem;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getTempFilePath(kind: LibraryKind, name: string): string {
    const ext = kind === 'skills' ? '.skill.md' : kind === 'instructions' ? '.instructions.md' : '.agent.md';
    const safeName = name.replace(/[/\\:*?"<>|]/g, '_');
    return path.join(os.tmpdir(), 'project-memory-library', kind, `${safeName}${ext}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export class LibraryTreeProvider
    implements vscode.TreeDataProvider<LibraryNode>, vscode.Disposable
{
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<LibraryNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _cache = new Map<LibraryKind, LibraryRecord[]>();

    constructor(public dashboardPort: number) {}

    // ── Public API ────────────────────────────────────────────────────────────

    refresh(): void {
        this._cache.clear();
        this._onDidChangeTreeData.fire();
    }

    /** Refresh just one item (e.g. after saving to update contextValue). */
    refreshItem(item: LibraryItem): void {
        this._onDidChangeTreeData.fire(item);
    }

    /** Invalidate cached records for one kind and re-fire the group. */
    refreshKind(kind: LibraryKind): void {
        this._cache.delete(kind);
        this._onDidChangeTreeData.fire();
    }

    // ── TreeDataProvider ──────────────────────────────────────────────────────

    getTreeItem(element: LibraryNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: LibraryNode): Promise<LibraryNode[]> {
        if (!element) {
            // Root: fetch counts for all three groups in parallel
            const [agents, skills, instructions] = await Promise.all([
                this._fetchRecords('agents'),
                this._fetchRecords('skills'),
                this._fetchRecords('instructions'),
            ]);
            return [
                new LibraryGroupItem('agents', agents.length),
                new LibraryGroupItem('skills', skills.length),
                new LibraryGroupItem('instructions', instructions.length),
            ];
        }

        if (element.kind === 'group') {
            const records = await this._fetchRecords(element.libraryKind);
            return records.map(r => new LibraryItem(r, element.libraryKind));
        }

        return [];
    }

    // ── Data fetching ─────────────────────────────────────────────────────────

    private async _fetchRecords(kind: LibraryKind): Promise<LibraryRecord[]> {
        if (this._cache.has(kind)) return this._cache.get(kind)!;

        try {
            const data = await this._get<Record<string, unknown>>(`/api/${kind}/db`);
            // Response shapes:
            //   agents:       { agents: [...] }
            //   skills:       { skills: [...] }
            //   instructions: { instructions: [...] }
            const records = (data[kind] ?? []) as LibraryRecord[];
            const sorted = [...records].sort((a, b) => a.name.localeCompare(b.name));
            this._cache.set(kind, sorted);
            return sorted;
        } catch {
            return [];
        }
    }

    // ── HTTP helper ───────────────────────────────────────────────────────────

    private _get<T>(apiPath: string): Promise<T> {
        return new Promise((resolve, reject) => {
            const options: http.RequestOptions = {
                hostname: 'localhost',
                port: this.dashboardPort,
                path: apiPath,
                method: 'GET',
                headers: { Accept: 'application/json' },
            };
            const req = http.request(options, res => {
                let body = '';
                res.on('data', (chunk: Buffer) => (body += chunk.toString()));
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode} for ${apiPath}`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(body) as T);
                    } catch {
                        reject(new Error(`Invalid JSON from ${apiPath}`));
                    }
                });
            });
            req.on('error', reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error(`Timeout fetching ${apiPath}`));
            });
            req.end();
        });
    }

    _put(apiPath: string, body: Record<string, unknown>): Promise<void> {
        return new Promise((resolve, reject) => {
            const bodyStr = JSON.stringify(body);
            const options: http.RequestOptions = {
                hostname: 'localhost',
                port: this.dashboardPort,
                path: apiPath,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(bodyStr),
                    Accept: 'application/json',
                },
            };
            const req = http.request(options, res => {
                res.resume(); // drain
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode} for PUT ${apiPath}`));
                    } else {
                        resolve();
                    }
                });
            });
            req.on('error', reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error(`Timeout PUT ${apiPath}`));
            });
            req.write(bodyStr);
            req.end();
        });
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}
