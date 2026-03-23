/**
 * Sessions UI helpers for the dashboard webview.
 *
 * The side-panel sessions surface was removed. Live session management remains
 * available through the Supervisor GUI, so the dashboard only renders a status
 * note that points users to the supported surface.
 */

export function getArchivedSessionsNoticeHtml(): string {
    return `
        <div class="info-card" style="margin-top: 12px;">
            <h3>Sessions Moved</h3>
            <p>Live sessions are managed in the Supervisor GUI. The VS Code dashboard now focuses on plan navigation, notes sync, build scripts, skills, and instructions.</p>
        </div>
    `;
}

export function getSessionsClientHelpers(): string {
    return `
        function updateSessionsList(_sessions) { }
        function requestSessionsList() { }
        function handleSessionSelect(_sessionKey) { }
        function handleStopSession(_sessionKey) { }
        function handleInjectSession() { }
    `;
}
