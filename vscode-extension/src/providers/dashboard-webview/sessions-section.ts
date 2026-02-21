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
                                            <div class="sessions-summary">
                                                <span class="sessions-pill" id="sessionsTotalCount">0 total</span>
                                                <span class="sessions-pill sessions-pill-active" id="sessionsActiveCount">0 active</span>
                                                <span class="sessions-pill sessions-pill-stopping" id="sessionsStoppingCount">0 stopping</span>
                                            </div>
                                            <div class="sessions-header-actions">
                                                <button class="btn btn-small btn-danger" data-action="clear-all-sessions" title="Close all active sessions">
                                                    Clear All
                                                </button>
                                                <button class="btn btn-small btn-secondary" data-action="refresh-sessions" title="Refresh session list">
                                                    ${iconSvgs.syncHistory} Refresh
                                                </button>
                                            </div>
                                        </div>
                                        <div class="sessions-list" id="sessionsList">
                                            <div class="empty-state">No active sessions</div>
                                        </div>
                                        <div class="sessions-controls" id="sessionsControls" style="display:none">
                                            <div class="sessions-controls-header">
                                                <span class="selected-session-label" id="selectedSessionText">No session selected</span>
                                                <button class="btn btn-small" data-action="stop-session" id="stopSessionBtn" disabled>Stop Selected</button>
                                            </div>
                                            <div class="inject-row">
                                                <textarea id="injectText" placeholder="Inject guidance for selected session (max 500 chars)..." maxlength="500"></textarea>
                                                <div class="inject-footer">
                                                    <span class="inject-count" id="injectCharCount">0/500</span>
                                                    <button class="btn btn-small" data-action="inject-session" id="injectSessionBtn" disabled>Inject Guidance</button>
                                                </div>
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
        var latestSessions = [];
        var injectInputBound = false;

        function getStatusClass(status) {
            if (status === 'active') return 'badge-ok';
            if (status === 'stopping') return 'badge-warn';
            return 'badge';
        }

        function shortId(value) {
            if (!value || typeof value !== 'string') return 'n/a';
            if (value.length <= 12) return escapeHtml(value);
            return escapeHtml(value.slice(0, 12)) + '...';
        }

        function getSessionTripleKey(session) {
            return session.workspaceId + '::' + session.planId + '::' + session.sessionId;
        }

        function updateSessionsSummary(sessions) {
            var total = sessions.length;
            var active = 0;
            var stopping = 0;

            sessions.forEach(function(session) {
                if (session.status === 'active') active += 1;
                if (session.status === 'stopping') stopping += 1;
            });

            var totalEl = document.getElementById('sessionsTotalCount');
            var activeEl = document.getElementById('sessionsActiveCount');
            var stoppingEl = document.getElementById('sessionsStoppingCount');

            if (totalEl) totalEl.textContent = total + ' total';
            if (activeEl) activeEl.textContent = active + ' active';
            if (stoppingEl) stoppingEl.textContent = stopping + ' stopping';
        }

        function ensureValidSelection(sessions) {
            if (!selectedSessionKey) return;
            var exists = sessions.some(function(session) {
                return getSessionTripleKey(session) === selectedSessionKey;
            });
            if (!exists) {
                selectedSessionKey = null;
            }
        }

        function updateSelectionUi() {
            var selectedTextEl = document.getElementById('selectedSessionText');
            var stopBtn = document.getElementById('stopSessionBtn');
            var injectBtn = document.getElementById('injectSessionBtn');
            var injectText = document.getElementById('injectText');

            var selectedItem = selectedSessionKey
                ? document.querySelector('.session-item[data-session-key="' + selectedSessionKey + '"]')
                : null;

            if (selectedTextEl) {
                if (selectedItem) {
                    var infoEl = selectedItem.querySelector('.session-info');
                    selectedTextEl.textContent = (infoEl && infoEl.getAttribute('data-session-label')) || 'Selected session';
                } else {
                    selectedTextEl.textContent = 'No session selected';
                }
            }

            var hasSelection = !!selectedItem;
            if (stopBtn) stopBtn.disabled = !hasSelection;

            var hasText = !!(injectText && injectText.value && injectText.value.trim().length > 0);
            if (injectBtn) injectBtn.disabled = !(hasSelection && hasText);
        }

        function bindInjectInputHandler() {
            if (injectInputBound) return;
            var input = document.getElementById('injectText');
            var counter = document.getElementById('injectCharCount');
            if (!input || !counter) return;

            input.addEventListener('input', function() {
                var count = input.value.length;
                counter.textContent = count + '/500';
                updateSelectionUi();
            });
            injectInputBound = true;
        }

        function renderSessionsList(sessions) {
            updateSessionsSummary(sessions || []);

            if (!sessions || sessions.length === 0) {
                document.getElementById('sessionsControls').style.display = 'none';
                selectedSessionKey = null;
                return '<div class="empty-state">No active sessions</div>';
            }

            document.getElementById('sessionsControls').style.display = 'block';

            var ordered = sessions.slice().sort(function(a, b) {
                var aStopping = a.status === 'stopping' ? 1 : 0;
                var bStopping = b.status === 'stopping' ? 1 : 0;
                if (aStopping !== bStopping) return aStopping - bStopping;
                var aTime = new Date(a.startedAt).getTime();
                var bTime = new Date(b.startedAt).getTime();
                return bTime - aTime;
            });

            ensureValidSelection(ordered);

            return ordered.map(function(session) {
                var statusClass = getStatusClass(session.status);
                var statusBadge = '<span class="badge ' + statusClass + '">' + escapeHtml(session.status) + '</span>';
                var elapsed = getElapsedTime(session.startedAt);
                var lastTool = session.lastToolCall ?
                    escapeHtml(session.lastToolCall.toolName) + ' (' + session.lastToolCall.callCount + ')' :
                    'No calls yet';

                var tripleKey = getSessionTripleKey(session);
                var isSelected = selectedSessionKey === tripleKey;
                var selectedClass = isSelected ? ' selected' : '';

                var injectPending = session.injectQueue && session.injectQueue.length ? session.injectQueue.length : 0;
                var stopLevel = session.interruptDirective ? session.interruptDirective.escalationLevel : 0;
                var sessionLabel = escapeHtml(session.agentType) + ' · ' + shortId(session.sessionId);

                var forceCloseBtn = session.status === 'stopping'
                    ? '<button class="btn btn-small btn-danger" data-action="force-close-session" data-session-key="' + tripleKey + '" title="Force-close stuck session">Force Close</button>'
                    : '';

                return '<div class="session-item' + selectedClass + '" data-session-key="' + tripleKey + '">' +
                    '<div class="session-info" data-session-label="' + sessionLabel + '">' +
                        '<div class="session-agent">' +
                            '<strong>' + escapeHtml(session.agentType) + '</strong>' +
                            statusBadge +
                            '<span class="session-elapsed">' + elapsed + '</span>' +
                        '</div>' +
                        '<div class="session-meta">' +
                            '<span>Workspace: ' + shortId(session.workspaceId) + '</span>' +
                            '<span>Plan: ' + shortId(session.planId) + '</span>' +
                            '<span>Session: ' + shortId(session.sessionId) + '</span>' +
                        '</div>' +
                        '<div class="session-meta">' +
                            '<span>Last tool: ' + lastTool + '</span>' +
                            '<span>Queued guidance: ' + injectPending + '</span>' +
                            '<span>Stop level: ' + stopLevel + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="session-actions">' +
                        '<button class="btn btn-small btn-secondary" data-action="select-session" data-session-key="' + tripleKey + '">Select</button>' +
                        '<button class="btn btn-small" data-action="quick-stop-session" data-session-key="' + tripleKey + '">Stop</button>' +
                        forceCloseBtn +
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
            latestSessions = sessions || [];
            var sessionsList = document.getElementById('sessionsList');
            if (sessionsList) {
                sessionsList.innerHTML = renderSessionsList(latestSessions);
                attachSessionClickHandlers();
                bindInjectInputHandler();
                updateSelectionUi();
            }
        }

        function attachSessionClickHandlers() {
            var items = document.querySelectorAll('.session-item');
            items.forEach(function(item) {
                item.addEventListener('click', function(event) {
                    if (event.target && event.target.closest('button')) {
                        return;
                    }
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

            updateSelectionUi();
        }

        function handleStopSession(sessionKey) {
            var targetKey = sessionKey || selectedSessionKey;
            if (!targetKey) return;

            if (sessionKey && sessionKey !== selectedSessionKey) {
                handleSessionSelect(sessionKey);
            }

            vscode.postMessage({ 
                type: 'stopSession', 
                data: { sessionKey: targetKey }
            });
        }

        function handleInjectSession(sessionKey) {
            var targetKey = sessionKey || selectedSessionKey;
            if (!targetKey) return;

            if (sessionKey && sessionKey !== selectedSessionKey) {
                handleSessionSelect(sessionKey);
            }

            var injectText = document.getElementById('injectText').value;
            if (!injectText || injectText.trim() === '') return;
            
            vscode.postMessage({ 
                type: 'injectSession', 
                data: { 
                    sessionKey: targetKey,
                    text: injectText
                }
            });
            
            // Clear input after sending
            document.getElementById('injectText').value = '';
            var counter = document.getElementById('injectCharCount');
            if (counter) {
                counter.textContent = '0/500';
            }
            updateSelectionUi();
        }

        function requestSessionsList() {
            vscode.postMessage({ type: 'getSessions' });
        }
    `;
}
