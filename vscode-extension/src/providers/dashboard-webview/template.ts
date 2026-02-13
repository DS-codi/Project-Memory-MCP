/**
 * HTML document template for the dashboard webview.
 *
 * Assembles the full `<!DOCTYPE html>` document from styles, body content,
 * and client-side script content.
 */

import { IconSvgs } from './icons';

/** Parameters for building the HTML document */
export interface TemplateParams {
    /** CSP nonce for inline scripts */
    nonce: string;
    /** Webview CSP source (`webview.cspSource`) */
    cspSource: string;
    /** CSS stylesheet content (without `<style>` tags) */
    styles: string;
    /** Client-side JavaScript content (without `<script>` tags) */
    scriptContent: string;
    /** Icon SVGs record (used for the header isolate button) */
    iconSvgs: IconSvgs;
}

/**
 * Build the complete HTML document for the dashboard webview.
 *
 * Produces a self-contained HTML page with inlined styles, a static header,
 * a fallback/content area, and the client-side script.
 */
export function buildHtmlDocument(params: TemplateParams): string {
    const { nonce, cspSource, styles, scriptContent, iconSvgs } = params;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} vscode-resource: vscode-webview-resource: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src http://localhost:* ws://localhost:*; frame-src http://localhost:*;">
    <title>Project Memory Dashboard</title>
    <style>
${styles}
    </style>
</head>
<body>
    <div class="header">
        <h2>Project Memory</h2>
        <button class="header-btn" id="isolateBtn" data-action="isolate-server" title="Spawn isolated server for this workspace">
            ${iconSvgs.isolate}
            <span id="isolateBtnText">Isolate</span>
        </button>
        <div class="status">
            <span class="status-dot loading" id="statusDot"></span>
            <span id="statusText">Checking...</span>
        </div>
    </div>
    <div class="content" id="content">
        <div class="fallback" id="fallback">
            <p>Connecting to dashboard server...</p>
        </div>
    </div>
    
    <script nonce="${nonce}">
${scriptContent}
    </script>
</body>
</html>`;
}
