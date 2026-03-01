/**
 * Dashboard webview HTML generator.
 *
 * Public API for generating the complete webview HTML used by DashboardViewProvider.
 * This module orchestrates icons, styles, client script, and template assembly.
 */

import { iconSvgs } from './icons';
import { getStyles } from './styles';
import { getClientScript } from './client-script';
import { buildHtmlDocument } from './template';

/** Options for generating the dashboard webview HTML */
export interface DashboardHtmlOptions {
    /** Webview CSP source string (`webview.cspSource`) */
    cspSource: string;
    /** API server port number */
    apiPort: number;
    /** Dashboard frontend URL */
    dashboardUrl: string;
    /** Current workspace identifier */
    workspaceId: string;
    /** Display name of the current workspace */
    workspaceName: string;
}

/**
 * Generate the complete HTML for the dashboard webview.
 *
 * This is the single entry point called by DashboardViewProvider._getHtmlForWebview().
 * It assembles all sub-modules (icons, styles, client script, template) into a
 * self-contained HTML document.
 */
export function getWebviewHtml(options: DashboardHtmlOptions): string {
    const nonce = getNonce();
    const styles = getStyles();
    const iconsJson = JSON.stringify(iconSvgs);

    const scriptContent = getClientScript({
        apiPort: options.apiPort,
        dashboardUrl: options.dashboardUrl,
        workspaceId: options.workspaceId,
        workspaceName: options.workspaceName,
        iconsJson,
        iconSvgs,
    });

    return buildHtmlDocument({
        nonce,
        cspSource: options.cspSource,
        styles,
        scriptContent,
        iconSvgs,
    });
}

/** Generate a cryptographic nonce for CSP-compliant inline scripts */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
