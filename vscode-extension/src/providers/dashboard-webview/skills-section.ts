/**
 * Skills management section for the dashboard webview.
 *
 * Provides HTML template for listing available skills and syncing
 * workspace-local copies. Skills are subdirectories containing a SKILL.md file.
 */

import { IconSvgs } from './icons';

/**
 * HTML for the skills management collapsible section.
 *
 * The skills list container starts with a loading state and is populated
 * dynamically by the client-side JavaScript after receiving skill data
 * from the extension host.
 */
export function getSkillsSectionHtml(iconSvgs: IconSvgs): string {
    return `
                            <section class="collapsible collapsed" id="widget-skills">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-skills">
                                    <span class="chevron">></span>
                                    <h3>Skills</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <p class="always-notes-help">Workspace-local skills remain runtime inputs and are preserved locally. Use these actions to add or refresh copies inside .github/skills.</p>
                                        <div class="skills-header">
                                            <button class="btn btn-small" data-action="refresh-skills" title="Refresh skills list">
                                                ${iconSvgs.syncHistory} Refresh
                                            </button>
                                            <button class="btn btn-small btn-secondary" data-action="run-command" data-command="projectMemory.deploySkills" title="Open the skills picker">
                                                ${iconSvgs.deploySkills} Open Picker
                                            </button>
                                        </div>
                                        <div class="skills-list" id="skillsList">
                                            <div class="empty-state">Loading skills...</div>
                                        </div>
                                    </div>
                                </div>
                            </section>`;
}

/**
 * Client-side JavaScript helpers for the skills section.
 *
 * Includes rendering functions and message handlers for skills data.
 * These are hoisted function declarations that work regardless of
 * insertion order in the main script block.
 */
export function getSkillsClientHelpers(): string {
    return `
        function renderSkillsList(skills) {
            if (!skills || skills.length === 0) {
                return '<div class="empty-state">No skills found</div>';
            }
            return skills.map(function(skill) {
                var workspaceLocal = skill.workspaceLocal === true || skill.deployed === true;
                var deployedBadge = workspaceLocal
                    ? '<span class="badge badge-ok">In Workspace</span>'
                    : '';
                return '<div class="skill-item">' +
                    '<div class="skill-info">' +
                        '<div class="skill-name">' + escapeHtml(skill.name) + '</div>' +
                        '<div class="skill-description">' + escapeHtml(skill.description || '') + '</div>' +
                    '</div>' +
                    '<div class="skill-actions">' +
                        deployedBadge +
                        '<button class="btn btn-small' + (workspaceLocal ? ' btn-secondary' : '') + '" data-action="deploy-skill" data-skill-name="' + escapeHtml(skill.name) + '" title="' + (workspaceLocal ? 'Refresh workspace copy' : 'Add to workspace') + '">' +
                            (workspaceLocal ? 'Sync Copy' : 'Add to Workspace') +
                        '</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        }

        function escapeHtml(str) {
            if (!str) return '';
            return str.replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;');
        }

        function updateSkillsList(skills) {
            var skillsList = document.getElementById('skillsList');
            if (skillsList) {
                skillsList.innerHTML = renderSkillsList(skills);
            }
        }

        function requestSkillsList() {
            vscode.postMessage({ type: 'getSkills' });
        }
    `;
}
