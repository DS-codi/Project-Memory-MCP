/**
 * Instructions deployment section for the dashboard webview.
 *
 * Provides HTML template for listing available instructions and syncing
 * workspace-local copies. Instructions are .instructions.md files in the
 * instructions/ directory.
 */

import { IconSvgs } from './icons';

/**
 * HTML for the instructions management collapsible section.
 *
 * The instructions list container starts with a loading state and is populated
 * dynamically by the client-side JavaScript after receiving instruction data
 * from the extension host.
 */
export function getInstructionsSectionHtml(iconSvgs: IconSvgs): string {
    return `
                            <section class="collapsible collapsed" id="widget-instructions">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-instructions">
                                    <span class="chevron">></span>
                                    <h3>Instructions</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <p class="always-notes-help">Workspace-local instructions are preserved by context-sync classification. Use these actions to add or refresh copies, not to delete them.</p>
                                        <div class="instructions-header">
                                            <button class="btn btn-small" data-action="refresh-instructions" title="Refresh instructions list">
                                                ${iconSvgs.syncHistory} Refresh
                                            </button>
                                            <button class="btn btn-small btn-secondary" data-action="run-command" data-command="projectMemory.deployInstructions" title="Open the instructions picker">
                                                ${iconSvgs.deployInstructions} Open Picker
                                            </button>
                                        </div>
                                        <div class="instructions-list" id="instructionsList">
                                            <div class="empty-state">Loading instructions...</div>
                                        </div>
                                    </div>
                                </div>
                            </section>`;
}

/**
 * Client-side JavaScript helpers for the instructions section.
 *
 * Includes rendering functions and message handlers for instructions data.
 * These are hoisted function declarations that work regardless of
 * insertion order in the main script block.
 */
export function getInstructionsClientHelpers(): string {
    return `
        function renderInstructionsList(instructions) {
            if (!instructions || instructions.length === 0) {
                return '<div class="empty-state">No instructions found</div>';
            }
            return instructions.map(function(instr) {
                var workspaceLocal = instr.workspaceLocal === true || instr.deployed === true;
                var deployedBadge = workspaceLocal
                    ? '<span class="badge badge-ok">In Workspace</span>'
                    : '';
                var actionBtn = '<button class="btn btn-small' + (workspaceLocal ? ' btn-secondary' : '') + '" data-action="deploy-instruction" data-instruction-name="' + escapeHtml(instr.name) + '" title="' + (workspaceLocal ? 'Refresh workspace copy' : 'Add to workspace') + '">' + (workspaceLocal ? 'Sync Copy' : 'Add to Workspace') + '</button>';
                return '<div class="instruction-item">' +
                    '<div class="instruction-info">' +
                        '<div class="instruction-name">' + escapeHtml(instr.name) + '</div>' +
                    '</div>' +
                    '<div class="instruction-actions">' +
                        deployedBadge +
                        actionBtn +
                    '</div>' +
                '</div>';
            }).join('');
        }

        function updateInstructionsList(instructions) {
            var instructionsList = document.getElementById('instructionsList');
            if (instructionsList) {
                instructionsList.innerHTML = renderInstructionsList(instructions);
            }
        }

        function requestInstructionsList() {
            vscode.postMessage({ type: 'getInstructions' });
        }
    `;
}
