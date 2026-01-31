"use strict";
/**
 * Agent Watcher
 *
 * Watches for changes to agent template files and optionally auto-deploys.
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
exports.AgentWatcher = void 0;
const vscode = __importStar(require("vscode"));
const chokidar = __importStar(require("chokidar"));
const path = __importStar(require("path"));
class AgentWatcher {
    watcher = null;
    agentsRoot;
    autoDeploy;
    constructor(agentsRoot, autoDeploy) {
        this.agentsRoot = agentsRoot;
        this.autoDeploy = autoDeploy;
    }
    start() {
        if (this.watcher) {
            return;
        }
        const pattern = path.join(this.agentsRoot, '*.agent.md');
        this.watcher = chokidar.watch(pattern, {
            persistent: true,
            ignoreInitial: true
        });
        this.watcher.on('change', async (filePath) => {
            const agentName = path.basename(filePath, '.agent.md');
            if (this.autoDeploy) {
                // Auto-deploy the agent
                vscode.window.showInformationMessage(`Deploying updated agent: ${agentName}`);
                // TODO: Call deploy API
            }
            else {
                // Show notification with action
                const action = await vscode.window.showInformationMessage(`Agent template updated: ${agentName}`, 'Deploy to All Workspaces', 'Ignore');
                if (action === 'Deploy to All Workspaces') {
                    vscode.commands.executeCommand('projectMemory.deployAgents');
                }
            }
        });
        this.watcher.on('add', (filePath) => {
            const agentName = path.basename(filePath, '.agent.md');
            vscode.window.showInformationMessage(`New agent template detected: ${agentName}`);
        });
        console.log(`Agent watcher started for: ${pattern}`);
    }
    stop() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            console.log('Agent watcher stopped');
        }
    }
    setAutoDeploy(enabled) {
        this.autoDeploy = enabled;
    }
}
exports.AgentWatcher = AgentWatcher;
//# sourceMappingURL=AgentWatcher.js.map