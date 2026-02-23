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
        const extension = vscode.extensions.getExtension('project-memory-dev.project-memory-dashboard-dev-dev-dev');
        assert.ok(extension, 'Extension should be installed');
    });

    test('Extension should activate', async function() {
        this.timeout(30000); // Extension activation may take time
        
        const extension = vscode.extensions.getExtension('project-memory-dev.project-memory-dashboard-dev-dev-dev');
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
            commands.includes('projectMemoryDev.showDashboard'),
            'showDashboard command should be registered'
        );
    });

    test('Create Plan command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('projectMemoryDev.createPlan'),
            'createPlan command should be registered'
        );
    });

    test('Deploy Agents command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('projectMemoryDev.deployAgents'),
            'deployAgents command should be registered'
        );
    });

    test('Refresh Data command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('projectMemoryDev.refreshData'),
            'refreshData command should be registered'
        );
    });

    test('Open File command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('projectMemoryDev.openFile'),
            'openFile command should be registered'
        );
    });

    test('Add to Plan command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('projectMemoryDev.addToPlan'),
            'addToPlan command should be registered'
        );
    });

    test('Mark Step commands should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('projectMemoryDev.markStepActive'),
            'markStepActive command should be registered'
        );
        assert.ok(
            commands.includes('projectMemoryDev.markStepDone'),
            'markStepDone command should be registered'
        );
        assert.ok(
            commands.includes('projectMemoryDev.openPlanInDashboard'),
            'openPlanInDashboard command should be registered'
        );
        assert.ok(
            commands.includes('projectMemoryDev.archivePlan'),
            'archivePlan command should be registered'
        );
        assert.ok(
            commands.includes('projectMemoryDev.confirmPlanStep'),
            'confirmPlanStep command should be registered'
        );
        assert.ok(
            commands.includes('projectMemoryDev.confirmPlanPhase'),
            'confirmPlanPhase command should be registered'
        );
        assert.ok(
            commands.includes('projectMemoryDev.confirmAction'),
            'confirmAction command should be registered'
        );
        assert.ok(
            commands.includes('projectMemoryDev.cancelAction'),
            'cancelAction command should be registered'
        );
    });

    test('Mark Step commands handle invalid chat-action args without throwing', async () => {
        await vscode.commands.executeCommand('projectMemoryDev.markStepActive', undefined, 0);
        await vscode.commands.executeCommand('projectMemoryDev.markStepDone', 'plan_abc', 'not-a-number');
    });
});

suite('Configuration Test Suite', () => {
    test('Configuration section should exist', () => {
        const config = vscode.workspace.getConfiguration('projectMemoryDev');
        assert.ok(config, 'projectMemory configuration section should exist');
    });

    test('dataRoot setting should be accessible', () => {
        const config = vscode.workspace.getConfiguration('projectMemoryDev');
        const dataRoot = config.get<string>('dataRoot');
        // dataRoot can be empty string or undefined, just check it doesn't throw
        assert.ok(dataRoot !== null, 'dataRoot should be accessible');
    });

    test('agentsRoot setting should be accessible', () => {
        const config = vscode.workspace.getConfiguration('projectMemoryDev');
        const agentsRoot = config.get<string>('agentsRoot');
        assert.ok(agentsRoot !== null, 'agentsRoot should be accessible');
    });

    test('autoRefresh setting should have default value', () => {
        const config = vscode.workspace.getConfiguration('projectMemoryDev');
        const autoRefresh = config.get<boolean>('autoRefresh');
        assert.strictEqual(autoRefresh, true, 'autoRefresh should default to true');
    });

    test('autoDeployAgents setting should have default value', () => {
        const config = vscode.workspace.getConfiguration('projectMemoryDev');
        const autoDeploy = config.get<boolean>('autoDeployAgents');
        assert.strictEqual(autoDeploy, false, 'autoDeployAgents should default to false');
    });

    test('apiPort setting should have default value', () => {
        const config = vscode.workspace.getConfiguration('projectMemoryDev');
        const apiPort = config.get<number>('apiPort');
        assert.strictEqual(apiPort, 3001, 'apiPort should default to 3001');
    });
});

suite('View Container Test Suite', () => {
    test('Activity Bar view container should exist', async () => {
        // Check if the view container ID is registered
        // This is a basic check - the view may not be visible without activation
        const extension = vscode.extensions.getExtension('project-memory-dev.project-memory-dashboard-dev-dev-dev');
        if (extension) {
            const packageJson = extension.packageJSON;
            const viewContainers = packageJson.contributes?.viewsContainers?.activitybar;
            assert.ok(
                viewContainers?.some((c: { id: string }) => c.id === 'projectMemoryDev'),
                'projectMemory view container should be defined'
            );
        }
    });

    test('Dashboard webview should be defined', async () => {
        const extension = vscode.extensions.getExtension('project-memory-dev.project-memory-dashboard-dev-dev-dev');
        if (extension) {
            const packageJson = extension.packageJSON;
            const views = packageJson.contributes?.views?.projectMemory;
            assert.ok(
                views?.some((v: { id: string }) => v.id === 'projectMemoryDev.dashboardView'),
                'dashboardView should be defined'
            );
        }
    });
});

suite('Menu Contributions Test Suite', () => {
    test('Explorer context menu should have Create Plan', async () => {
        const extension = vscode.extensions.getExtension('project-memory-dev.project-memory-dashboard-dev-dev-dev');
        if (extension) {
            const packageJson = extension.packageJSON;
            const explorerContext = packageJson.contributes?.menus?.['explorer/context'];
            assert.ok(
                explorerContext?.some((m: { command: string }) => m.command === 'projectMemoryDev.createPlan'),
                'createPlan should be in explorer context menu'
            );
        }
    });

    test('Explorer context menu should have Add to Plan', async () => {
        const extension = vscode.extensions.getExtension('project-memory-dev.project-memory-dashboard-dev-dev-dev');
        if (extension) {
            const packageJson = extension.packageJSON;
            const explorerContext = packageJson.contributes?.menus?.['explorer/context'];
            assert.ok(
                explorerContext?.some((m: { command: string }) => m.command === 'projectMemoryDev.addToPlan'),
                'addToPlan should be in explorer context menu'
            );
        }
    });

    test('Editor context menu should have Add to Plan', async () => {
        const extension = vscode.extensions.getExtension('project-memory-dev.project-memory-dashboard-dev-dev-dev');
        if (extension) {
            const packageJson = extension.packageJSON;
            const editorContext = packageJson.contributes?.menus?.['editor/context'];
            assert.ok(
                editorContext?.some((m: { command: string }) => m.command === 'projectMemoryDev.addToPlan'),
                'addToPlan should be in editor context menu'
            );
        }
    });
});
