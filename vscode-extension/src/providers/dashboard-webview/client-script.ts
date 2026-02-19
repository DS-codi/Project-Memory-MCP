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
import { getSessionsClientHelpers } from './sessions-section';

/** Parameters needed to generate the client-side script */
export interface ClientScriptParams {
    apiPort: number;
    dashboardUrl: string;
    workspaceId: string;
    workspaceName: string;
    dataRoot: string;
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
        dataRoot, iconsJson, iconSvgs,
    } = params;

    const connectedHtml = getConnectedDashboardHtml(iconSvgs, apiPort, workspaceName);
    const disconnectedHtml = getDisconnectedFallbackHtml();
    const helpers = getClientHelpers();
    const skillsHelpers = getSkillsClientHelpers();
    const instructionsHelpers = getInstructionsClientHelpers();
    const sessionsHelpers = getSessionsClientHelpers();

    return `
        const vscode = acquireVsCodeApi();
        const apiPort = ${apiPort};
        const dashboardUrl = '${dashboardUrl}';
        const workspaceId = '${workspaceId}';
        const workspaceName = '${workspaceName}';
        const dataRoot = ${dataRoot};
        const icons = ${iconsJson};
        
        let activePlans = [];
        let archivedPlans = [];
        let currentPlanTab = 'active';
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
            } else if (message.type === 'sessionsList') {
                updateSessionsList(message.data.sessions || []);
            } else if (message.type === 'sessionStopResult') {
                if (message.data.success) {
                    showToast('Stop directive queued', 'success');
                    requestSessionsList();
                } else {
                    showToast('Failed to queue stop directive', 'error');
                }
            } else if (message.type === 'sessionInjectResult') {
                if (message.data.success) {
                    showToast('Guidance injected', 'success');
                } else {
                    showToast('Failed to inject guidance', 'error');
                }
            } else if (message.type === 'isolateServerStatus') {
                const { isolated, port } = message.data;
                const isolateBtn = document.getElementById('isolateBtn');
                const isolateBtnText = document.getElementById('isolateBtnText');
                if (isolateBtn && isolateBtnText) {
                    if (isolated) {
                        isolateBtn.classList.add('isolated');
                        isolateBtnText.textContent = 'Isolated:' + port;
                        isolateBtn.title = 'Running isolated server on port ' + port + '. Click to reconnect to shared server.';
                    } else {
                        isolateBtn.classList.remove('isolated');
                        isolateBtnText.textContent = 'Isolate';
                        isolateBtn.title = 'Spawn isolated server for this workspace';
                    }
                }
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
            if (!button) return;

            var tab = button.getAttribute('data-tab');
            if (tab) { setPlanTab(tab); return; }
            
            var action = button.getAttribute('data-action');
            var command = button.getAttribute('data-command');
            var planId = button.getAttribute('data-plan-id');
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
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'context' } });
            } else if (action === 'open-context-note') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'context', query: 'focus=context' } });
            } else if (action === 'open-research-note') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'context', query: 'focus=research' } });
            } else if (action === 'open-build-scripts') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'build-scripts' } });
            } else if (action === 'open-run-script') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'build-scripts', query: 'run=1' } });
            } else if (action === 'open-handoff') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'plan', query: 'tab=timeline' } });
            } else if (action === 'open-resume-plan') {
                vscode.postMessage({ type: 'planAction', data: { action: 'resume' } });
            } else if (action === 'open-archive-plan') {
                vscode.postMessage({ type: 'planAction', data: { action: 'archive' } });
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
            } else if (action === 'undeploy-instruction') {
                var instrName2 = button.getAttribute('data-instruction-name');
                if (instrName2) {
                    vscode.postMessage({ type: 'undeployInstruction', data: { instructionName: instrName2 } });
                }
            } else if (action === 'refresh-sessions') {
                requestSessionsList();
            } else if (action === 'stop-session') {
                handleStopSession();
            } else if (action === 'inject-session') {
                handleInjectSession();
            } else if (action === 'isolate-server') {
                vscode.postMessage({ type: 'isolateServer' });
            } else if (action === 'run-command' && command) {
                vscode.postMessage({ type: 'runCommand', data: { command: command } });
            } else if (action === 'open-plan-browser' && planId) {
                vscode.postMessage({ type: 'openPlanInBrowser', data: { planId: planId, workspaceId: workspaceId } });
            } else if (action === 'open-plan' && planId) {
                vscode.postMessage({ type: 'openPlan', data: { planId: planId, workspaceId: workspaceId } });
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
        ${sessionsHelpers}

        var sizeObserver = new ResizeObserver(function(entries) {
            for (var i = 0; i < entries.length; i++) {
                setLayoutSize(entries[i].contentRect.width);
            }
        });
        sizeObserver.observe(document.body);

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
                    }
                    updateStatusCards(data);
                    fetchPlans();
                    fetchEvents();
                    requestSkillsList();
                    requestInstructionsList();
                    requestSessionsList();
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
                isolateBtn.title = 'Running isolated server on port ' + apiPort + '. Click to reconnect to shared server.';
            }
        })();
        
        setInterval(checkServer, 30000);
        vscode.postMessage({ type: 'ready' });
    `;
}
