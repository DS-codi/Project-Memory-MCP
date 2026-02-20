/**
 * CSS styles for the dashboard webview.
 *
 * Returns the full CSS stylesheet content (without wrapping `<style>` tags).
 */

/** Generate the dashboard webview CSS styles */
export function getStyles(): string {
    return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { 
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); 
            background: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #cccccc);
            min-height: 100%;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
        }
        .header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            gap: 8px;
            position: sticky;
            top: 0;
            background: var(--vscode-editor-background);
            z-index: 10;
        }
        .header h2 { font-size: 14px; font-weight: 600; }
        .status { 
            display: flex; 
            align-items: center; 
            gap: 6px;
            margin-left: auto;
            font-size: 12px;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--vscode-testing-iconPassed);
        }
        .status-dot.error { background: var(--vscode-testing-iconFailed); }
        .status-dot.loading { background: var(--vscode-testing-iconQueued); animation: pulse 1s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .header-btn {
            background: transparent;
            border: 1px solid var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            padding: 2px 6px;
            border-radius: 3px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
        }
        .header-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .header-btn svg { width: 12px; height: 12px; }
        .header-btn.isolated { border-color: var(--vscode-inputValidation-warningBorder); color: var(--vscode-inputValidation-warningBorder); }
        .content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            padding-bottom: 20px;
        }
        .fallback {
            padding: 20px;
            text-align: center;
        }
        .fallback p { margin-bottom: 12px; color: var(--vscode-descriptionForeground); }
        .btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            margin: 4px;
        }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-small {
            padding: 4px 8px;
            font-size: 11px;
            margin: 2px;
        }
        .icon-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
        }
        .icon-btn {
            border: 1px solid var(--vscode-panel-border);
            background: transparent;
            border-radius: 6px;
            padding: 8px 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: var(--vscode-editor-foreground);
        }
        .icon-btn:hover { background: var(--vscode-list-hoverBackground); }
        .icon-btn:focus { outline: 1px solid var(--vscode-focusBorder); }
        .icon-btn svg {
            width: 18px;
            height: 18px;
            opacity: 0.9;
            display: block;
        }
        .icon-row-title {
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .action-groups {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .action-group {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 10px;
            background: var(--vscode-editor-background);
        }
        .action-group .icon-grid {
            grid-template-columns: repeat(4, 1fr);
        }
        .plans-widget {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            margin: 0;
            overflow: hidden;
        }
        .plans-header {
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .plans-header h3 {
            font-size: 12px;
            flex: 1;
        }
        .plans-tabs {
            display: grid;
            grid-template-columns: 1fr 1fr;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .plans-tab {
            background: transparent;
            border: none;
            padding: 10px 12px;
            cursor: pointer;
            font-size: 12px;
            color: var(--vscode-editor-foreground);
        }
        .plans-tab .count {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 10px;
            margin-left: 6px;
        }
        .plans-tab.active {
            background: var(--vscode-list-hoverBackground);
            font-weight: 600;
        }
        .plans-content { max-height: 300px; overflow-y: auto; }
        .plans-pane { display: none; }
        .plans-pane.active { display: block; }
        .activity-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .activity-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
        }
        .activity-item svg {
            width: 16px;
            height: 16px;
            opacity: 0.9;
            display: block;
        }
        body.size-small .icon-grid { grid-template-columns: repeat(3, 1fr); }
        body.size-medium .icon-grid { grid-template-columns: repeat(4, 1fr); }
        body.size-large .icon-grid { grid-template-columns: repeat(6, 1fr); }
        
        /* Toast notifications */
        .toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 10px 16px;
            font-size: 12px;
            z-index: 1000;
            opacity: 0;
            transition: transform 0.3s ease, opacity 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .toast.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
        .toast-success {
            border-color: var(--vscode-testing-iconPassed);
            color: var(--vscode-testing-iconPassed);
        }
        .toast-error {
            border-color: var(--vscode-testing-iconFailed);
            color: var(--vscode-testing-iconFailed);
        }
        
        .info-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            padding: 16px;
            margin: 12px 16px;
        }
        .info-card h3 { font-size: 12px; margin-bottom: 8px; }
        .info-card ul { list-style: none; font-size: 12px; }
        .info-card li { padding: 4px 0; display: flex; gap: 8px; }
        .info-card .label { color: var(--vscode-descriptionForeground); min-width: 80px; }

        .widget-body ul { list-style: none; font-size: 12px; }
        .widget-body li { padding: 4px 0; display: flex; gap: 8px; }
        .label { color: var(--vscode-descriptionForeground); min-width: 80px; }

        .widget-body {
            padding: 12px 16px;
        }

        .stacked-sections {
            display: flex;
            flex-direction: row;
            gap: 12px;
        }

        .stacked-section {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 10px;
            background: rgba(255, 255, 255, 0.02);
            flex: 1 1 0;
        }

        .stacked-section:first-child {
            flex: 2 1 0;
        }

        .stacked-section:last-child {
            flex: 3 1 0;
        }

        body.size-small .stacked-sections {
            flex-direction: column;
        }

        .status-divider {
            border-top: 1px solid var(--vscode-panel-border);
            margin: 10px 0;
            opacity: 0.6;
        }

        .status-list .label {
            min-width: 110px;
        }

        .status-value {
            font-size: 12px;
            font-weight: 600;
            word-break: break-word;
        }

        .status-value.status-ok {
            color: var(--vscode-testing-iconPassed);
        }

        .status-value.status-warn {
            color: var(--vscode-testing-iconQueued);
        }

        .status-value.status-bad {
            color: var(--vscode-testing-iconFailed);
        }

        .search-widget {
            margin: 12px 16px 4px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .search-row {
            display: flex;
            align-items: center;
            gap: 8px;
            border: 1px solid var(--vscode-panel-border);
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            padding: 6px 8px;
        }

        .search-row svg {
            width: 16px;
            height: 16px;
            opacity: 0.85;
        }

        .search-input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--vscode-editor-foreground);
            font-size: 12px;
            outline: none;
        }
        
        /* Collapsible sections */
        .collapsible {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            margin: 8px 16px;
            overflow: hidden;
        }
        .collapsible-header {
            display: flex;
            align-items: center;
            padding: 10px 14px;
            cursor: pointer;
            user-select: none;
            gap: 8px;
            background: transparent;
            border: none;
            width: 100%;
            text-align: left;
            color: inherit;
        }
        .collapsible-header:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .collapsible-header h3 { font-size: 12px; flex: 1; }
        .collapsible-header .count {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
        }
        .collapsible-header .chevron {
            display: inline-block;
            transform: rotate(90deg);
            transition: transform 0.2s;
            font-size: 12px;
        }
        .collapsible.collapsed .chevron { transform: rotate(-90deg); }
        .collapsible-content {
            max-height: 300px;
            overflow-y: auto;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .collapsible.collapsed .collapsible-content { display: none; }
        
        /* Plan items */
        .plan-item {
            display: flex;
            align-items: center;
            padding: 10px 16px;
            gap: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .plan-item:last-child { border-bottom: none; }
        .plan-item:hover { background: var(--vscode-list-hoverBackground); }
        .plan-info { flex: 1; min-width: 0; }
        .plan-title { 
            font-size: 12px; 
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .plan-meta {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            gap: 8px;
            margin-top: 2px;
        }
        .plan-status {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            text-transform: uppercase;
        }
        .plan-status.active { background: var(--vscode-testing-iconPassed); color: white; }
        .plan-status.archived { background: var(--vscode-descriptionForeground); color: white; }
        .plan-actions { display: flex; gap: 4px; }
        
        .empty-state {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        /* Skills section */
        .skills-header {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
        }
        .skills-header .btn { display: flex; align-items: center; gap: 4px; }
        .skills-header .btn svg { width: 14px; height: 14px; }
        .skill-item {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            gap: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .skill-item:last-child { border-bottom: none; }
        .skill-item:hover { background: var(--vscode-list-hoverBackground); }
        .skill-info { flex: 1; min-width: 0; }
        .skill-name {
            font-size: 12px;
            font-weight: 500;
        }
        .skill-description {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .skill-actions { display: flex; gap: 6px; align-items: center; }

        /* Instructions section */
        .instructions-header {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
        }
        .instructions-header .btn { display: flex; align-items: center; gap: 4px; }
        .instructions-header .btn svg { width: 14px; height: 14px; }
        .instruction-item {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            gap: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .instruction-item:last-child { border-bottom: none; }
        .instruction-item:hover { background: var(--vscode-list-hoverBackground); }
        .instruction-info { flex: 1; min-width: 0; }
        .instruction-name {
            font-size: 12px;
            font-weight: 500;
        }
        .instruction-actions { display: flex; gap: 6px; align-items: center; }

        /* Sessions section */
        .sessions-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 10px;
        }
        .sessions-summary {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        .sessions-pill {
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 999px;
            border: 1px solid var(--vscode-panel-border);
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-editor-background);
        }
        .sessions-pill-active {
            color: var(--vscode-testing-iconPassed);
            border-color: var(--vscode-testing-iconPassed);
        }
        .sessions-pill-stopping {
            color: var(--vscode-testing-iconFailed);
            border-color: var(--vscode-testing-iconFailed);
        }
        .sessions-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 10px;
        }
        .session-item {
            display: flex;
            gap: 8px;
            align-items: stretch;
            padding: 10px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            background: var(--vscode-editor-background);
            cursor: pointer;
        }
        .session-item:hover {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-hoverBackground);
        }
        .session-item.selected {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-activeSelectionBackground);
        }
        .session-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1;
            min-width: 0;
        }
        .session-agent {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            flex-wrap: wrap;
        }
        .session-agent strong {
            font-weight: 600;
        }
        .session-elapsed {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .session-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }
        .session-actions {
            display: flex;
            flex-direction: column;
            gap: 6px;
            justify-content: center;
            min-width: 84px;
        }
        .sessions-controls {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 10px;
            background: var(--vscode-editor-background);
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .sessions-controls-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-wrap: wrap;
        }
        .selected-session-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .inject-row {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .inject-row textarea {
            width: 100%;
            min-height: 64px;
            resize: vertical;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 8px;
            font-size: 12px;
            font-family: inherit;
        }
        .inject-row textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 0;
        }
        .inject-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }
        .inject-count {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }

        body.size-small .action-group .icon-grid {
            grid-template-columns: repeat(3, 1fr);
        }
        body.size-small .session-item {
            flex-direction: column;
        }
        body.size-small .session-actions {
            flex-direction: row;
            min-width: 0;
        }
        body.size-small .sessions-controls-header {
            flex-direction: column;
            align-items: flex-start;
        }

        /* Badges */
        .badge {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            text-transform: uppercase;
        }
        .badge-ok { background: var(--vscode-testing-iconPassed); color: white; }
        .badge-warn { background: var(--vscode-testing-iconFailed); color: white; }
    `;
}
