"use strict";
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
/**
 * Extension Integration Tests
 *
 * Tests the Project Memory extension activation, commands, and functionality.
 */
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Starting extension tests...');
    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('project-memory.project-memory-dashboard');
        assert.ok(extension, 'Extension should be installed');
    });
    test('Extension should activate', async function () {
        this.timeout(30000); // Extension activation may take time
        const extension = vscode.extensions.getExtension('project-memory.project-memory-dashboard');
        if (extension) {
            await extension.activate();
            assert.ok(extension.isActive, 'Extension should be active after activation');
        }
    });
});
suite('Commands Test Suite', () => {
    test('Show Dashboard command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('projectMemory.showDashboard'), 'showDashboard command should be registered');
    });
    test('Create Plan command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('projectMemory.createPlan'), 'createPlan command should be registered');
    });
    test('Deploy Agents command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('projectMemory.deployAgents'), 'deployAgents command should be registered');
    });
    test('Refresh Data command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('projectMemory.refreshData'), 'refreshData command should be registered');
    });
    test('Open File command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('projectMemory.openFile'), 'openFile command should be registered');
    });
    test('Add to Plan command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('projectMemory.addToPlan'), 'addToPlan command should be registered');
    });
});
suite('Configuration Test Suite', () => {
    test('Configuration section should exist', () => {
        const config = vscode.workspace.getConfiguration('projectMemory');
        assert.ok(config, 'projectMemory configuration section should exist');
    });
    test('dataRoot setting should be accessible', () => {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const dataRoot = config.get('dataRoot');
        // dataRoot can be empty string or undefined, just check it doesn't throw
        assert.ok(dataRoot !== null, 'dataRoot should be accessible');
    });
    test('agentsRoot setting should be accessible', () => {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const agentsRoot = config.get('agentsRoot');
        assert.ok(agentsRoot !== null, 'agentsRoot should be accessible');
    });
    test('autoRefresh setting should have default value', () => {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const autoRefresh = config.get('autoRefresh');
        assert.strictEqual(autoRefresh, true, 'autoRefresh should default to true');
    });
    test('autoDeployAgents setting should have default value', () => {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const autoDeploy = config.get('autoDeployAgents');
        assert.strictEqual(autoDeploy, false, 'autoDeployAgents should default to false');
    });
    test('apiPort setting should have default value', () => {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const apiPort = config.get('apiPort');
        assert.strictEqual(apiPort, 3001, 'apiPort should default to 3001');
    });
});
suite('View Container Test Suite', () => {
    test('Activity Bar view container should exist', async () => {
        // Check if the view container ID is registered
        // This is a basic check - the view may not be visible without activation
        const extension = vscode.extensions.getExtension('project-memory.project-memory-dashboard');
        if (extension) {
            const packageJson = extension.packageJSON;
            const viewContainers = packageJson.contributes?.viewsContainers?.activitybar;
            assert.ok(viewContainers?.some((c) => c.id === 'projectMemory'), 'projectMemory view container should be defined');
        }
    });
    test('Dashboard webview should be defined', async () => {
        const extension = vscode.extensions.getExtension('project-memory.project-memory-dashboard');
        if (extension) {
            const packageJson = extension.packageJSON;
            const views = packageJson.contributes?.views?.projectMemory;
            assert.ok(views?.some((v) => v.id === 'projectMemory.dashboardView'), 'dashboardView should be defined');
        }
    });
});
suite('Menu Contributions Test Suite', () => {
    test('Explorer context menu should have Create Plan', async () => {
        const extension = vscode.extensions.getExtension('project-memory.project-memory-dashboard');
        if (extension) {
            const packageJson = extension.packageJSON;
            const explorerContext = packageJson.contributes?.menus?.['explorer/context'];
            assert.ok(explorerContext?.some((m) => m.command === 'projectMemory.createPlan'), 'createPlan should be in explorer context menu');
        }
    });
    test('Explorer context menu should have Add to Plan', async () => {
        const extension = vscode.extensions.getExtension('project-memory.project-memory-dashboard');
        if (extension) {
            const packageJson = extension.packageJSON;
            const explorerContext = packageJson.contributes?.menus?.['explorer/context'];
            assert.ok(explorerContext?.some((m) => m.command === 'projectMemory.addToPlan'), 'addToPlan should be in explorer context menu');
        }
    });
    test('Editor context menu should have Add to Plan', async () => {
        const extension = vscode.extensions.getExtension('project-memory.project-memory-dashboard');
        if (extension) {
            const packageJson = extension.packageJSON;
            const editorContext = packageJson.contributes?.menus?.['editor/context'];
            assert.ok(editorContext?.some((m) => m.command === 'projectMemory.addToPlan'), 'addToPlan should be in editor context menu');
        }
    });
});
//# sourceMappingURL=extension.test.js.map