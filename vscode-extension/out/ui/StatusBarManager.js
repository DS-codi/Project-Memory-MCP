"use strict";
/**
 * Status Bar Manager
 *
 * Manages the VS Code status bar item showing current plan/agent status.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBarManager = void 0;
const vscode = __importStar(require("vscode"));
class StatusBarManager {
    statusBarItem;
    currentAgent = null;
    currentPlan = null;
    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'projectMemory.showDashboard';
        this.updateDisplay();
        this.statusBarItem.show();
    }
    setCurrentAgent(agent) {
        this.currentAgent = agent;
        this.updateDisplay();
    }
    setCurrentPlan(plan) {
        this.currentPlan = plan;
        this.updateDisplay();
    }
    updateDisplay() {
        if (this.currentAgent && this.currentPlan) {
            this.statusBarItem.text = `$(robot) ${this.currentAgent} · ${this.currentPlan}`;
            this.statusBarItem.tooltip = `Project Memory: ${this.currentAgent} working on "${this.currentPlan}"`;
        }
        else if (this.currentAgent) {
            this.statusBarItem.text = `$(robot) ${this.currentAgent}`;
            this.statusBarItem.tooltip = `Project Memory: ${this.currentAgent} active`;
        }
        else {
            this.statusBarItem.text = '$(robot) Project Memory';
            this.statusBarItem.tooltip = 'Click to open Project Memory Dashboard';
        }
    }
    /**
     * Show a temporary message in the status bar
     * @param message The message to display
     * @param durationMs How long to show the message (default 3000ms)
     */
    showTemporaryMessage(message, durationMs = 3000) {
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
    setCopilotStatus(status) {
        const total = status.agents + status.prompts + status.instructions;
        if (total > 0) {
            this.statusBarItem.text = `$(robot) PM (${status.agents}A/${status.prompts}P/${status.instructions}I)`;
            this.statusBarItem.tooltip = `Project Memory\nAgents: ${status.agents}\nPrompts: ${status.prompts}\nInstructions: ${status.instructions}`;
        }
        else {
            this.updateDisplay();
        }
    }
    dispose() {
        this.statusBarItem.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=StatusBarManager.js.map