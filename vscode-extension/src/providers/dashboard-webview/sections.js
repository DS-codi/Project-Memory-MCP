"use strict";
/**
 * HTML section templates for the dashboard webview.
 *
 * These functions return HTML strings that are embedded into the client-side
 * JavaScript and rendered dynamically when the dashboard connects or disconnects.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConnectedDashboardHtml = getConnectedDashboardHtml;
exports.getDisconnectedFallbackHtml = getDisconnectedFallbackHtml;
const skills_section_1 = require("./skills-section");
const instructions_section_1 = require("./instructions-section");
const sessions_section_1 = require("./sessions-section");
/**
 * HTML for the connected dashboard state.
 *
 * All icon SVGs and static configuration values are baked in at generation time.
 * The resulting HTML is set as `fallback.innerHTML` by the client-side JavaScript.
 */
function getConnectedDashboardHtml(iconSvgs, apiPort, workspaceName) {
    return `
                            <div class="search-widget">
                                <div class="search-row">
                                    ${iconSvgs.searchBox}
                                    <input class="search-input" id="searchInput" placeholder="Search across memory" />
                                    <button class="btn btn-small" data-action="open-search">Go</button>
                                </div>
                            </div>

                            <section class="collapsible" id="widget-status">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-status">
                                    <span class="chevron">></span>
                                    <h3>Status</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <ul>
                                            <li><span class="label">Status:</span> <span>Running</span></li>
                                            <li><span class="label">API Port:</span> <span>${apiPort}</span></li>
                                            <li><span class="label">Workspace:</span> <span>${workspaceName}</span></li>
                                        </ul>
                                        <div class="status-divider"></div>
                                        <ul class="status-list">
                                            <li><span class="label">Workspace Health</span> <span class="status-value" id="healthStatusValue">Checking...</span></li>
                                            <li><span class="label">Stale/Stop</span> <span class="status-value" id="staleStatusValue">Checking...</span></li>
                                            <li><span class="label">Data Root</span> <span class="status-value" id="dataRootValue">Loading...</span></li>
                                        </ul>
                                        <div class="status-divider"></div>
                                        <div class="status-actions">
                                            <button class="btn btn-small btn-secondary" data-action="open-workspace-folder">&#128194; Open Folder</button>
                                            <button class="btn btn-small btn-secondary" data-action="copy-supervisor-command">&#128203; Copy Launch Command</button>
                                            <button class="btn btn-small btn-secondary" data-action="open-workspace-terminal">&gt;_ Terminal</button>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="collapsible" id="widget-actions">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-actions">
                                    <span class="chevron">></span>
                                    <h3>Control Center</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <div class="action-groups">
                                            <div class="action-group">
                                                <div class="icon-row-title">Workspace</div>
                                                <div class="icon-grid">
                                                    <button class="icon-btn" data-action="open-browser" title="Open Full Dashboard">
                                                        ${iconSvgs.dashboard}
                                                    </button>
                                                    <button class="icon-btn" data-action="refresh" title="Refresh Status">
                                                        ${iconSvgs.syncHistory}
                                                    </button>
                                                    <button class="icon-btn" data-action="run-command" data-command="projectMemory.createPlan" title="Create New Plan">
                                                        ${iconSvgs.createNewPlan}
                                                    </button>
                                                    <button class="icon-btn" data-action="open-resume-plan" title="Resume Plan">
                                                        ${iconSvgs.resumePlan}
                                                    </button>
                                                    <button class="icon-btn" data-action="open-archive-plan" title="Archive Plan">
                                                        ${iconSvgs.archive}
                                                    </button>
                                                </div>
                                            </div>
                                            <div class="action-group">
                                                <div class="icon-row-title">Deploy &#x2014; Hub Agents</div>
                                                <div class="icon-grid">
                                                    <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployAgents" title="Deploy Agents">
                                                        ${iconSvgs.deployAgents}
                                                    </button>
                                                    <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployInstructions" title="Deploy Instructions">
                                                        ${iconSvgs.deployInstructions}
                                                    </button>
                                                    <button class="icon-btn" data-action="run-command" data-command="projectMemory.deploySkills" title="Deploy Skills">
                                                        ${iconSvgs.deploySkills}
                                                    </button>
                                                    <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployDefaults" title="Deploy All Defaults">
                                                        ${iconSvgs.deployAllDefaults}
                                                    </button>
                                                </div>
                                            </div>
                                            <div class="action-group">
                                                <div class="icon-row-title">Supervisor</div>
                                                <div class="icon-grid">
                                                    <button class="icon-btn" data-action="run-command" data-command="project-memory.launchSupervisor" title="Launch Supervisor (background)">
                                                        ${iconSvgs.runButton}
                                                    </button>
                                                    <button class="icon-btn" data-action="run-command" data-command="project-memory.launchSupervisorInTerminal" title="Launch Supervisor in Terminal">
                                                        ${iconSvgs.terminalIcon}
                                                    </button>
                                                    <button class="icon-btn" data-action="run-command" data-command="project-memory.openSupervisorDirectory" title="Open Supervisor Directory">
                                                        ${iconSvgs.folderOpen}
                                                    </button>
                                                    <button class="icon-btn" data-action="configure-supervisor-path" title="Configure Supervisor Path">
                                                        ${iconSvgs.configureDefaults}
                                                    </button>
                                                </div>
                                            </div>
                                            <div class="action-group">
                                                <div class="icon-row-title">Build & System</div>
                                                <div class="icon-grid">
                                                    <button class="icon-btn" data-action="open-build-scripts" title="Build Scripts">
                                                        ${iconSvgs.buildScript}
                                                    </button>
                                                    <button class="icon-btn" data-action="open-run-script" title="Run Script">
                                                        ${iconSvgs.runButton}
                                                    </button>
                                                    <button class="icon-btn" data-action="open-handoff" title="Agent Handoff">
                                                        ${iconSvgs.agentHandoff}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="collapsible" id="widget-config-context">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-config-context">
                                    <span class="chevron">></span>
                                    <h3>Configuration & Context</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <div class="stacked-sections">
                                            <div class="stacked-section">
                                                <div class="icon-row-title">Configuration</div>
                                                <div class="icon-grid">
                                                    <button class="icon-btn" data-action="run-command" data-command="projectMemory.openSettings" title="Configure Defaults">
                                                        ${iconSvgs.configureDefaults}
                                                    </button>
                                                    <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployDefaults" title="Deploy All Defaults">
                                                        ${iconSvgs.deployAllDefaults}
                                                    </button>
                                                </div>
                                            </div>
                                            <div class="stacked-section">
                                                <div class="icon-row-title">Context</div>
                                                <div class="icon-grid">
                                                    <button class="icon-btn" data-action="open-context-note" title="Add Context Note">
                                                        ${iconSvgs.addContextNote}
                                                    </button>
                                                    <button class="icon-btn" data-action="open-research-note" title="Add Research Note">
                                                        ${iconSvgs.researchNote}
                                                    </button>
                                                    <button class="icon-btn" data-action="open-context-files" title="View Context Files">
                                                        ${iconSvgs.contextFilesGrid}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

${(0, skills_section_1.getSkillsSectionHtml)(iconSvgs)}

${(0, instructions_section_1.getInstructionsSectionHtml)(iconSvgs)}

${(0, sessions_section_1.getSessionsSectionHtml)(iconSvgs)}

                            <section class="collapsible" id="widget-plans">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-plans">
                                    <span class="chevron">></span>
                                    <h3>Plans & Programs</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="plans-widget">
                                        <div class="plans-header">
                                            <h3>Plans & Programs</h3>
                                        </div>
                                        <div class="plans-tabs">
                                            <button class="plans-tab active" id="plansTabActive" data-tab="active">
                                                Active <span class="count" id="activeCount">0</span>
                                            </button>
                                            <button class="plans-tab" id="plansTabArchived" data-tab="archived">
                                                Archived <span class="count" id="archivedCount">0</span>
                                            </button>
                                            <button class="plans-tab" id="plansTabPrograms" data-tab="programs">
                                                Programs <span class="count" id="programsCount">0</span>
                                            </button>
                                        </div>
                                        <div class="plans-content">
                                            <div class="plans-pane active" id="plansPaneActive">
                                                <div id="plansListActive">
                                                    <div class="empty-state">Loading...</div>
                                                </div>
                                            </div>
                                            <div class="plans-pane" id="plansPaneArchived">
                                                <div id="plansListArchived">
                                                    <div class="empty-state">Loading...</div>
                                                </div>
                                            </div>
                                            <div class="plans-pane" id="plansPanePrograms">
                                                <div class="programs-summary" id="programsSummary"></div>
                                                <div id="plansListPrograms">
                                                    <div class="empty-state">Loading...</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="collapsible" id="widget-activity">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-activity">
                                    <span class="chevron">></span>
                                    <h3>Recent Activity</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <div class="activity-list" id="activityList">
                                            <div class="empty-state">Loading activity...</div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                        `;
}
/**
 * HTML for the disconnected/error fallback state.
 *
 * Uses escaped template expressions (`\${errorText}`, `\${apiPort}`) that become
 * browser-side template literal interpolations referencing client JS variables.
 */
