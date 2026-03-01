import * as assert from 'assert';
import * as vscode from 'vscode';
import { DashboardViewProvider } from '../../providers/DashboardViewProvider';
import { getClientScript } from '../../providers/dashboard-webview/client-script';
import { iconSvgs } from '../../providers/dashboard-webview/icons';

suite('Dashboard Plan Selection Routing', () => {
    test('client script passes explicit workspaceId for plan actions', () => {
        const script = getClientScript({
            apiPort: 3001,
            dashboardUrl: 'http://localhost:5173',
            workspaceId: 'workspace-default',
            workspaceName: 'Workspace',
            dataRoot: JSON.stringify('C:/tmp/data'),
            iconsJson: JSON.stringify(iconSvgs),
            iconSvgs,
        });

        assert.ok(
            script.includes("var planWorkspaceId = button.getAttribute('data-workspace-id') || workspaceId;"),
            'Buttons should carry explicit workspace context'
        );
        assert.ok(
            script.includes("setSelectedPlan(planId, planWorkspaceId);"),
            'Click actions should set selected plan with explicit workspace context'
        );
        assert.ok(
            script.includes("workspaceId: planWorkspaceId"),
            'Open-plan payloads should use explicit workspaceId when available'
        );
        assert.ok(
            script.includes('const persistedState = vscode.getState() || {};'),
            'Client script should restore persisted webview session state'
        );
        assert.ok(
            script.includes("var panelTab = button.getAttribute('data-top-level-tab');"),
            'Top-level tab click routing should be handled explicitly'
        );
        assert.ok(
            script.includes('appendAlwaysProvidedNotesQuery'),
            'Plan route actions should enrich query strings with always-provided notes'
        );
        assert.ok(
            script.includes("vscode.postMessage({ type: 'saveAlwaysProvidedNotes'"),
            'Always-provided notes should post save messages to the extension host'
        );
        assert.ok(
            script.includes('if (button.disabled) {'),
            'Disabled buttons should be short-circuited in delegated click handling'
        );
    });

    test('provider resolves explicit plan selection without QuickPick fallback', async () => {
        const provider = new DashboardViewProvider(vscode.Uri.file('/tmp/ext'), '/tmp/data', '/tmp/agents') as any;

        let pickPlanCalled = false;
        provider.pickPlan = async () => {
            pickPlanCalled = true;
            return { workspaceId: 'fallback-workspace', planId: 'fallback-plan' };
        };

        const explicit = await provider.resolvePlanSelection({
            workspaceId: 'workspace-1',
            planId: 'plan-1',
        });

        assert.deepStrictEqual(explicit, { workspaceId: 'workspace-1', planId: 'plan-1' });
        assert.strictEqual(pickPlanCalled, false, 'QuickPick fallback should not run when both IDs are provided');
    });

    test('provider falls back to pickPlan when explicit selection is missing', async () => {
        const provider = new DashboardViewProvider(vscode.Uri.file('/tmp/ext'), '/tmp/data', '/tmp/agents') as any;

        let pickPlanCalled = false;
        provider.pickPlan = async () => {
            pickPlanCalled = true;
            return { workspaceId: 'fallback-workspace', planId: 'fallback-plan' };
        };

        const resolved = await provider.resolvePlanSelection({
            workspaceId: 'workspace-only',
        });

        assert.strictEqual(pickPlanCalled, true, 'QuickPick fallback should run when plan/workspace pair is incomplete');
        assert.deepStrictEqual(resolved, { workspaceId: 'fallback-workspace', planId: 'fallback-plan' });
    });
});
