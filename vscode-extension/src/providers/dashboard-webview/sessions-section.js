"use strict";
/**
 * Sessions management section for the dashboard webview.
 *
 * NOTE: Active Sessions panel has been migrated to the Supervisor GUI (QML).
 * These functions are stubbed and return empty strings.
 * The Supervisor GUI polls GET /sessions/live and renders sessions directly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionsSectionHtml = getSessionsSectionHtml;
exports.getSessionsClientHelpers = getSessionsClientHelpers;
/**
 * HTML for the active sessions collapsible section.
 * @deprecated Migrated to Supervisor GUI. Returns empty string.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getSessionsSectionHtml(_iconSvgs) {
    // Active Sessions panel has been moved to the Supervisor GUI.
    return '';
}
/**
 * Client-side JavaScript helpers for the sessions section.
 * @deprecated Migrated to Supervisor GUI.
 *
 * The dashboard script still references legacy session helper functions.
 * Return no-op implementations to avoid runtime ReferenceError exceptions
 * that can incorrectly force the dashboard into "Disconnected" state.
 */
function getSessionsClientHelpers() {
    return `
        function updateSessionsList(_sessions) { }
        function requestSessionsList() { }
        function handleSessionSelect(_sessionKey) { }
        function handleStopSession(_sessionKey) { }
        function handleInjectSession() { }
    `;
}
// ---------------------------------------------------------------------------
// Legacy exports kept for reference (not active)
// ---------------------------------------------------------------------------
function _legacyGetSessionsSectionHtml(iconSvgs) {
    return `
                            <section>${iconSvgs.syncHistory}</section>`;
}
// Suppress "unused" warnings on the legacy function
void _legacyGetSessionsSectionHtml;
//# sourceMappingURL=sessions-section.js.map