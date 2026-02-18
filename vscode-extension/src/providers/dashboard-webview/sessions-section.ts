/**
 * Sessions management section for the dashboard webview.
 *
 * Provides HTML template and client helpers for displaying active subagent sessions
 * with stop/inject controls for real-time session interruption.
 */

import { IconSvgs } from './icons';

/**
 * HTML for the active sessions collapsible section.
 */
export function getSessionsSectionHtml(iconSvgs: IconSvgs): string {
    return `
                            <section class="collapsible collapsed" id="widget-sessions">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-sessions">
                                    <span class="chevron">></span>
                                    <h3>Active Sessions</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <div class="sessions-header">
                                            <button class="btn btn-small" data-action="refresh-sessions" title="Refresh session list">
                                                ${iconSvgs.syncHistory} Refresh
                                            </button>
                                        </div>
                                        <div class="sessions-list" id="sessionsList">
                                            <div class="empty-state">No active sessions</div>
                                        </div>
                                        <div class="sessions-controls" id="sessionsControls" style="display:none">
                                            <button class="btn btn-small" data-action="stop-session" id="stopSessionBtn" disabled>Stop Session</button>
                                            <div class="inject-row">
                                                <input type="text" id="injectText" placeholder="Inject guidance (max 500 chars)..." maxlength="500" />
                                                <button class="btn btn-small" data-action="inject-session" id="injectSessionBtn" disabled>Inject</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>`;
}

/**
 * Client-side JavaScript helpers for the sessions section.
 */
export function getSessionsClientHelpers(): string {
    return `
        var selectedSessionKey = null;

        function renderSessionsList(sessions) {
            if (!sessions || sessions.length === 0) {
                document.getElementById('sessionsControls').style.display = 'none';
                return '<div class="empty-state">No active sessions</div>';
            }
            
            document.getElementById('sessionsControls').style.display = 'block';
            
            return sessions.map(function(session) {
                var statusClass = session.status === 'active' ? 'badge-ok' : 
                                 session.status === 'stopping' ? 'badge-warn' : 'badge';
                var statusBadge = '<span class="badge ' + statusClass + '">' + session.status + '</span>';
                
                var elapsed = getElapsedTime(session.startedAt);
                var lastTool = session.lastToolCall ? 
                    escapeHtml(session.lastToolCall.toolName) + ' (' + session.lastToolCall.callCount + ')' : 
                    'No calls yet';
                
                var isSelected = selectedSessionKey === session.sessionId;
                var selectedClass = isSelected ? ' selected' : '';
                
                var tripleKey = session.workspaceId + '::' + session.planId + '::' + session.sessionId;
                
                return '<div class="session-item' + selectedClass + '" data-session-key="' + tripleKey + '">' +
                    '<div class="session-info">' +
                        '<div class="session-agent"><strong>' + escapeHtml(session.agentType) + '</strong> ' + statusBadge + '</div>' +
                        '<div class="session-meta">' +
                            '<span>Plan: ' + escapeHtml(session.planId.substring(0, 12)) + '...</span>' +
                            '<span>Elapsed: ' + elapsed + '</span>' +
                        '</div>' +
                        '<div class="session-meta">Last: ' + lastTool + '</div>' +
                    '</div>' +
                '</div>';
            }).join('');
        }

        function getElapsedTime(startedAt) {
            var start = new Date(startedAt);
            var now = new Date();
            var diffMs = now - start;
            var diffSec = Math.floor(diffMs / 1000);
            var diffMin = Math.floor(diffSec / 60);
            var diffHr = Math.floor(diffMin / 60);
            
            if (diffHr > 0) return diffHr + 'h ' + (diffMin % 60) + 'm';
            if (diffMin > 0) return diffMin + 'm ' + (diffSec % 60) + 's';
            return diffSec + 's';
        }

        function updateSessionsList(sessions) {
            var sessionsList = document.getElementById('sessionsList');
            if (sessionsList) {
                sessionsList.innerHTML = renderSessionsList(sessions);
                attachSessionClickHandlers();
            }
        }

        function attachSessionClickHandlers() {
            var items = document.querySelectorAll('.session-item');
            items.forEach(function(item) {
                item.addEventListener('click', function() {
                    handleSessionSelect(item.getAttribute('data-session-key'));
                });
            });
        }

        function handleSessionSelect(sessionKey) {
            selectedSessionKey = sessionKey;
            
            // Update UI selection
            var items = document.querySelectorAll('.session-item');
            items.forEach(function(item) {
                if (item.getAttribute('data-session-key') === sessionKey) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            });
            
            // Enable controls
            document.getElementById('stopSessionBtn').disabled = false;
            document.getElementById('injectSessionBtn').disabled = false;
        }

        function handleStopSession() {
            if (!selectedSessionKey) return;
            vscode.postMessage({ 
                type: 'stopSession', 
                data: { sessionKey: selectedSessionKey }
            });
        }

        function handleInjectSession() {
            if (!selectedSessionKey) return;
            var injectText = document.getElementById('injectText').value;
            if (!injectText || injectText.trim() === '') return;
            
            vscode.postMessage({ 
                type: 'injectSession', 
                data: { 
                    sessionKey: selectedSessionKey,
                    text: injectText
                }
            });
            
            // Clear input after sending
            document.getElementById('injectText').value = '';
        }

        function requestSessionsList() {
            vscode.postMessage({ type: 'getSessions' });
        }
    `;
}
