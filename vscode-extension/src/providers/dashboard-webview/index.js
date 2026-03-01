"use strict";
/**
 * Dashboard webview HTML generator.
 *
 * Public API for generating the complete webview HTML used by DashboardViewProvider.
 * This module orchestrates icons, styles, client script, and template assembly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebviewHtml = getWebviewHtml;
const icons_1 = require("./icons");
const styles_1 = require("./styles");
const client_script_1 = require("./client-script");
const template_1 = require("./template");
/**
 * Generate the complete HTML for the dashboard webview.
 *
 * This is the single entry point called by DashboardViewProvider._getHtmlForWebview().
 * It assembles all sub-modules (icons, styles, client script, template) into a
 * self-contained HTML document.
 */
function getWebviewHtml(options) {
    const nonce = getNonce();
    const styles = (0, styles_1.getStyles)();
    const iconsJson = JSON.stringify(icons_1.iconSvgs);
    const scriptContent = (0, client_script_1.getClientScript)({
        apiPort: options.apiPort,
        dashboardUrl: options.dashboardUrl,
        workspaceId: options.workspaceId,
        workspaceName: options.workspaceName,
        dataRoot: options.dataRoot,
        iconsJson,
        iconSvgs: icons_1.iconSvgs,
    });
    return (0, template_1.buildHtmlDocument)({
        nonce,
        cspSource: options.cspSource,
        styles,
        scriptContent,
        iconSvgs: icons_1.iconSvgs,
    });
}
/** Generate a cryptographic nonce for CSP-compliant inline scripts */
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=index.js.map