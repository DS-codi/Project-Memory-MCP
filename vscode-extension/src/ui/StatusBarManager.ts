/**
 * Status Bar Manager
 *
 * Shows real-time agent/plan activity in the VS Code status bar.
 * When an EventSubscriptionService is attached, the bar updates live as
 * agents start, hand off, and complete work.
 *
 * Color coding:
 *   - Idle: default
 *   - Agent active <5 min: default
 *   - Agent active ≥5 min (long-running): warning (yellow)
 *   - Step blocked: error (red)
 */

import * as vscode from 'vscode';
import type { EventSubscriptionService, AgentEvent, StepEvent } from '../services/EventSubscriptionService';

interface AgentState {
    agentType: string;
    planTitle: string | null;
    planId: string | null;
    workspaceId: string | null;
    sessionStartMs: number;
    currentStep: string | null;
    hasBlockedStep: boolean;
    /** During a handoff: 'Executor → Reviewer'. Cleared after new agent arrives. */
    transitionLabel: string | null;
}

export class StatusBarManager implements vscode.Disposable {
    private readonly _item: vscode.StatusBarItem;
    private _state: AgentState | null = null;
    private _flashTimer: ReturnType<typeof setTimeout> | null = null;
    private _staleTimer: ReturnType<typeof setInterval> | null = null;
    private readonly _disposables: vscode.Disposable[] = [];

