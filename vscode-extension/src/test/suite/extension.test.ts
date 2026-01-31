/**
 * Extension Integration Tests
 * 
 * Tests the Project Memory extension activation, commands, and functionality.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Starting extension tests...');

    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('project-memory.project-memory-dashboard');
        assert.ok(extension, 'Extension should be installed');
    });

    test('Extension should activate', async function() {
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
        assert.ok(
            commands.includes('projectMemory.showDashboard'),
            'showDashboard command should be registered'
        );
    });

    test('Create Plan command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('projectMemory.createPlan'),
            'createPlan command should be registered'
        );
    });

    test('Deploy Agents command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('projectMemory.deployAgents'),
            'deployAgents command should be registered'
        );
    });

    test('Refresh Data command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('projectMemory.refreshData'),
            'refreshData command should be registered'
        );
    });

    test('Open File command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('projectMemory.openFile'),
            'openFile command should be registered'
        );
    });

    test('Add to Plan command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('projectMemory.addToPlan'),
            'addToPlan command should be registered'
        );
    });
});

suite('Configuration Test Suite', () => {
    test('Configuration section should exist', () => {
        const config = vscode.workspace.getConfiguration('projectMemory');
        assert.ok(config, 'projectMemory configuration section should exist');
    });

    test('dataRoot setting should be accessible', () => {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const dataRoot = config.get<string>('dataRoot');
        // dataRoot can be empty string or undefined, just check it doesn't throw
        assert.ok(dataRoot !== null, 'dataRoot should be accessible');
    });

    test('agentsRoot setting should be accessible', () => {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const agentsRoot = config.get<string>('agentsRoot');
        assert.ok(agentsRoot !== null, 'agentsRoot should be accessible');
    });

    test('autoRefresh setting should have default value', () => {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const autoRefresh = config.get<boolean>('autoRefresh');
        assert.strictEqual(autoRefresh, true, 'autoRefresh should default to true');
    });

    test('autoDeployAgents setting should have default value', () => {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const autoDeploy = config.get<boolean>('autoDeployAgents');
        assert.strictEqual(autoDeploy, false, 'autoDeployAgents should default to false');
    });

    test('apiPort setting should have default value', () => {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const apiPort = config.get<number>('apiPort');
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
            assert.ok(
                viewContainers?.some((c: { id: string }) => c.id === 'projectMemory'),
                'projectMemory view container should be defined'
            );
        }
    });

    test('Dashboard webview should be defined', async () => {
        const extension = vscode.extensions.getExtension('project-memory.project-memory-dashboard');
        if (extension) {
            const packageJson = extension.packageJSON;
            const views = packageJson.contributes?.views?.projectMemory;
            assert.ok(
                views?.some((v: { id: string }) => v.id === 'projectMemory.dashboardView'),
                'dashboardView should be defined'
            );
        }
    });
});

suite('Menu Contributions Test Suite', () => {
    test('Explorer context menu should have Create Plan', async () => {
        const extension = vscode.extensions.getExtension('project-memory.project-memory-dashboard');
        if (extension) {
            const packageJson = extension.packageJSON;
            const explorerContext = packageJson.contributes?.menus?.['explorer/context'];
            assert.ok(
                explorerContext?.some((m: { command: string }) => m.command === 'projectMemory.createPlan'),
                'createPlan should be in explorer context menu'
            );
        }
    });

    test('Explorer context menu should have Add to Plan', async () => {
        const extension = vscode.extensions.getExtension('project-memory.project-memory-dashboard');
        if (extension) {
            const packageJson = extension.packageJSON;
            const explorerContext = packageJson.contributes?.menus?.['explorer/context'];
            assert.ok(
                explorerContext?.some((m: { command: string }) => m.command === 'projectMemory.addToPlan'),
                'addToPlan should be in explorer context menu'
            );
        }
    });

    test('Editor context menu should have Add to Plan', async () => {
        const extension = vscode.extensions.getExtension('project-memory.project-memory-dashboard');
        if (extension) {
            const packageJson = extension.packageJSON;
            const editorContext = packageJson.contributes?.menus?.['editor/context'];
            assert.ok(
                editorContext?.some((m: { command: string }) => m.command === 'projectMemory.addToPlan'),
                'addToPlan should be in editor context menu'
            );
        }
    });
});
