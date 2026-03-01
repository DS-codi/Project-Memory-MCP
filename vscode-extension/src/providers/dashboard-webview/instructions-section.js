"use strict";
/**
 * Instructions deployment section for the dashboard webview.
 *
 * Provides HTML template for listing available instructions and toggling
 * their deployment to the workspace. Instructions are .instructions.md files
 * in the instructions/ directory.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInstructionsSectionHtml = getInstructionsSectionHtml;
exports.getInstructionsClientHelpers = getInstructionsClientHelpers;
/**
 * HTML for the instructions management collapsible section.
 *
 * The instructions list container starts with a loading state and is populated
 * dynamically by the client-side JavaScript after receiving instruction data
 * from the extension host.
 */
function getInstructionsSectionHtml(iconSvgs) {
    return `
                            <section class="collapsible collapsed" id="widget-instructions">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-instructions">
                                    <span class="chevron">></span>
                                    <h3>Instructions</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <div class="instructions-header">
                                            <button class="btn btn-small" data-action="refresh-instructions" title="Refresh instructions list">
                                                ${iconSvgs.syncHistory} Refresh
                                            </button>
                                            <button class="btn btn-small btn-secondary" data-action="run-command" data-command="projectMemory.deployInstructions" title="Deploy instructions via picker">
                                                ${iconSvgs.deployInstructions} Deploy All
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
function getInstructionsClientHelpers() {
    return `
        function renderInstructionsList(instructions) {
            if (!instructions || instructions.length === 0) {
                return '<div class="empty-state">No instructions found</div>';
            }
            return instructions.map(function(instr) {
                var deployedBadge = instr.deployed
                    ? '<span class="badge badge-ok">Deployed</span>'
                    : '';
                var actionBtn = instr.deployed
                    ? '<button class="btn btn-small btn-secondary" data-action="undeploy-instruction" data-instruction-name="' + escapeHtml(instr.name) + '" title="Remove from workspace">Undeploy</button>'
                    : '<button class="btn btn-small" data-action="deploy-instruction" data-instruction-name="' + escapeHtml(instr.name) + '" title="Deploy to workspace">Deploy</button>';
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
//# sourceMappingURL=instructions-section.js.map