    constructor() {
        this._item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100,
        );
        this._item.command = 'projectMemory.showDashboard';
        this._update();
        this._item.show();
    }

    // ── EventSubscriptionService wiring ──────────────────────────────────────

    /**
     * Attach the EventSubscriptionService. Call once during extension activation
     * after both services are constructed.
     */
    attach(events: EventSubscriptionService): void {
        this._disposables.push(
            events.onAgentEvent(e => this._handleAgentEvent(e)),
            events.onStepEvent(e => this._handleStepEvent(e)),
        );
    }

    // ── Legacy / direct setters (kept for other callers) ─────────────────────

    setCurrentAgent(agent: string | null): void {
        if (!agent) {
            this._clearState();
        } else {
            this._state = this._state
                ? { ...this._state, agentType: agent }
                : {
                    agentType: agent,
                    planTitle: null,
                    planId: null,
                    workspaceId: null,
                    sessionStartMs: Date.now(),
                    currentStep: null,
                    hasBlockedStep: false,
                    transitionLabel: null,
                };
        }
        this._update();
    }

    setCurrentPlan(plan: string | null): void {
        if (this._state) {
            this._state = { ...this._state, planTitle: plan };
            this._update();
        }
    }

    showTemporaryMessage(message: string, durationMs = 3000): void {
        const prev = this._item.text;
        const prevTip = this._item.tooltip;
        this._item.text = `$(sync~spin) ${message}`;
        this._item.tooltip = message;
        this._clearFlashTimer();
        this._flashTimer = setTimeout(() => {
            this._item.text = prev;
            this._item.tooltip = prevTip;
        }, durationMs);
    }

    /** Update status bar with deployment summary counts. */
    setCopilotStatus(status: { agents: number; prompts: number; instructions: number }): void {
        const total = status.agents + status.prompts + status.instructions;
        if (total > 0) {
            this._item.text = `$(robot) PM (${status.agents}A/${status.prompts}P/${status.instructions}I)`;
            this._item.tooltip = `Project Memory\nAgents: ${status.agents}\nPrompts: ${status.prompts}\nInstructions: ${status.instructions}`;
        } else {
            this._update();
        }
    }

    dispose(): void {
        this._clearFlashTimer();
        this._clearStaleTimer();
        for (const d of this._disposables) { d.dispose(); }
        this._item.dispose();
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    private _handleAgentEvent(event: AgentEvent): void {
        switch (event.type) {
            case 'agent_session_started': {
                const planTitle = (event.data.plan_title as string | undefined)
                    ?? (event.data.title as string | undefined)
                    ?? null;
                this._state = {
                    agentType: event.agent_type ?? 'Agent',
                    planTitle,
                    planId: event.plan_id ?? null,
                    workspaceId: event.workspace_id ?? null,
                    sessionStartMs: Date.now(),
                    currentStep: null,
                    hasBlockedStep: false,
                    transitionLabel: null,
                };
                this._startStaleTimer();
                this._update();
                break;
            }

            case 'agent_session_completed': {
                const completedAgent = this._state?.agentType ?? 'Agent';
                const completedPlan = this._state?.planTitle ?? null;
                this._clearState();
                this._clearStaleTimer();
                this._update();
                this.showTemporaryMessage(
                    completedPlan
                        ? `$(check) ${completedAgent} done on "${completedPlan}"`
                        : `$(check) ${completedAgent} done`,
                    2500,
                );
                break;
            }

            case 'handoff_started': {
                const fromAgent = event.agent_type
                    ?? (event.data.from_agent as string | undefined)
                    ?? this._state?.agentType
                    ?? 'Agent';
                const toAgent = (event.data.to_agent as string | undefined) ?? '…';
                if (this._state) {
                    this._state = { ...this._state, transitionLabel: `${fromAgent} → ${toAgent}` };
                }
                this._update();
                break;
            }

            case 'handoff_completed': {
                const newAgent = event.agent_type
                    ?? (event.data.to_agent as string | undefined)
                    ?? null;
                if (this._state && newAgent) {
                    this._state = {
                        ...this._state,
                        agentType: newAgent,
                        sessionStartMs: Date.now(),
                        transitionLabel: null,
                        hasBlockedStep: false,
                        currentStep: null,
                    };
                }
                this._update();
                break;
            }
        }
    }

    private _handleStepEvent(event: StepEvent): void {
        if (!this._state) { return; }
        const status = event.data.status as string | undefined;
        const task = event.data.task as string | undefined;
        if (status === 'active' && task) {
            this._state = { ...this._state, currentStep: task, hasBlockedStep: false };
        } else if (status === 'blocked') {
            this._state = { ...this._state, hasBlockedStep: true, currentStep: task ?? this._state.currentStep };
        } else if (status === 'done' && this._state.currentStep === task) {
            this._state = { ...this._state, currentStep: null };
        }
        this._update();
    }

    // ── Display ───────────────────────────────────────────────────────────────

    private _update(): void {
        if (!this._state) {
            this._item.text = '$(robot) Project Memory';
            this._item.tooltip = 'Click to open Project Memory Dashboard';
            this._item.backgroundColor = undefined;
            this._item.color = undefined;
            return;
        }

        const { agentType, planTitle, transitionLabel, hasBlockedStep, sessionStartMs, currentStep } = this._state;
        const sessionDurationMs = Date.now() - sessionStartMs;
        const isLongRunning = sessionDurationMs >= 5 * 60 * 1000;

        // Text
        let text: string;
        if (transitionLabel) {
            text = `$(arrow-right) ${transitionLabel}`;
        } else if (planTitle) {
            text = `$(robot) ${agentType} · ${this._truncate(planTitle, 24)}`;
        } else {
            text = `$(robot) ${agentType}`;
        }
        this._item.text = text;

        // Background color
        if (hasBlockedStep) {
            this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            this._item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
        } else if (isLongRunning) {
            this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this._item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
        } else {
            this._item.backgroundColor = undefined;
            this._item.color = undefined;
        }

        // Tooltip
        const tip = new vscode.MarkdownString('', true);
        tip.isTrusted = true;
        tip.appendMarkdown(`**$(robot) ${agentType}**`);
        if (planTitle) {
            tip.appendMarkdown(`\n\nPlan: _${planTitle}_`);
        }
        if (currentStep) {
            tip.appendMarkdown(`\n\nStep: ${this._truncate(currentStep, 60)}`);
        }
        if (hasBlockedStep) {
            tip.appendMarkdown(`\n\n$(error) Step blocked`);
        }
        tip.appendMarkdown(`\n\nSession: ${this._formatDuration(sessionDurationMs)}`);
        tip.appendMarkdown(`\n\n---\n_Click to open dashboard_`);
        this._item.tooltip = tip;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _clearState(): void {
        this._state = null;
    }

    private _startStaleTimer(): void {
        this._clearStaleTimer();
        // Refresh display every 60s so the "long-running" colour kicks in correctly
        this._staleTimer = setInterval(() => this._update(), 60_000);
    }

    private _clearStaleTimer(): void {
        if (this._staleTimer !== null) {
            clearInterval(this._staleTimer);
            this._staleTimer = null;
        }
    }

    private _clearFlashTimer(): void {
        if (this._flashTimer !== null) {
            clearTimeout(this._flashTimer);
            this._flashTimer = null;
        }
    }

    private _truncate(s: string, maxLen: number): string {
        return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + '…';
    }

    private _formatDuration(ms: number): string {
        const totalSec = Math.floor(ms / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    }
}
