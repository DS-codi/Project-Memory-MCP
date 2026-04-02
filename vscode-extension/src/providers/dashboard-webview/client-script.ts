/**
 * Client-side JavaScript for the dashboard webview.
 *
 * Generates the browser JavaScript that runs inside the webview `<script>` tag.
 * Handles event delegation, API polling, and dashboard lifecycle.
 */

import { IconSvgs } from './icons';
import { getConnectedDashboardHtml, getDisconnectedFallbackHtml } from './sections';
import { getClientHelpers } from './client-helpers';
import { getSkillsClientHelpers } from './skills-section';
import { getInstructionsClientHelpers } from './instructions-section';

/** Parameters needed to generate the client-side script */
export interface ClientScriptParams {
    apiPort: number;
    dashboardUrl: string;
    workspaceId: string;
    workspaceName: string;
    iconsJson: string;
    iconSvgs: IconSvgs;
}

/**
 * Build the client-side JavaScript for the dashboard webview.
 *
 * The returned string is inserted into a `<script>` tag. Template escape
 * sequences like `\`...\`` produce browser-side template literals, and
 * `\${...}` produces browser-side template interpolations.
 */
export function getClientScript(params: ClientScriptParams): string {
    const {
        apiPort, dashboardUrl, workspaceId, workspaceName,
        iconsJson, iconSvgs,
    } = params;

    const connectedHtml = getConnectedDashboardHtml(iconSvgs, apiPort, workspaceName);
    const disconnectedHtml = getDisconnectedFallbackHtml();
    const helpers = getClientHelpers();
    const skillsHelpers = getSkillsClientHelpers();
    const instructionsHelpers = getInstructionsClientHelpers();

    return `
        const vscode = acquireVsCodeApi();
        const persistedState = vscode.getState() || {};
        const apiPort = ${apiPort};
        const dashboardUrl = '${dashboardUrl}';
        let workspaceId = '${workspaceId}';
        const workspaceName = '${workspaceName}';
        const icons = ${iconsJson};
        let topLevelTab = (persistedState.topLevelTab === 'plans' || persistedState.topLevelTab === 'operations' || persistedState.topLevelTab === 'sprints')
            ? persistedState.topLevelTab
            : 'dashboard';
        let alwaysProvidedNotes = typeof persistedState.alwaysProvidedNotes === 'string'
            ? persistedState.alwaysProvidedNotes
            : '';
        
        let activePlans = [];
        let archivedPlans = [];
        let programPlans = [];
        let currentPlanTab = (persistedState.currentPlanTab === 'archived' || persistedState.currentPlanTab === 'programs')
            ? persistedState.currentPlanTab
            : 'active';
        let activeSprints = [];
        let completedSprints = [];
        let archivedSprints = [];
        let currentSprintTab = (persistedState.currentSprintTab === 'completed' || persistedState.currentSprintTab === 'archived')
            ? persistedState.currentSprintTab
            : 'active';
        let selectedSprintId = typeof persistedState.selectedSprintId === 'string' ? persistedState.selectedSprintId : '';
        let planSortBy = (
            persistedState.planSortBy === 'recent' ||
            persistedState.planSortBy === 'title' ||
            persistedState.planSortBy === 'status' ||
            persistedState.planSortBy === 'oldest' ||
            persistedState.planSortBy === 'progress'
        )
            ? persistedState.planSortBy
            : 'newest';
        let selectedPlanId = typeof persistedState.selectedPlanId === 'string' ? persistedState.selectedPlanId : '';
        let selectedPlanWorkspaceId = typeof persistedState.selectedPlanWorkspaceId === 'string' ? persistedState.selectedPlanWorkspaceId : '';
        let selectedPlanDetails = null;
        let selectedPlanBuildScripts = [];
        let latestHealthSnapshot = null;
        let recentEvents = [];
        let hasRenderedDashboard = false;
        let lastPlanSignature = '';
        
        // Listen for messages from the extension
        window.addEventListener('message', function(event) {
            const message = event.data;
            if (message.type === 'deploymentComplete') {
                const { type, count, targetDir } = message.data;
                showToast('\\u2714 Deployed ' + count + ' ' + type + ' to workspace', 'success');
            } else if (message.type === 'deploymentError') {
                showToast('\\u274C ' + message.data.error, 'error');
            } else if (message.type === 'skillsList') {
                updateSkillsList(message.data.skills || []);
            } else if (message.type === 'instructionsList') {
                updateInstructionsList(message.data.instructions || []);
            } else if (message.type === 'supervisorCommandCopied') {
                showToast('\u2714 Copied: ' + (message.data.path || 'supervisor command'), 'success');
            } else if (message.type === 'isolateServerStatus') {
                const { isolated, port } = message.data;
                const isolateBtn = document.getElementById('isolateBtn');
                const isolateBtnText = document.getElementById('isolateBtnText');
                if (isolateBtn && isolateBtnText) {
                    if (isolated) {
                        isolateBtn.classList.add('isolated');
                        isolateBtnText.textContent = 'Isolated:' + port;
                        isolateBtn.title = 'Running isolated server on port ' + port + '. Click to reconnect to main server.';
                    } else {
                        isolateBtn.classList.remove('isolated');
                        isolateBtnText.textContent = 'Isolate';
                        isolateBtn.title = 'Spawn isolated server for this workspace';
                    }
                }
            } else if (message.type === 'init') {
                const newId = message.data && message.data.workspaceId;
                if (newId && newId !== workspaceId) {
                    workspaceId = newId;
                    selectedPlanId = '';
                    selectedPlanWorkspaceId = '';
                    lastPlanSignature = '';
                    selectedSprintId = '';
                    saveDashboardState();
                    if (hasRenderedDashboard) {
                        updateActionAvailability();
                        fetchPlans();
                        fetchSprints();
                    }
                }
            } else if (message.type === 'alwaysProvidedNotes') {
                setAlwaysProvidedNotes(message.data && message.data.notes ? message.data.notes : '', { persist: false });
            } else if (message.type === 'alwaysProvidedNotesSaved') {
                setAlwaysProvidedNotes(message.data && message.data.notes ? message.data.notes : '', { persist: true });
                showToast('\u2714 Always-provided notes saved', 'success');
            } else if (message.type === 'sprintCreated') {
                showToast('\u2714 Sprint created', 'success');
                fetchSprints();
            } else if (message.type === 'sprintCreateError') {
                showToast('\u274C ' + (message.data && message.data.error ? message.data.error : 'Failed to create sprint'), 'error');
            }
        });
        
        // Toast notification system
        function showToast(message, type) {
            var existingToast = document.querySelector('.toast');
            if (existingToast) existingToast.remove();
            var toast = document.createElement('div');
            toast.className = 'toast toast-' + type;
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(function() { toast.classList.add('show'); }, 10);
            setTimeout(function() {
                toast.classList.remove('show');
                setTimeout(function() { toast.remove(); }, 300);
            }, 3000);
        }
        
        // Use event delegation for button clicks (CSP-compliant)
        document.addEventListener('click', function(e) {
            var target = e.target;
            var button = target.closest('button');
            if (!button) {
                var planItem = target.closest('.plan-item:not(.sprint-item)');
                if (planItem) {
                    var clickedPlanId = planItem.getAttribute('data-plan-id');
                    var clickedWorkspaceId = planItem.getAttribute('data-workspace-id') || workspaceId;
                    if (clickedPlanId) {
                        setSelectedPlan(clickedPlanId, clickedWorkspaceId);
                    }
                }
                var sprintItem = target.closest('.sprint-item');
                if (sprintItem) {
                    var clickedSprintId = sprintItem.getAttribute('data-sprint-id');
                    if (clickedSprintId) {
                        setSelectedSprint(clickedSprintId);
                    }
                }
                return;
            }

            if (button.disabled) {
                return;
            }

            var panelTab = button.getAttribute('data-top-level-tab');
            if (panelTab) { setTopLevelTab(panelTab); return; }

            var tab = button.getAttribute('data-tab');
            if (tab) { setPlanTab(tab); return; }

            var sprintTab = button.getAttribute('data-sprint-tab');
            if (sprintTab) { setSprintTab(sprintTab); return; }
            
            var action = button.getAttribute('data-action');
            var command = button.getAttribute('data-command');
            var planId = button.getAttribute('data-plan-id');
            var planWorkspaceId = button.getAttribute('data-workspace-id') || workspaceId;
            var copyText = button.getAttribute('data-copy');
            
            if (action === 'toggle-collapse') {
                var targetId = button.getAttribute('data-target');
                var targetEl = targetId ? document.getElementById(targetId) : null;
                if (targetEl) { targetEl.classList.toggle('collapsed'); }
                return;
            }

            if (action === 'open-browser') {
                vscode.postMessage({ type: 'openExternal', data: { url: dashboardUrl } });
            } else if (action === 'open-context-files') {
                const target = getSelectedPlanTarget();
                vscode.postMessage({
                    type: 'openPlanRoute',
                    data: {
                        route: 'context',
                        query: appendAlwaysProvidedNotesQuery(''),
                        planId: target ? target.planId : undefined,
                        workspaceId: target ? target.workspaceId : undefined,
                    }
                });
            } else if (action === 'open-context-note') {
                const target = getSelectedPlanTarget();
                vscode.postMessage({
                    type: 'openPlanRoute',
                    data: {
                        route: 'context',
                        query: appendAlwaysProvidedNotesQuery('focus=context'),
                        planId: target ? target.planId : undefined,
                        workspaceId: target ? target.workspaceId : undefined,
                    }
                });
            } else if (action === 'open-research-note') {
                const target = getSelectedPlanTarget();
                vscode.postMessage({
                    type: 'openPlanRoute',
                    data: {
                        route: 'context',
                        query: appendAlwaysProvidedNotesQuery('focus=research'),
                        planId: target ? target.planId : undefined,
                        workspaceId: target ? target.workspaceId : undefined,
                    }
                });
            } else if (action === 'open-build-scripts') {
                const target = getSelectedPlanTarget();
                vscode.postMessage({
                    type: 'openPlanRoute',
                    data: {
                        route: 'build-scripts',
                        query: appendAlwaysProvidedNotesQuery(''),
                        planId: target ? target.planId : undefined,
                        workspaceId: target ? target.workspaceId : undefined,
                    }
                });
            } else if (action === 'open-run-script') {
                const target = getSelectedPlanTarget();
                vscode.postMessage({
                    type: 'openPlanRoute',
                    data: {
                        route: 'build-scripts',
                        query: appendAlwaysProvidedNotesQuery('run=1'),
                        planId: target ? target.planId : undefined,
                        workspaceId: target ? target.workspaceId : undefined,
                    }
                });
            } else if (action === 'open-handoff') {
                const target = getSelectedPlanTarget();
                vscode.postMessage({
                    type: 'openPlanRoute',
                    data: {
                        route: 'plan',
                        query: appendAlwaysProvidedNotesQuery('tab=timeline'),
                        planId: target ? target.planId : undefined,
                        workspaceId: target ? target.workspaceId : undefined,
                    }
                });
            } else if (action === 'save-always-notes') {
                const notes = getAlwaysProvidedNotesFromUi();
                setAlwaysProvidedNotes(notes, { persist: true });
                vscode.postMessage({ type: 'saveAlwaysProvidedNotes', data: { notes: notes } });
            } else if (action === 'clear-always-notes') {
                setAlwaysProvidedNotes('', { persist: true });
                vscode.postMessage({ type: 'saveAlwaysProvidedNotes', data: { notes: '' } });
            } else if (action === 'open-resume-plan') {
                const target = getSelectedPlanTarget();
                vscode.postMessage({
                    type: 'planAction',
                    data: {
                        action: 'resume',
                        planId: target ? target.planId : undefined,
                        workspaceId: target ? target.workspaceId : undefined,
                    }
                });
            } else if (action === 'open-archive-plan') {
                const target = getSelectedPlanTarget();
                vscode.postMessage({
                    type: 'planAction',
                    data: {
                        action: 'archive',
                        planId: target ? target.planId : undefined,
                        workspaceId: target ? target.workspaceId : undefined,
                    }
                });
            } else if (action === 'create-sprint') {
                vscode.postMessage({ type: 'createSprint', data: { workspaceId: workspaceId } });
            } else if (action === 'refresh-sprints') {
                fetchSprints();
            } else if (action === 'refresh') {
                var statusDot = document.getElementById('statusDot');
                statusDot.className = 'status-dot loading';
                checkServer();
            } else if (action === 'refresh-skills') {
                requestSkillsList();
            } else if (action === 'deploy-skill') {
                var skillName = button.getAttribute('data-skill-name');
                if (skillName) {
                    vscode.postMessage({ type: 'deploySkill', data: { skillName: skillName } });
                }
            } else if (action === 'refresh-instructions') {
                requestInstructionsList();
            } else if (action === 'deploy-instruction') {
                var instrName = button.getAttribute('data-instruction-name');
                if (instrName) {
                    vscode.postMessage({ type: 'deployInstruction', data: { instructionName: instrName } });
                }
            } else if (action === 'isolate-server') {
                vscode.postMessage({ type: 'isolateServer' });
            } else if (action === 'open-workspace-folder') {
                vscode.postMessage({ type: 'openWorkspaceFolder' });
            } else if (action === 'copy-supervisor-command') {
                vscode.postMessage({ type: 'copySupervisorCommand' });
            } else if (action === 'open-workspace-terminal') {
                vscode.postMessage({ type: 'openWorkspaceTerminal' });
            } else if (action === 'configure-supervisor-path') {
                vscode.postMessage({ type: 'configureSupervisorPath' });
            } else if (action === 'run-command' && command) {
                vscode.postMessage({ type: 'runCommand', data: { command: command } });
            } else if (action === 'select-plan' && planId) {
                setSelectedPlan(planId, planWorkspaceId);
            } else if (action === 'open-plan-browser' && planId) {
                setSelectedPlan(planId, planWorkspaceId, { toggle: false });
                vscode.postMessage({ type: 'openPlanInBrowser', data: { planId: planId, workspaceId: planWorkspaceId } });
            } else if (action === 'open-plan' && planId) {
                setSelectedPlan(planId, planWorkspaceId, { toggle: false });
                vscode.postMessage({ type: 'openPlan', data: { planId: planId, workspaceId: planWorkspaceId } });
            } else if (action === 'copy' && copyText) {
                vscode.postMessage({ type: 'copyToClipboard', data: { text: copyText } });
            } else if (action === 'open-search') {
                var input = document.getElementById('searchInput');
                var query = input ? input.value.trim() : '';
                openSearch(query);
            }
        });

        document.addEventListener('keydown', function(e) {
            var target = e.target;
            if (target && target.classList && target.classList.contains('search-input') && e.key === 'Enter') {
                openSearch(target.value.trim());
            }
            if ((e.key === 'Enter' || e.key === ' ') && target && target.classList) {
                if (target.classList.contains('plan-item') && !target.classList.contains('sprint-item')) {
                    e.preventDefault();
                    var keyPlanId = target.getAttribute('data-plan-id');
                    var keyWorkspaceId = target.getAttribute('data-workspace-id') || workspaceId;
                    if (keyPlanId) {
                        setSelectedPlan(keyPlanId, keyWorkspaceId);
                    }
                } else if (target.classList.contains('sprint-item')) {
                    e.preventDefault();
                    var keySprintId = target.getAttribute('data-sprint-id');
                    if (keySprintId) {
                        setSelectedSprint(keySprintId);
                    }
                }
            }
        });

        document.addEventListener('change', function(e) {
            var target = e.target;
            if (target && target.id === 'plansSortSelect') {
                setPlanSort(target.value);
            }
        });

        function openSearch(query) {
            var suffix = query ? '/search?q=' + encodeURIComponent(query) : '/search';
            vscode.postMessage({ type: 'openExternal', data: { url: dashboardUrl + suffix } });
        }

        // Rendering, data fetching, and status helpers (hoisted)
        ${helpers}

        // Skills and instructions management helpers (hoisted)
        ${skillsHelpers}
        ${instructionsHelpers}

        function updateLayoutFromViewport() {
            setLayoutSize(window.innerWidth || document.documentElement.clientWidth || 0);
        }
        window.addEventListener('resize', updateLayoutFromViewport);
        updateLayoutFromViewport();

        async function checkServer() {
            var statusDot = document.getElementById('statusDot');
            var statusText = document.getElementById('statusText');
            var fallback = document.getElementById('fallback');
            try {
                var response = await fetch('http://localhost:' + apiPort + '/api/health');
                if (response.ok) {
                    var data = await response.json();
                    statusDot.className = 'status-dot';
                    statusText.textContent = 'Connected';
                    if (!hasRenderedDashboard) {
                        fallback.innerHTML = \`${connectedHtml}\`;
                        hasRenderedDashboard = true;
                        applyDashboardState();
                    }
                    updateStatusCards(data);
                    fetchPlans();
                    fetchSprints();
                    fetchEvents();
                    requestSkillsList();
                    requestInstructionsList();
                    vscode.postMessage({ type: 'getAlwaysProvidedNotes' });
                    updateActionAvailability();
                } else {
                    throw new Error('Server returned ' + response.status);
                }
            } catch (error) {
                var errorText = error && error.message ? error.message : String(error);
                console.error('Health check failed:', errorText);
                statusDot.className = 'status-dot error';
                statusText.textContent = 'Disconnected';
                hasRenderedDashboard = false;
                fallback.innerHTML = \`${disconnectedHtml}\`;
            }
        }
        
        checkServer();
        
        (function initIsolateButton() {
            var isIsolated = apiPort !== 3001;
            var isolateBtn = document.getElementById('isolateBtn');
            var isolateBtnText = document.getElementById('isolateBtnText');
            if (isolateBtn && isolateBtnText && isIsolated) {
                isolateBtn.classList.add('isolated');
                isolateBtnText.textContent = 'Isolated:' + apiPort;
                isolateBtn.title = 'Running isolated server on port ' + apiPort + '. Click to reconnect to main server.';
            }
        })();
        
        setInterval(checkServer, 30000);
        vscode.postMessage({ type: 'ready' });
    `;
}
