/**
 * NotificationService
 *
 * Shows VS Code toast notifications for important plan/agent lifecycle events
 * received from EventSubscriptionService. Respects granular settings and
 * debounces rapid-fire events to avoid notification spam.
 *
 * Settings (all under `projectMemory.notifications.*`):
 *   enabled          — master switch (default: true)
 *   agentHandoffs    — show handoff notifications (default: true)
 *   planComplete     — show plan archived/completed notifications (default: true)
 *   stepBlocked      — show step-blocked notifications (default: true)
 *
 * Debouncing: max 1 notification per (planId + eventCategory) per 5 seconds.
 * Mute: "Mute for 1 hour" action suppresses all notifications for 1 hour.
 */

import * as vscode from 'vscode';
import type { EventSubscriptionService, AgentEvent, PlanEvent, StepEvent } from './EventSubscriptionService';
import type { WorkspaceConfigSyncReport, WorkspaceConfigSyncEntry } from '../server/ConnectionManager';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type NotificationCategory = 'handoff' | 'planComplete' | 'stepBlocked' | 'workspaceSync';

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class NotificationService implements vscode.Disposable {
    private readonly _disposables: vscode.Disposable[] = [];
    private _eventSubs: vscode.Disposable[] = [];

    /** Tracks the last notification time per (planId:category) key. */
    private readonly _lastShown = new Map<string, number>();

    /** Epoch ms until which all notifications are muted. 0 = not muted. */
    private _mutedUntilMs = 0;

    private readonly _debounceMs = 5_000;
    private readonly _workspaceSyncDebounceMs = 15_000;
    private _lastWorkspaceSyncSignature = '';
    private _lastWorkspaceSyncShownAt = 0;

    constructor() {}

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Wire this service to an EventSubscriptionService instance.
     * Safe to call multiple times (replaces previous subscriptions).
     */
    attach(events: EventSubscriptionService): this {
        this._eventSubs.forEach(d => d.dispose());
        this._eventSubs = [
            events.onAgentEvent(e => this._onAgentEvent(e)),
            events.onPlanEvent(e => this._onPlanEvent(e)),
            events.onStepEvent(e => this._onStepEvent(e)),
        ];
        this._disposables.push(...this._eventSubs);
        return this;
    }

    dispose(): void {
        this._disposables.forEach(d => d.dispose());
        this._disposables.length = 0;
    }

    // ── Settings helpers ──────────────────────────────────────────────────────

    private _cfg<T>(key: string, fallback: T): T {
        return vscode.workspace.getConfiguration('projectMemory.notifications').get<T>(key, fallback);
    }

    private _isEnabled(category: NotificationCategory): boolean {
        if (!this._cfg<boolean>('enabled', true)) return false;
        if (this._isMuted()) return false;
        if (category === 'workspaceSync') return true;
        const keyMap: Record<NotificationCategory, string> = {
            handoff: 'agentHandoffs',
            planComplete: 'planComplete',
            stepBlocked: 'stepBlocked',
            workspaceSync: 'enabled',
        };
        return this._cfg<boolean>(keyMap[category], true);
    }

    private _isMuted(): boolean {
        return this._mutedUntilMs > 0 && Date.now() < this._mutedUntilMs;
    }

    // ── Debounce ──────────────────────────────────────────────────────────────

    /**
     * Returns true if this notification should be suppressed by the debouncer.
     * Also records the timestamp when returning false.
     */
    private _debounced(planId: string | undefined, category: NotificationCategory): boolean {
        const key = `${planId ?? '_'}:${category}`;
        const last = this._lastShown.get(key) ?? 0;
        const now = Date.now();
        if (now - last < this._debounceMs) return true;
        this._lastShown.set(key, now);
        return false;
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    private _onAgentEvent(event: AgentEvent): void {
        if (event.type !== 'handoff_completed') return;
        if (!this._isEnabled('handoff')) return;
        if (this._debounced(event.plan_id, 'handoff')) return;

        const fromAgent = (event.data['from_agent'] as string | undefined) ?? event.agent_type ?? 'Agent';
        const toAgent   = (event.data['to_agent']   as string | undefined) ?? 'next agent';
        const planTitle = (event.data['plan_title']  as string | undefined)
            ?? (event.data['plan_id'] as string | undefined)
            ?? event.plan_id
            ?? 'plan';

        const label = `$(arrow-right) ${fromAgent} → ${toAgent} on '${planTitle}'`;
        this._show('information', label, event.workspace_id, event.plan_id);
    }

    private _onPlanEvent(event: PlanEvent): void {
        if (event.type !== 'plan_archived') return;
        if (!this._isEnabled('planComplete')) return;
        if (this._debounced(event.plan_id, 'planComplete')) return;

        const planTitle = (event.data['title'] as string | undefined)
            ?? event.plan_id
            ?? 'Plan';

        const label = `$(check) Plan '${planTitle}' completed!`;
        this._show('information', label, event.workspace_id, event.plan_id);
    }

    private _onStepEvent(event: StepEvent): void {
        const newStatus = (event.data['status'] as string | undefined)
            ?? (event.data['new_status'] as string | undefined);
        if (newStatus !== 'blocked') return;
        if (!this._isEnabled('stepBlocked')) return;
        if (this._debounced(event.plan_id, 'stepBlocked')) return;

        const stepTask = (event.data['task'] as string | undefined)
            ?? (event.data['step_task'] as string | undefined)
            ?? 'a step';

        const label = `$(warning) Step blocked: '${stepTask}'`;
        this._show('warning', label, event.workspace_id, event.plan_id);
    }

    showWorkspaceSyncFindings(report: WorkspaceConfigSyncReport): void {
        if (!this._isEnabled('workspaceSync')) return;

        const actionable = this._collectActionableEntries(report);
        if (actionable.length === 0) return;

        const signature = JSON.stringify({
            summary: report.summary,
            topFindings: actionable.slice(0, 4).map((entry) => `${entry.relative_path}:${entry.status}`),
        });
        const now = Date.now();
        if (
            signature === this._lastWorkspaceSyncSignature
            && (now - this._lastWorkspaceSyncShownAt) < this._workspaceSyncDebounceMs
        ) {
            return;
        }

        this._lastWorkspaceSyncSignature = signature;
        this._lastWorkspaceSyncShownAt = now;

        const severeCount = report.summary.protected_drift + report.summary.content_mismatch;
        const notableCount = severeCount + report.summary.import_candidate;
        const fragments: string[] = [];
        if (report.summary.protected_drift > 0) fragments.push(`${report.summary.protected_drift} protected drift`);
        if (report.summary.content_mismatch > 0) fragments.push(`${report.summary.content_mismatch} mismatch`);
        if (report.summary.import_candidate > 0) fragments.push(`${report.summary.import_candidate} import candidate`);
        if (report.summary.local_only > 0) fragments.push(`${report.summary.local_only} local-only`);
        if (report.summary.db_only > 0) fragments.push(`${report.summary.db_only} DB-only`);
        const topFinding = actionable[0];
        const topFindingSummary = topFinding
            ? ` Top finding: ${topFinding.relative_path} (${topFinding.status}).`
            : '';

        const message = `Project Memory workspace sync: ${fragments.join(', ')}. Passive watcher made no changes.${topFindingSummary}`;
        const promise = notableCount > 0
            ? vscode.window.showWarningMessage(message, 'Show Diagnostics', 'Mute for 1 hour')
            : vscode.window.showInformationMessage(message, 'Show Diagnostics', 'Mute for 1 hour');

        promise.then((choice) => this._handleActionChoice(choice));
    }

    // ── Show helpers ──────────────────────────────────────────────────────────

    private _handleActionChoice(
        choice: string | undefined,
        workspaceId?: string,
        planId?: string,
    ): void {
        if (choice === 'Open Plan') {
            vscode.commands.executeCommand('projectMemory.openPlanInDashboard', workspaceId, planId);
        } else if (choice === 'Show Diagnostics') {
            vscode.commands.executeCommand('projectMemory.showDiagnostics');
        } else if (choice === 'Mute for 1 hour') {
            this._mutedUntilMs = Date.now() + 60 * 60 * 1_000;
            vscode.window.showInformationMessage(
                '$(bell-slash) Project Memory notifications muted for 1 hour.',
            );
        }
    }

    private _show(
        level: 'information' | 'warning',
        message: string,
        workspaceId?: string,
        planId?: string,
    ): void {
        const hasOpenPlan = !!(workspaceId && planId);

        if (level === 'warning') {
            const p = hasOpenPlan
                ? vscode.window.showWarningMessage(message, 'Open Plan', 'Mute for 1 hour')
                : vscode.window.showWarningMessage(message, 'Mute for 1 hour');
            p.then((choice) => this._handleActionChoice(choice, workspaceId, planId));
        } else {
            const p = hasOpenPlan
                ? vscode.window.showInformationMessage(message, 'Open Plan', 'Mute for 1 hour')
                : vscode.window.showInformationMessage(message, 'Mute for 1 hour');
            p.then((choice) => this._handleActionChoice(choice, workspaceId, planId));
        }
    }

    private _collectActionableEntries(report: WorkspaceConfigSyncReport): WorkspaceConfigSyncEntry[] {
        return [...report.agents, ...report.instructions].filter((entry) => (
            entry.status !== 'in_sync' && entry.status !== 'ignored_local'
        ));
    }
}
