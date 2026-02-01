import * as vscode from 'vscode';

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static readonly viewType = 'projectMemory.dashboard';

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, dashboardUrl: string) {
        this._panel = panel;
        
        // Set the webview's initial html content
        this._update(dashboardUrl);

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'alert':
                        vscode.window.showInformationMessage(message.text);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri, dashboardUrl: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            DashboardPanel.currentPanel._update(dashboardUrl);
            return;
        }

        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            DashboardPanel.viewType,
            '🧠 PMD',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri],
            }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, dashboardUrl);
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, dashboardUrl: string) {
        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, dashboardUrl);
    }

    private _update(dashboardUrl: string) {
        const webview = this._panel.webview;
        this._panel.title = '🧠 PMD';
        this._panel.iconPath = {
            light: vscode.Uri.joinPath(vscode.Uri.file(__dirname), '..', 'resources', 'icon.svg'),
            dark: vscode.Uri.joinPath(vscode.Uri.file(__dirname), '..', 'resources', 'icon.svg')
        };
        webview.html = this._getHtmlForWebview(webview, dashboardUrl);
    }

    private _getHtmlForWebview(webview: vscode.Webview, dashboardUrl: string): string {
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en" style="height: 100%; margin: 0; padding: 0;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${dashboardUrl} http://localhost:*; style-src 'unsafe-inline';">
    <title>Project Memory Dashboard</title>
    <style>
        html, body {
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        .error {
            text-align: center;
            padding: 20px;
        }
        .error h2 {
            color: var(--vscode-errorForeground);
        }
        .error button {
            margin-top: 16px;
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .error button:hover {
            background: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <iframe 
        id="dashboard-frame"
        src="${dashboardUrl}"
        title="Project Memory Dashboard"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    ></iframe>
    
    <script nonce="${nonce}">
        (function() {
            const iframe = document.getElementById('dashboard-frame');
            if (iframe) {
                iframe.onerror = function() {
                    document.body.innerHTML = \`
                        <div class="error">
                            <h2>Unable to load dashboard</h2>
                            <p>Make sure the dashboard server is running on ${dashboardUrl}</p>
                            <button onclick="location.reload()">Retry</button>
                        </div>
                    \`;
                };
            }
        })();
    </script>
</body>
</html>`;
    }

    public dispose() {
        DashboardPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
