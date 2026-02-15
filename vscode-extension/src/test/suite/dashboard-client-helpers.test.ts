import * as assert from 'assert';
import { getClientHelpers } from '../../providers/dashboard-webview/client-helpers';

suite('Dashboard Client Helpers', () => {
    test('fetchPlans groups non-archived plans as active', () => {
        const script = getClientHelpers();

        assert.ok(
            script.includes("const nextActive = allPlans.filter(p => (p.status || '').toLowerCase() !== 'archived');"),
            'Active list should include all non-archived plans'
        );
        assert.ok(
            script.includes("const nextArchived = allPlans.filter(p => (p.status || '').toLowerCase() === 'archived');"),
            'Archived list should only include archived plans'
        );
        assert.ok(
            !script.includes("filter(p => p.status === 'active')"),
            'Legacy strict active-status filter should not be present'
        );
    });
});
