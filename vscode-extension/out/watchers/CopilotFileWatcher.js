"use strict";
/**
 * Copilot File Watcher
 *
 * Watches for changes to Copilot-related files: agents, prompts, and instructions.
 * Provides notifications and optional auto-deploy functionality.
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
exports.CopilotFileWatcher = void 0;
const vscode = __importStar(require("vscode"));
const chokidar = __importStar(require("chokidar"));
const path = __importStar(require("path"));
class CopilotFileWatcher {
    watchers = new Map();
    config;
    onFileChange;
    constructor(config) {
        this.config = config;
    }
    start() {
        // Watch agents
        if (this.config.agentsRoot) {
            this.startWatcher('agent', this.config.agentsRoot, '*.agent.md');
        }
        // Watch prompts
        if (this.config.promptsRoot) {
            this.startWatcher('prompt', this.config.promptsRoot, '*.prompt.md');
        }
        // Watch instructions
        if (this.config.instructionsRoot) {
            this.startWatcher('instruction', this.config.instructionsRoot, '*.instructions.md');
        }
    }
    startWatcher(type, rootPath, pattern) {
        if (this.watchers.has(type)) {
            return;
        }
        const fullPattern = path.join(rootPath, pattern);
        const watcher = chokidar.watch(fullPattern, {
            persistent: true,
            ignoreInitial: true
        });
        watcher.on('change', async (filePath) => {
            this.handleFileEvent(type, filePath, 'change');
        });
        watcher.on('add', (filePath) => {
            this.handleFileEvent(type, filePath, 'add');
        });
        watcher.on('unlink', (filePath) => {
            this.handleFileEvent(type, filePath, 'unlink');
        });
        this.watchers.set(type, watcher);
        console.log(`${type} watcher started for: ${fullPattern}`);
    }
    async handleFileEvent(type, filePath, action) {
        const fileName = path.basename(filePath);
        const typeLabels = {
            agent: 'Agent template',
            prompt: 'Prompt file',
            instruction: 'Instruction file'
        };
        const label = typeLabels[type];
        // Emit event for external handlers
        if (this.onFileChange) {
            this.onFileChange(type, filePath, action);
        }
        if (action === 'unlink') {
            vscode.window.showWarningMessage(`${label} deleted: ${fileName}`);
            return;
        }
        if (action === 'add') {
            vscode.window.showInformationMessage(`New ${label.toLowerCase()} detected: ${fileName}`);
            return;
        }
        // Handle change
        if (this.config.autoDeploy) {
            vscode.window.showInformationMessage(`Auto-deploying updated ${label.toLowerCase()}: ${fileName}`);
            this.triggerDeploy(type);
        }
        else {
            const deployAction = await vscode.window.showInformationMessage(`${label} updated: ${fileName}`, 'Deploy to All Workspaces', 'Ignore');
            if (deployAction === 'Deploy to All Workspaces') {
                this.triggerDeploy(type);
            }
        }
    }
    triggerDeploy(type) {
        const commands = {
            agent: 'projectMemory.deployAgents',
            prompt: 'projectMemory.deployPrompts',
            instruction: 'projectMemory.deployInstructions'
        };
        vscode.commands.executeCommand(commands[type]);
    }
    stop() {
        for (const [type, watcher] of this.watchers) {
            watcher.close();
            console.log(`${type} watcher stopped`);
        }
        this.watchers.clear();
    }
    updateConfig(config) {
        // Stop existing watchers
        this.stop();
        // Update config
        this.config = { ...this.config, ...config };
        // Restart with new config
        this.start();
    }
    setAutoDeploy(enabled) {
        this.config.autoDeploy = enabled;
    }
    onFileChanged(handler) {
        this.onFileChange = handler;
    }
    getWatchedPaths() {
        const paths = [];
        if (this.config.agentsRoot) {
            paths.push({ type: 'agent', path: this.config.agentsRoot });
        }
        if (this.config.promptsRoot) {
            paths.push({ type: 'prompt', path: this.config.promptsRoot });
        }
        if (this.config.instructionsRoot) {
            paths.push({ type: 'instruction', path: this.config.instructionsRoot });
        }
        return paths;
    }
}
exports.CopilotFileWatcher = CopilotFileWatcher;
//# sourceMappingURL=CopilotFileWatcher.js.map