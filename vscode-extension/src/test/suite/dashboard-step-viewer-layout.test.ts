import * as assert from 'assert';
import { getConnectedDashboardHtml } from '../../providers/dashboard-webview/sections';
import { iconSvgs } from '../../providers/dashboard-webview/icons';

suite('Dashboard Step Viewer Layout', () => {
    test('plans section includes selected plan panel and step viewer placeholders', () => {
        const html = getConnectedDashboardHtml(iconSvgs, 3001, 'Workspace');

        assert.ok(
            html.includes('id="selectedPlanPanel"'),
            'Selected plan panel container should be present'
        );
        assert.ok(
            html.includes('id="selectedPlanTitle"'),
            'Selected plan title element should be present'
        );
        assert.ok(
            html.includes('id="selectedPlanMeta"'),
            'Selected plan metadata element should be present'
        );
        assert.ok(
            html.includes('id="selectedPlanBody"'),
            'Selected plan body element should be present for step viewer rendering'
        );
        assert.ok(
            html.includes('Select a plan to view ordered steps.'),
            'Selected plan panel should include empty-state copy'
        );
        assert.ok(
            html.includes('id="alwaysNotesInput"'),
            'Operations section should include always-provided notes input'
        );
        assert.ok(
            html.includes('data-action="save-always-notes"'),
            'Always-provided notes section should include save action button'
        );
        assert.ok(
            html.includes('id="widget-prompt-analyst"'),
            'Operations section should include Prompt Analyst visibility panel'
        );
        assert.ok(
            html.includes('id="widget-build-gate"'),
            'Operations section should include Build Gate center panel'
        );
        assert.ok(
            html.includes('id="widget-operations-surface"'),
            'Operations section should include operations surface panel'
        );
        assert.ok(
            html.includes('id="widget-plan-intelligence"'),
            'Operations section should include plan intelligence panel'
        );
    });
});
