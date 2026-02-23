/**
 * Status Bar Manager
 * 
 * Manages the VS Code status bar item showing current plan/agent status.
 */

import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private currentAgent: string | null = null;
    private currentPlan: string | null = null;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'projectMemoryDev.showDashboard';
        this.updateDisplay();
        this.statusBarItem.show();
    }

    public setCurrentAgent(agent: string | null): void {
        this.currentAgent = agent;
        this.updateDisplay();
    }

    public setCurrentPlan(plan: string | null): void {
        this.currentPlan = plan;
        this.updateDisplay();
    }

    private updateDisplay(): void {
        if (this.currentAgent && this.currentPlan) {
            this.statusBarItem.text = `$(robot) ${this.currentAgent} · ${this.currentPlan}`;
            this.statusBarItem.tooltip = `Project Memory: ${this.currentAgent} working on "${this.currentPlan}"`;
        } else if (this.currentAgent) {
            this.statusBarItem.text = `$(robot) ${this.currentAgent}`;
            this.statusBarItem.tooltip = `Project Memory: ${this.currentAgent} active`;
        } else {
            this.statusBarItem.text = '$(robot) Project Memory';
            this.statusBarItem.tooltip = 'Click to open Project Memory Dashboard (Dev)';
        }
    }

    /**
     * Show a temporary message in the status bar
     * @param message The message to display
     * @param durationMs How long to show the message (default 3000ms)
     */
    public showTemporaryMessage(message: string, durationMs: number = 3000): void {
        const previousText = this.statusBarItem.text;
        const previousTooltip = this.statusBarItem.tooltip;
        
        this.statusBarItem.text = `$(sync~spin) ${message}`;
        this.statusBarItem.tooltip = message;
        
        setTimeout(() => {
            this.statusBarItem.text = previousText;
            this.statusBarItem.tooltip = previousTooltip;
        }, durationMs);
    }

    /**
     * Update status bar to show Copilot configuration status
     * @param status Object with counts of agents, prompts, instructions
     */
    public setCopilotStatus(status: { agents: number; prompts: number; instructions: number }): void {
        const total = status.agents + status.prompts + status.instructions;
        if (total > 0) {
            this.statusBarItem.text = `$(robot) PM (${status.agents}A/${status.prompts}P/${status.instructions}I)`;
            this.statusBarItem.tooltip = `Project Memory\nAgents: ${status.agents}\nPrompts: ${status.prompts}\nInstructions: ${status.instructions}`;
        } else {
            this.updateDisplay();
        }
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}