function getDisconnectedFallbackHtml() {
    return `
                    <p>Supervisor is not running</p>
                    <p style="margin-top: 8px; color: var(--vscode-descriptionForeground); font-size: 11px;">Health check: \${errorText}</p>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px;">
                        <button class="btn" data-action="run-command" data-command="project-memory.launchSupervisor">&#9654; Launch</button>
                        <button class="btn btn-secondary" data-action="run-command" data-command="project-memory.launchSupervisorInTerminal">&gt;_ Terminal</button>
                        <button class="btn btn-secondary" data-action="run-command" data-command="project-memory.openSupervisorDirectory">&#128194; Directory</button>
                    </div>
                    <button class="btn btn-secondary" style="margin-top: 6px; width: 100%;" data-action="configure-supervisor-path">&#9881; Configure Supervisor Path</button>
                    <button class="btn btn-secondary" style="margin-top: 6px; width: 100%;" data-action="refresh">&#8635; Retry Connection</button>
                    <div class="info-card" style="margin-top: 16px;">
                        <h3>Troubleshooting</h3>
                        <ul>
                            <li>Set <strong>supervisor.launcherPath</strong> to your supervisor.exe</li>
                            <li>Check if port \${apiPort} is available</li>
                            <li>View server logs for errors</li>
                        </ul>
                        <button class="btn btn-secondary" style="margin-top: 12px" data-action="run-command" data-command="projectMemory.showServerLogs">Show Logs</button>
                    </div>
                `;
}
//# sourceMappingURL=sections.js.map