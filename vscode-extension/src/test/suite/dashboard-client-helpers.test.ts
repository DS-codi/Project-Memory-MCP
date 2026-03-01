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
    });
});
