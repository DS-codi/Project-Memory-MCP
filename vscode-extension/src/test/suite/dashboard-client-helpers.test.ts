import * as assert from 'assert';
import { getClientHelpers } from '../../providers/dashboard-webview/client-helpers';

suite('Dashboard Client Helpers', () => {
    test('fetchPlans groups non-archived plans as active', () => {
        const script = getClientHelpers();

        assert.ok(
            script.includes("const nonProgramPlans = normalized.filter(p => !p.is_program);"),
            'Plan grouping should separate programs from non-program plans'
        );
        assert.ok(
            script.includes("const nextActive = nonProgramPlans.filter(p => p.status !== 'archived');"),
            'Active list should include non-archived non-program plans'
        );
        assert.ok(
            script.includes("const nextArchived = nonProgramPlans.filter(p => p.status === 'archived');"),
            'Archived list should only include archived non-program plans'
        );
        assert.ok(
            !script.includes("filter(p => p.status === 'active')"),
            'Legacy strict active-status filter should not be present'
        );
    });

    test('rendering and state include explicit selected-plan support', () => {
        const script = getClientHelpers();

        assert.ok(
            script.includes('function setSelectedPlan(planId, planWorkspaceId)'),
            'Selection setter should exist for explicit plan selection'
        );
        assert.ok(
            script.includes('function getSelectedPlanTarget()'),
            'Selection getter should exist for route/action payloads'
        );
        assert.ok(
            script.includes('function ensureSelectedPlanIsValid()'),
            'Selection validity should be rechecked after plan refresh'
        );
        assert.ok(
            script.includes('class="plan-item\\${isSelected ? \' selected\' : \'\'}"'),
            'Selected plan row should render with selected class'
        );
        assert.ok(
            script.includes('data-workspace-id="\\${planWorkspaceId}"'),
            'Plan rows should carry explicit workspace context'
        );
        assert.ok(
            script.includes('function fetchSelectedPlanDetails()'),
            'Selected plan details fetcher should exist for step viewer data binding'
        );
        assert.ok(
            script.includes("'/api/plans/' + target.workspaceId + '/' + target.planId"),
            'Selected plan detail fetch should target workspace+plan detail endpoint'
        );
        assert.ok(
            script.includes('function renderStepViewer(steps)'),
            'Step viewer renderer should exist'
        );
        assert.ok(
            script.includes('step-viewer-item'),
            'Step viewer renderer should emit step row class names'
        );
    });

    test('helpers include top-level tab persistence and deterministic availability matrix', () => {
        const script = getClientHelpers();

        assert.ok(
            script.includes('function setTopLevelTab(tab, options)'),
            'Top-level tab setter should exist for Dashboard/Plans/Operations switching'
        );
        assert.ok(
            script.includes('function applyDashboardState()'),
            'Dashboard state application should restore persisted tab state'
        );
        assert.ok(
            script.includes('vscode.setState({'),
            'Dashboard helpers should persist session state through vscode.setState'
        );
        assert.ok(
            script.includes('function getAvailabilityState(key, context)'),
            'Availability matrix evaluator should exist'
        );
        assert.ok(
            script.includes("'Only archived plans can be resumed.'"),
            'Resume tooltip state should be defined for non-archived selections'
        );
        assert.ok(
            script.includes("'Program-level session control is not available yet.'"),
            'Program session-control tooltip state should be defined'
        );
        assert.ok(
            script.includes('function updateActionAvailability()'),
            'Action availability applier should exist'
        );
        assert.ok(
            script.includes('function normalizeAlwaysProvidedNotes(value)'),
            'Always-provided notes normalizer should exist'
        );
        assert.ok(
            script.includes('function appendAlwaysProvidedNotesQuery(query)'),
            'Always-provided notes query composer should exist'
        );
        assert.ok(
            script.includes('alwaysProvidedNotes: typeof alwaysProvidedNotes === \'string\' ? alwaysProvidedNotes : \'\''),
            'Dashboard state should persist always-provided notes'
        );
        assert.ok(
            script.includes('function updatePromptAnalystPanel()'),
            'Prompt Analyst visibility updater should exist'
        );
        assert.ok(
            script.includes('function updateBuildGatePanel()'),
            'Build Gate center updater should exist'
        );
        assert.ok(
            script.includes('function updateOperationsSurface(data)'),
            'Operations surface updater should exist'
        );
        assert.ok(
            script.includes('function updatePlanIntelligencePanel()'),
            'Plan intelligence updater should exist'
        );
        assert.ok(
            script.includes("'/api/plans/' + target.planId + '/build-scripts'"),
            'Build Gate panel should fetch build scripts for selected plan'
        );
        assert.ok(
            script.includes("'/api/events?limit=25'"),
            'Event polling should attempt higher telemetry limit for Prompt Analyst visibility'
        );
    });
});
