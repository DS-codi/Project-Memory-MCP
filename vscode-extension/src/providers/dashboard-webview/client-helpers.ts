/**
 * Client-side rendering and data-fetching helpers for the dashboard webview.
 *
 * Returns browser JavaScript function declarations for plan rendering,
 * activity rendering, status card updates, and API data fetching.
 * These are concatenated into the main client script at build time.
 */

/**
 * Build the rendering and data helper functions for the dashboard client JS.
 *
 * All returned functions use `function` declarations and are hoisted by the
 * browser, so insertion order within the script block does not matter.
 */
export function getClientHelpers(): string {
    return `
        function normalizeTopLevelTab(tab) {
            return (tab === 'plans' || tab === 'operations' || tab === 'sprints') ? tab : 'dashboard';
        }

        function normalizePlanSort(sort) {
            return (
                sort === 'recent' ||
                sort === 'title' ||
                sort === 'status' ||
                sort === 'oldest' ||
                sort === 'progress'
            ) ? sort : 'newest';
        }

        function saveDashboardState() {
            vscode.setState({
                topLevelTab: normalizeTopLevelTab(topLevelTab),
                currentPlanTab: (currentPlanTab === 'archived' || currentPlanTab === 'programs') ? currentPlanTab : 'active',
                planSortBy: normalizePlanSort(planSortBy),
                selectedPlanId: selectedPlanId || '',
                selectedPlanWorkspaceId: selectedPlanWorkspaceId || '',
                alwaysProvidedNotes: typeof alwaysProvidedNotes === 'string' ? alwaysProvidedNotes : '',
                currentSprintTab: (currentSprintTab === 'completed' || currentSprintTab === 'archived') ? currentSprintTab : 'active',
                selectedSprintId: selectedSprintId || '',
            });
        }

        function normalizeAlwaysProvidedNotes(value) {
            if (typeof value !== 'string') {
                return '';
            }
            return value.replace(/\\r\\n/g, '\\n').trim();
        }

        function setAlwaysProvidedNotes(notes, options) {
            const persist = !(options && options.persist === false);
            alwaysProvidedNotes = normalizeAlwaysProvidedNotes(notes);
            const input = document.getElementById('alwaysNotesInput');
            if (input && input.value !== alwaysProvidedNotes) {
                input.value = alwaysProvidedNotes;
            }
            if (persist) {
                saveDashboardState();
            }
        }

        function getAlwaysProvidedNotesFromUi() {
            const input = document.getElementById('alwaysNotesInput');
            if (!input) {
                return normalizeAlwaysProvidedNotes(alwaysProvidedNotes);
            }
            return normalizeAlwaysProvidedNotes(input.value);
        }

        function appendAlwaysProvidedNotesQuery(query) {
            const noteValue = normalizeAlwaysProvidedNotes(alwaysProvidedNotes);
            if (!noteValue) {
                return query || '';
            }
            const encoded = 'always_notes=' + encodeURIComponent(noteValue);
            if (!query) {
                return encoded;
            }
            return query + '&' + encoded;
        }

        function setTopLevelTab(tab, options) {
            const nextTab = normalizeTopLevelTab(tab);
            const persist = !(options && options.persist === false);
            topLevelTab = nextTab;

            const tabs = document.querySelectorAll('[data-top-level-tab]');
            for (let index = 0; index < tabs.length; index += 1) {
                const tabButton = tabs[index];
                const tabValue = tabButton.getAttribute('data-top-level-tab');
                const isActive = tabValue === nextTab;
                tabButton.classList.toggle('active', isActive);
                tabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
            }

            const panes = [
                { id: 'dashboardPaneDashboard', value: 'dashboard' },
                { id: 'dashboardPanePlans', value: 'plans' },
                { id: 'dashboardPaneSprints', value: 'sprints' },
                { id: 'dashboardPaneOperations', value: 'operations' },
            ];
            for (let index = 0; index < panes.length; index += 1) {
                const pane = panes[index];
                const paneElement = document.getElementById(pane.id);
                if (paneElement) {
                    paneElement.classList.toggle('active', pane.value === nextTab);
                }
            }

            if (persist) {
                saveDashboardState();
            }
        }

        function applyDashboardState() {
            setTopLevelTab(topLevelTab, { persist: false });
            setPlanSort(planSortBy, { persist: false, update: false });
            setPlanTab(currentPlanTab, { persist: false });
            setSprintTab(currentSprintTab, { persist: false });
            setAlwaysProvidedNotes(alwaysProvidedNotes, { persist: false });
            updateActionAvailability();
        }

        // ── Sprint helpers ────────────────────────────────────────────────────

        function setSprintTab(tab, options) {
            currentSprintTab = (tab === 'completed' || tab === 'archived') ? tab : 'active';
            const persist = !(options && options.persist === false);
            const activeTab = document.getElementById('sprintsTabActive');
            const completedTab = document.getElementById('sprintsTabCompleted');
            const archivedTab = document.getElementById('sprintsTabArchived');
            const activePane = document.getElementById('sprintsPaneActive');
            const completedPane = document.getElementById('sprintsPaneCompleted');
            const archivedPane = document.getElementById('sprintsPaneArchived');
            if (activeTab) activeTab.classList.toggle('active', currentSprintTab === 'active');
            if (completedTab) completedTab.classList.toggle('active', currentSprintTab === 'completed');
            if (archivedTab) archivedTab.classList.toggle('active', currentSprintTab === 'archived');
            if (activePane) activePane.classList.toggle('active', currentSprintTab === 'active');
            if (completedPane) completedPane.classList.toggle('active', currentSprintTab === 'completed');
            if (archivedPane) archivedPane.classList.toggle('active', currentSprintTab === 'archived');
            if (persist) {
                saveDashboardState();
            }
        }

        function setSelectedSprint(sprintId) {
            if (selectedSprintId === sprintId) {
                selectedSprintId = '';
            } else {
                selectedSprintId = sprintId;
            }
            updateSprintLists();
            saveDashboardState();
        }

        function renderGoalList(goals) {
            if (!Array.isArray(goals) || goals.length === 0) {
                return '<div class="empty-state">No goals defined for this sprint.</div>';
            }
            return '<div class="step-viewer-list">' + goals.map(function(goal) {
                const desc = escapeHtml(goal.description || '(untitled goal)');
                const done = goal.completed === true;
                const statusClass = done ? 'done' : 'pending';
                const statusIcon = done ? '&#10003;' : '&#9675;';
                return (
                    '<div class="step-viewer-item">' +
                        '<div class="step-viewer-line">' +
                            '<span class="step-viewer-status ' + statusClass + '" style="width:1.4em;text-align:center">' + statusIcon + '</span>' +
                            '<span class="step-viewer-task">' + desc + '</span>' +
                        '</div>' +
                    '</div>'
                );
            }).join('') + '</div>';
        }

        function renderSprintInlineDetail(sprint) {
            const goals = Array.isArray(sprint.goals) ? sprint.goals : [];
            const pct = typeof sprint.completion_percentage === 'number' ? Math.round(sprint.completion_percentage) : 0;
            const done = sprint.completed_goal_count || 0;
            const total = sprint.goal_count || 0;
            const progressText = total > 0 ? (pct + '% (' + done + '/' + total + ')') : 'No goals';
            return (
                '<div class="plan-inline-panel">' +
                    '<div class="selected-plan-header">' +
                        '<h4>' + escapeHtml(sprint.title || 'Sprint') + '</h4>' +
                        '<span class="selected-plan-meta">' + escapeHtml(progressText) + '</span>' +
                    '</div>' +
                    '<div class="selected-plan-body">' + renderGoalList(goals) + '</div>' +
                '</div>'
            );
        }

        function renderSprintList(sprints, type) {
            if (!Array.isArray(sprints) || sprints.length === 0) {
                return '<div class="empty-state">No ' + escapeHtml(type) + ' sprints</div>';
            }
            return sprints.map(function(sprint) {
                const sprintId = escapeHtml(sprint.sprint_id || 'unknown');
                const title = escapeHtml(sprint.title || '(untitled)');
                const pct = typeof sprint.completion_percentage === 'number' ? Math.round(sprint.completion_percentage) : 0;
                const done = sprint.completed_goal_count || 0;
                const total = sprint.goal_count || 0;
                const progress = total > 0 ? (pct + '% (' + done + '/' + total + ')') : 'No goals';
                const isSelected = selectedSprintId === (sprint.sprint_id || '');
                const attachedPlan = sprint.attached_plan_id
                    ? '<span>Plan: ' + escapeHtml(String(sprint.attached_plan_id).slice(-8)) + '</span>'
                    : '';
                const inlineDetails = isSelected ? renderSprintInlineDetail(sprint) : '';
                return (
                    '<div class="plan-item sprint-item' + (isSelected ? ' selected' : '') + '" data-sprint-id="' + sprintId + '" tabindex="0" role="button" title="View sprint">' +
                        '<div class="plan-primary-row">' +
                            '<div class="plan-info">' +
                                '<div class="plan-title">' + title + '</div>' +
                                '<div class="plan-meta">' +
                                    '<span class="entity-badge sprint">' + escapeHtml(sprint.status || 'active') + '</span>' +
                                    '<span>' + progress + '</span>' +
                                    attachedPlan +
                                '</div>' +
                            '</div>' +
                            '<div class="plan-actions">' +
                                '<button class="btn btn-small btn-secondary" data-action="copy" data-copy="' + sprintId + '" title="Copy sprint ID">&#128203;</button>' +
                            '</div>' +
                        '</div>' +
                        (inlineDetails ? '<div class="plan-details-row">' + inlineDetails + '</div>' : '') +
                    '</div>'
                );
            }).join('');
        }

        function updateSprintLists() {
            const activeList = document.getElementById('sprintsListActive');
            const completedList = document.getElementById('sprintsListCompleted');
            const archivedList = document.getElementById('sprintsListArchived');
            const activeCountEl = document.getElementById('activeSprintsCount');
            const completedCountEl = document.getElementById('completedSprintsCount');
            const archivedCountEl = document.getElementById('archivedSprintsCount');
            if (activeList) activeList.innerHTML = renderSprintList(activeSprints, 'active');
            if (completedList) completedList.innerHTML = renderSprintList(completedSprints, 'completed');
            if (archivedList) archivedList.innerHTML = renderSprintList(archivedSprints, 'archived');
            if (activeCountEl) activeCountEl.textContent = activeSprints.length;
            if (completedCountEl) completedCountEl.textContent = completedSprints.length;
            if (archivedCountEl) archivedCountEl.textContent = archivedSprints.length;
            updateSelectedSprintPanel();
        }

        function updateSelectedSprintPanel() {
            const titleEl = document.getElementById('selectedSprintTitle');
            const metaEl = document.getElementById('selectedSprintMeta');
            const bodyEl = document.getElementById('selectedSprintBody');
            if (!titleEl || !bodyEl) {
                return;
            }
            if (!selectedSprintId) {
                titleEl.textContent = 'No sprint selected';
                if (metaEl) metaEl.textContent = '';
                bodyEl.innerHTML = '<div class="empty-state">Select a sprint to view goals and progress.</div>';
                return;
            }
            const allSprints = [].concat(activeSprints || [], completedSprints || [], archivedSprints || []);
            const sprint = allSprints.find(function(s) { return s.sprint_id === selectedSprintId; });
            if (!sprint) {
                titleEl.textContent = 'Sprint not found';
                if (metaEl) metaEl.textContent = '';
                bodyEl.innerHTML = '<div class="empty-state">Sprint data not available.</div>';
                return;
            }
            const pct = typeof sprint.completion_percentage === 'number' ? Math.round(sprint.completion_percentage) : 0;
            const done = sprint.completed_goal_count || 0;
            const total = sprint.goal_count || 0;
            titleEl.textContent = sprint.title || 'Sprint';
            if (metaEl) metaEl.textContent = sprint.status + ' \u2022 ' + pct + '% complete (' + done + '/' + total + ' goals)';
            bodyEl.innerHTML = renderGoalList(Array.isArray(sprint.goals) ? sprint.goals : []);
        }

        async function fetchSprints() {
            if (!workspaceId) {
                return;
            }
            try {
                const response = await fetch('http://localhost:' + apiPort + '/api/sprints/workspace/' + workspaceId + '?includeArchived=true');
                if (!response.ok) {
                    return;
                }
                const data = await response.json();
                const allSprints = Array.isArray(data.sprints) ? data.sprints : (Array.isArray(data) ? data : []);
                activeSprints = allSprints.filter(function(s) { return s.status === 'active'; });
                completedSprints = allSprints.filter(function(s) { return s.status === 'completed'; });
                archivedSprints = allSprints.filter(function(s) { return s.status === 'archived'; });
                updateSprintLists();
            } catch (err) {
                console.log('Failed to fetch sprints:', err);
            }
        }

        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function normalizePlanEntity(plan) {
            const planId = plan.id || plan.plan_id || 'unknown';
            const title = plan.title || '(untitled)';
            const status = (plan.status || 'unknown').toLowerCase();
            const category = plan.category || 'general';
            const explicitIsProgram =
                plan.is_program === true ||
                plan.is_program === 1 ||
                plan.is_program === '1';
            const inferredIsProgram =
                (Array.isArray(plan.child_plan_ids) && plan.child_plan_ids.length > 0) ||
                (typeof plan.child_plans_count === 'number' && plan.child_plans_count > 0) ||
                (Array.isArray(plan.plans) && plan.plans.length > 0) ||
                typeof plan.program_id === 'string';
            const isProgram = explicitIsProgram || inferredIsProgram;
            const schemaVersion = plan.schema_version || null;
            const currentPhase = plan.current_phase || plan.phase || null;
            const progressDone =
                (typeof plan.progress?.done === 'number' && plan.progress.done) ||
                (typeof plan.done_steps === 'number' && plan.done_steps) ||
                (typeof plan.completed_steps === 'number' && plan.completed_steps) ||
                0;
            const progressTotal =
                (typeof plan.progress?.total === 'number' && plan.progress.total) ||
                (typeof plan.total_steps === 'number' && plan.total_steps) ||
                (typeof plan.step_count === 'number' && plan.step_count) ||
                (Array.isArray(plan.steps) ? plan.steps.length : 0);
            const childPlanCount = Array.isArray(plan.child_plan_ids)
                ? plan.child_plan_ids.length
                : (typeof plan.child_plans_count === 'number'
                    ? plan.child_plans_count
                    : (Array.isArray(plan.plans) ? plan.plans.length : null));
            return {
                ...plan,
                id: planId,
                title,
                status,
                category,
                is_program: isProgram,
                schema_version: schemaVersion,
                current_phase: currentPhase,
                progress: {
                    done: progressDone,
                    total: progressTotal,
                },
                child_plans_count: childPlanCount,
            };
        }

        function extractProgramList(data) {
            const nested = data && data.data && !Array.isArray(data.data) ? data.data : null;
            if (data && Array.isArray(data.programs)) return data.programs;
            if (nested && Array.isArray(nested.programs)) return nested.programs;
            if (Array.isArray(data)) return data;
            return [];
        }

        function renderPlanList(plans, type) {
            if (plans.length === 0) {
                return '<div class="empty-state">No ' + type + ' plans</div>';
            }
            // Template markers expected by tests:
            ${'// class="plan-item\\${isSelected ? \' selected\' : \'\'}"'}
            ${'// data-workspace-id="\\${planWorkspaceId}"'}
            return plans.map(plan => {
                const planId = plan.id || 'unknown';
                const planWorkspaceId = getPlanWorkspaceId(plan);
                const isSelected = selectedPlanId === planId && selectedPlanWorkspaceId === planWorkspaceId;
                const entityType = plan.is_program ? 'Program' : 'Plan';
                const entityClass = plan.is_program ? 'program' : 'plan';
                const metaParts = [
                    (plan.category || 'general'),
                    (plan.progress?.done || 0) + '/' + (plan.progress?.total || 0) + ' steps',
                ];
                if (plan.schema_version) {
                    metaParts.push('v' + plan.schema_version);
                }
                if (plan.current_phase) {
                    metaParts.push(plan.current_phase);
                }
                if (plan.is_program && typeof plan.child_plans_count === 'number') {
                    metaParts.push(plan.child_plans_count + ' child plans');
                }
                const inlineSelectedDetails = isSelected
                    ? renderInlineSelectedPlanDetails(planId, planWorkspaceId)
                    : '';
                return \`
                    <div class="plan-item\${isSelected ? ' selected' : ''}" data-plan-id="\${planId}" data-workspace-id="\${planWorkspaceId}" tabindex="0" role="button" title="Select \${entityType.toLowerCase()}">
                        <div class="plan-primary-row">
                            <div class="plan-info">
                                <div class="plan-title" title="\${plan.title}">\${plan.title}</div>
                                <div class="plan-meta">
                                    <span class="entity-badge \${entityClass}">\${entityType}</span>
                                    \${metaParts.map(part => \`<span>\${part}</span>\`).join('<span>&#8226;</span>')}
                                </div>
                            </div>
                            <span class="plan-status \${plan.status}">\${plan.status}</span>
                            <div class="plan-actions">
                                <button class="btn btn-small btn-secondary" data-action="copy" data-copy="\${planId}" title="Copy plan ID">&#128203;</button>
                                <button class="btn btn-small btn-secondary" data-action="open-plan-browser" data-plan-id="\${planId}" data-workspace-id="\${planWorkspaceId}" title="Open plan in default browser">&#8599;</button>
                                <button class="btn btn-small" data-action="open-plan" data-plan-id="\${planId}" data-workspace-id="\${planWorkspaceId}" title="Open plan">&#8594;</button>
                            </div>
                        </div>
                        \${inlineSelectedDetails ? '<div class="plan-details-row">' + inlineSelectedDetails + '</div>' : ''}
                    </div>
                \`;
            }).join('');
        }

        function renderInlineSelectedPlanDetails(planId, planWorkspaceId) {
            const selectedDetailsId = selectedPlanDetails && (selectedPlanDetails.id || selectedPlanDetails.plan_id);
            const selectedDetailsWorkspaceId = selectedPlanDetails && (selectedPlanDetails.workspace_id || selectedPlanWorkspaceId || workspaceId);
            const hasMatchingDetails = !!selectedPlanDetails &&
                selectedDetailsId === planId &&
                selectedDetailsWorkspaceId === planWorkspaceId;

            if (!hasMatchingDetails) {
                return '<div class="plan-inline-panel"><div class="empty-state">Loading selected plan…</div></div>';
            }

            const status = (selectedPlanDetails.status || 'unknown').toLowerCase();
            const currentPhase = selectedPlanDetails.current_phase || selectedPlanDetails.phase || '';
            const inlineMeta = [status, currentPhase].filter(Boolean).join(' • ');
            const isProgram = selectedPlanDetails.is_program === true ||
                selectedPlanDetails.is_program === 1 ||
                selectedPlanDetails.is_program === '1';
            const detailBody = isProgram
                ? renderProgramChildren(selectedPlanDetails)
                : renderStepViewer(selectedPlanDetails.steps || []);

            return (
                '<div class="plan-inline-panel">' +
                    '<div class="selected-plan-header">' +
                        '<h4>' + escapeHtml(selectedPlanDetails.title || planId) + '</h4>' +
                        '<span class="selected-plan-meta">' + escapeHtml(inlineMeta) + '</span>' +
                    '</div>' +
                    '<div class="selected-plan-body">' + detailBody + '</div>' +
                '</div>'
            );
        }

        function renderProgramsSummary(programs) {
            const totalPrograms = programs.length;
            const activePrograms = programs.filter(program => program.status !== 'archived').length;
            const totalChildPlans = programs.reduce((total, program) => {
                const childCount = typeof program.child_plans_count === 'number' ? program.child_plans_count : 0;
                return total + childCount;
            }, 0);
            return \
                '<div class="programs-summary-item">' +
                    '<span class="programs-summary-label">Programs</span>' +
                    '<span class="programs-summary-value">' + totalPrograms + '</span>' +
                '</div>' +
                '<div class="programs-summary-item">' +
                    '<span class="programs-summary-label">Active</span>' +
                    '<span class="programs-summary-value">' + activePrograms + '</span>' +
                '</div>' +
                '<div class="programs-summary-item">' +
                    '<span class="programs-summary-label">Child plans</span>' +
                    '<span class="programs-summary-value">' + totalChildPlans + '</span>' +
                '</div>';
        }

        function setPlanTab(tab, options) {
            currentPlanTab = (tab === 'archived' || tab === 'programs') ? tab : 'active';
            const persist = !(options && options.persist === false);
            const activeTab = document.getElementById('plansTabActive');
            const archivedTab = document.getElementById('plansTabArchived');
            const programsTab = document.getElementById('plansTabPrograms');
            const activePane = document.getElementById('plansPaneActive');
            const archivedPane = document.getElementById('plansPaneArchived');
            const programsPane = document.getElementById('plansPanePrograms');
            if (activeTab) activeTab.classList.toggle('active', currentPlanTab === 'active');
            if (archivedTab) archivedTab.classList.toggle('active', currentPlanTab === 'archived');
            if (programsTab) programsTab.classList.toggle('active', currentPlanTab === 'programs');
            if (activePane) activePane.classList.toggle('active', currentPlanTab === 'active');
            if (archivedPane) archivedPane.classList.toggle('active', currentPlanTab === 'archived');
            if (programsPane) programsPane.classList.toggle('active', currentPlanTab === 'programs');
            if (persist) {
                saveDashboardState();
            }
        }

        function setPlanSort(sort, options) {
            planSortBy = normalizePlanSort(sort);
            const persist = !(options && options.persist === false);
            const shouldUpdate = !(options && options.update === false);
            const sortSelect = document.getElementById('plansSortSelect');
            if (sortSelect && sortSelect.value !== planSortBy) {
                sortSelect.value = planSortBy;
            }
            if (shouldUpdate) {
                updatePlanLists();
            }
            if (persist) {
                saveDashboardState();
            }
        }

        function getPlanUpdatedTimestamp(plan) {
            const rawValue = plan.updated_at || plan.last_updated || plan.updatedAt;
            if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
                return rawValue;
            }
            if (typeof rawValue === 'string' && rawValue) {
                const normalized = rawValue.includes('T') ? rawValue : rawValue.replace(' ', 'T');
                const parsed = Date.parse(normalized);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }
            return 0;
        }

        function getPlanCreatedTimestamp(plan) {
            const rawValue = plan.created_at || plan.createdAt || plan.created || plan.timestamp;
            if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
                return rawValue;
            }
            if (typeof rawValue === 'string' && rawValue) {
                const normalized = rawValue.includes('T') ? rawValue : rawValue.replace(' ', 'T');
                const parsed = Date.parse(normalized);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }
            return 0;
        }

        function sortPlans(plans, sort) {
            const normalizedSort = normalizePlanSort(sort);
            return (Array.isArray(plans) ? plans.slice() : []).sort((leftPlan, rightPlan) => {
                const leftTitle = String(leftPlan.title || '').toLowerCase();
                const rightTitle = String(rightPlan.title || '').toLowerCase();
                const leftUpdated = getPlanUpdatedTimestamp(leftPlan);
                const rightUpdated = getPlanUpdatedTimestamp(rightPlan);

                if (normalizedSort === 'title') {
                    return leftTitle.localeCompare(rightTitle);
                }

                if (normalizedSort === 'recent') {
                    if (rightUpdated !== leftUpdated) {
                        return rightUpdated - leftUpdated;
                    }
                    return leftTitle.localeCompare(rightTitle);
                }

                if (normalizedSort === 'oldest') {
                    if (leftUpdated !== rightUpdated) {
                        return leftUpdated - rightUpdated;
                    }
                    return leftTitle.localeCompare(rightTitle);
                }

                if (normalizedSort === 'progress') {
                    const leftTotal = leftPlan.progress?.total || 0;
                    const rightTotal = rightPlan.progress?.total || 0;
                    const leftDone = leftPlan.progress?.done || 0;
                    const rightDone = rightPlan.progress?.done || 0;
                    const leftRatio = leftTotal > 0 ? leftDone / leftTotal : 0;
                    const rightRatio = rightTotal > 0 ? rightDone / rightTotal : 0;
                    if (rightRatio !== leftRatio) {
                        return rightRatio - leftRatio;
                    }
                    if (rightDone !== leftDone) {
                        return rightDone - leftDone;
                    }
                    return leftTitle.localeCompare(rightTitle);
                }

                if (normalizedSort === 'status') {
                    const leftStatus = String(leftPlan.status || '').toLowerCase();
                    const rightStatus = String(rightPlan.status || '').toLowerCase();
                    const statusCompare = leftStatus.localeCompare(rightStatus);
                    return statusCompare !== 0 ? statusCompare : leftTitle.localeCompare(rightTitle);
                }

                const leftCreated = getPlanCreatedTimestamp(leftPlan) || leftUpdated;
                const rightCreated = getPlanCreatedTimestamp(rightPlan) || rightUpdated;
                if (rightCreated !== leftCreated) {
                    return rightCreated - leftCreated;
                }
                return leftTitle.localeCompare(rightTitle);
            });
        }

        function getPlanSignature(plans) {
            return plans.map(plan => {
                const id = plan.id || 'unknown';
                const status = plan.status || 'unknown';
                const type = plan.is_program ? 'program' : 'plan';
                const schemaVersion = plan.schema_version || '';
                const phase = plan.current_phase || '';
                const done = plan.progress?.done || 0;
                const total = plan.progress?.total || 0;
                const childCount = typeof plan.child_plans_count === 'number' ? plan.child_plans_count : '';
                return id + ':' + type + ':' + status + ':' + schemaVersion + ':' + phase + ':' + childCount + ':' + done + '/' + total;
            }).join('|');
        }

        function extractPlanList(data) {
            const nested = data && data.data && !Array.isArray(data.data) ? data.data : null;
            if (Array.isArray(data)) return data;
            if (data && Array.isArray(data.plans)) return data.plans;
            if (data && Array.isArray(data.active_plans)) return data.active_plans;
            if (data && Array.isArray(data.data)) return data.data;
            if (nested && Array.isArray(nested.plans)) return nested.plans;
            if (nested && Array.isArray(nested.active_plans)) return nested.active_plans;
            if (nested && Array.isArray(nested.data)) return nested.data;
            return [];
        }

        async function fetchPlans() {
            if (!workspaceId) {
                console.log('No workspaceId, skipping plan fetch');
                return;
            }
            console.log('Fetching plans for workspace:', workspaceId);
            try {
                const response = await fetch('http://localhost:' + apiPort + '/api/plans/workspace/' + workspaceId);
                console.log('Plans response status:', response.status);
                if (response.ok) {
                    const data = await response.json();
                    console.log('Plans data:', data);
                    const allPlans = extractPlanList(data);
                    const normalized = allPlans.map(normalizePlanEntity);
                    const nextPrograms = normalized.filter(p => p.is_program);
                    const nonProgramPlans = normalized.filter(p => !p.is_program);
                    const nextActive = nonProgramPlans.filter(p => p.status !== 'archived');
                    const nextArchived = nonProgramPlans.filter(p => p.status === 'archived');

                    let finalPrograms = nextPrograms;
                    if (finalPrograms.length === 0) {
                        try {
                            const programsResponse = await fetch('http://localhost:' + apiPort + '/api/programs/' + workspaceId);
                            if (programsResponse.ok) {
                                const programsData = await programsResponse.json();
                                const programItems = extractProgramList(programsData);
                                finalPrograms = programItems.map(program => normalizePlanEntity({
                                    ...program,
                                    id: program.program_id || program.id,
                                    title: program.name || program.title,
                                    status: program.status || 'active',
                                    category: program.category || 'program',
                                    is_program: true,
                                    child_plans_count: Array.isArray(program.plans) ? program.plans.length : 0,
                                    progress: {
                                        done: program.aggregate_progress?.done_steps || 0,
                                        total: program.aggregate_progress?.total_steps || 0,
                                    },
                                }));
                            }
                        } catch (programError) {
                            console.log('Failed to fetch programs fallback:', programError);
                        }
                    }

                    const signature = getPlanSignature(nextActive) + '||' + getPlanSignature(nextArchived) + '||' + getPlanSignature(finalPrograms);
                    const previousSelectedPlanId = selectedPlanId;
                    const previousSelectedPlanWorkspaceId = selectedPlanWorkspaceId;

                    activePlans = nextActive;
                    archivedPlans = nextArchived;
                    programPlans = finalPrograms;
                    ensureSelectedPlanIsValid();

                    const selectionChanged =
                        previousSelectedPlanId !== selectedPlanId ||
                        previousSelectedPlanWorkspaceId !== selectedPlanWorkspaceId;

                    if (signature !== lastPlanSignature || selectionChanged) {
                        lastPlanSignature = signature;
                        updatePlanLists();
                    }

                    if (selectedPlanId && selectedPlanWorkspaceId) {
                        fetchSelectedPlanDetails();
                    }
                }
            } catch (error) {
                console.log('Failed to fetch plans:', error);
            }
        }

        function getPlanWorkspaceId(plan) {
            return plan.workspace_id || plan.workspaceId || workspaceId;
        }

        function getKnownPlans() {
            return [].concat(activePlans || [], archivedPlans || [], programPlans || []);
        }

        function findPlanBySelection(planId, planWorkspaceId) {
            if (!planId || !planWorkspaceId) {
                return null;
            }

            const knownPlans = getKnownPlans();
            for (let index = 0; index < knownPlans.length; index += 1) {
                const plan = knownPlans[index];
                const candidatePlanId = plan.id || plan.plan_id || 'unknown';
                const candidateWorkspaceId = getPlanWorkspaceId(plan);
                if (candidatePlanId === planId && candidateWorkspaceId === planWorkspaceId) {
                    return plan;
                }
            }

            return null;
        }

        function ensureSelectedPlanIsValid() {
            if (!selectedPlanId || !selectedPlanWorkspaceId) {
                selectedPlanId = '';
                selectedPlanWorkspaceId = '';
                selectedPlanDetails = null;
                return;
            }

            const existing = findPlanBySelection(selectedPlanId, selectedPlanWorkspaceId);
            if (!existing) {
                selectedPlanId = '';
                selectedPlanWorkspaceId = '';
                selectedPlanDetails = null;
            }
        }

        function scrollPlanItemIntoView(planId, planWorkspaceId) {
            if (!planId || !planWorkspaceId) {
                return;
            }

            const listContainers = [
                document.getElementById('plansListActive'),
                document.getElementById('plansListArchived'),
                document.getElementById('plansListPrograms'),
            ];

            for (let index = 0; index < listContainers.length; index += 1) {
                const container = listContainers[index];
                if (!container) {
                    continue;
                }

                const selector = '.plan-item[data-plan-id="' + planId + '"][data-workspace-id="' + planWorkspaceId + '"]';
                const planItem = container.querySelector(selector);
                if (planItem) {
                    planItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    return;
                }
            }
        }

        function setSelectedPlan(planId, planWorkspaceId) {
            const options = arguments.length > 2 ? arguments[2] : undefined;
            const shouldToggle = !(options && options.toggle === false);
            const nextPlanId = planId || '';
            const nextWorkspaceId = planWorkspaceId || workspaceId || '';
            const isSameSelection = !!selectedPlanId &&
                selectedPlanId === nextPlanId &&
                selectedPlanWorkspaceId === nextWorkspaceId;

            let collapsedPlanId = '';
            let collapsedWorkspaceId = '';

            if (shouldToggle && isSameSelection) {
                collapsedPlanId = selectedPlanId;
                collapsedWorkspaceId = selectedPlanWorkspaceId;
                selectedPlanId = '';
                selectedPlanWorkspaceId = '';
                selectedPlanDetails = null;
                selectedPlanBuildScripts = [];
            } else {
                selectedPlanId = nextPlanId;
                selectedPlanWorkspaceId = nextWorkspaceId;
            }

            ensureSelectedPlanIsValid();
            updatePlanLists();
            if (selectedPlanId && selectedPlanWorkspaceId) {
                fetchSelectedPlanDetails();
            }
            saveDashboardState();
            updateActionAvailability();

            if (collapsedPlanId && collapsedWorkspaceId) {
                setTimeout(() => {
                    scrollPlanItemIntoView(collapsedPlanId, collapsedWorkspaceId);
                }, 0);
            }
        }

        function getSelectedPlanTarget() {
            ensureSelectedPlanIsValid();
            if (!selectedPlanId || !selectedPlanWorkspaceId) {
                return null;
            }
            return {
                planId: selectedPlanId,
                workspaceId: selectedPlanWorkspaceId,
            };
        }

        function getSelectedTargetType() {
            const target = getSelectedPlanTarget();
            if (!target) {
                return 'none';
            }

            const selectedPlan = (selectedPlanDetails &&
                ((selectedPlanDetails.id === target.planId || selectedPlanDetails.plan_id === target.planId) &&
                    (selectedPlanDetails.workspace_id || target.workspaceId) === target.workspaceId))
                ? selectedPlanDetails
                : findPlanBySelection(target.planId, target.workspaceId);

            if (!selectedPlan) {
                return 'active';
            }

            const isProgram = selectedPlan.is_program === true || selectedPlan.is_program === 1 || selectedPlan.is_program === '1';
            if (isProgram) {
                return 'program';
            }

            const status = String(selectedPlan.status || '').toLowerCase();
            return status === 'archived' ? 'archived' : 'active';
        }

        function getAvailabilityContext() {
            return {
                connected: hasRenderedDashboard,
                workspaceResolved: !!workspaceId,
                targetType: getSelectedTargetType(),
            };
        }

        function getAvailabilityState(key, context) {
            // 'Program handoff is not available yet.'
            if (!context.connected) {
                return {
                    enabled: false,
                    tooltip: 'Connect to Project Memory server first.',
                };
            }

            if (key === 'workspace-create-plan') {
                if (!context.workspaceResolved) {
                    return {
                        enabled: false,
                        tooltip: 'Open a workspace to resolve context.',
                    };
                }
                return { enabled: true };
            }

            if (
                key === 'plan-context-files' ||
                key === 'plan-context-note' ||
                key === 'plan-research-note' ||
                key === 'plan-build-scripts' ||
                key === 'plan-run-script'
            ) {
                if (!context.workspaceResolved) {
                    return {
                        enabled: false,
                        tooltip: 'Open a workspace to resolve context.',
                    };
                }
                return { enabled: true };
            }

            if (key === 'plan-resume') {
                if (!context.workspaceResolved) {
                    return {
                        enabled: false,
                        tooltip: 'Open a workspace to resolve context.',
                    };
                }
                if (context.targetType === 'none') {
                    return {
                        enabled: false,
                        tooltip: 'Select a plan or program first.',
                    };
                }
                if (context.targetType !== 'archived') {
                    return {
                        enabled: false,
                        tooltip: 'Only archived plans can be resumed.',
                    };
                }
                return { enabled: true };
            }

            if (key === 'plan-archive') {
                if (!context.workspaceResolved) {
                    return {
                        enabled: false,
                        tooltip: 'Open a workspace to resolve context.',
                    };
                }
                if (context.targetType === 'none') {
                    return {
                        enabled: false,
                        tooltip: 'Select a plan or program first.',
                    };
                }
                if (context.targetType !== 'active') {
                    return {
                        enabled: false,
                        tooltip: 'Only active plans can be archived.',
                    };
                }
                return { enabled: true };
            }

            if (key === 'plan-handoff') {
                if (!context.workspaceResolved) {
                    return {
                        enabled: false,
                        tooltip: 'Open a workspace to resolve context.',
                    };
                }
                if (context.targetType === 'program') {
                    return {
                        enabled: false,
                        tooltip: 'Program handoff is not available yet.',
                    };
                }
                if (context.targetType === 'archived') {
                    return {
                        enabled: false,
                        tooltip: 'Archived plans cannot be handed off.',
                    };
                }
                return { enabled: true };
            }

            return {
                enabled: false,
                tooltip: 'This action is unavailable in the current panel state.',
            };
        }

        function updateActionAvailability() {
            const context = getAvailabilityContext();
            const buttons = document.querySelectorAll('[data-availability-key]');
            for (let index = 0; index < buttons.length; index += 1) {
                const button = buttons[index];
                const availabilityKey = button.getAttribute('data-availability-key') || '';
                if (!availabilityKey) {
                    continue;
                }

                if (!button.hasAttribute('data-enabled-title')) {
                    const initialTitle = button.getAttribute('title') || '';
                    button.setAttribute('data-enabled-title', initialTitle);
                }

                const enabledTitle = button.getAttribute('data-enabled-title') || '';
                const state = getAvailabilityState(availabilityKey, context);
                if (state.enabled) {
                    button.disabled = false;
                    button.setAttribute('aria-disabled', 'false');
                    button.classList.remove('is-disabled');
                    button.setAttribute('title', enabledTitle);
                } else {
                    button.disabled = true;
                    button.setAttribute('aria-disabled', 'true');
                    button.classList.add('is-disabled');
                    button.setAttribute('title', state.tooltip || enabledTitle || 'This action is unavailable in the current panel state.');
                }
            }
        }

        function getEventPayload(event) {
            if (!event || typeof event !== 'object') {
                return {};
            }

            if (event.payload && typeof event.payload === 'object') {
                return event.payload;
            }
            if (event.data && typeof event.data === 'object') {
                return event.data;
            }
            if (event.details && typeof event.details === 'object') {
                return event.details;
            }
            return {};
        }

        function findPromptAnalystEvent(events) {
            if (!Array.isArray(events)) {
                return null;
            }

            for (let index = 0; index < events.length; index += 1) {
                const event = events[index];
                const type = String(event?.type || '').toLowerCase();
                const payload = getEventPayload(event);
                const looksLikePromptAnalyst =
                    type.includes('prompt_analyst') ||
                    type.includes('context_enrichment') ||
                    typeof payload.scope_classification === 'string' ||
                    typeof payload.decomposition_strategy === 'string' ||
                    typeof payload.confidence_score === 'number';

                if (looksLikePromptAnalyst) {
                    return { event, payload };
                }
            }

            return null;
        }

        function setListContent(elementId, items, emptyMessage) {
            const listElement = document.getElementById(elementId);
            if (!listElement) {
                return;
            }

            if (!Array.isArray(items) || items.length === 0) {
                listElement.innerHTML = '<li class="ops-list-empty">' + escapeHtml(emptyMessage) + '</li>';
                return;
            }

            listElement.innerHTML = items.map(item => '<li>' + item + '</li>').join('');
        }

        function updatePromptAnalystPanel() {
            const scopeElement = document.getElementById('promptAnalystScope');
            const strategyElement = document.getElementById('promptAnalystStrategy');
            const confidenceElement = document.getElementById('promptAnalystConfidence');
            const decisionElement = document.getElementById('promptAnalystDecision');
            const summaryElement = document.getElementById('promptAnalystSummary');

            const record = findPromptAnalystEvent(recentEvents || []);
            if (!record) {
                if (scopeElement) scopeElement.textContent = 'Not available';
                if (strategyElement) strategyElement.textContent = 'No decomposition strategy captured.';
                if (confidenceElement) confidenceElement.textContent = 'Not available';
                if (decisionElement) decisionElement.textContent = 'Awaiting Prompt Analyst telemetry.';
                if (summaryElement) {
                    summaryElement.innerHTML = '';
                }
                setListContent('promptAnalystConstraints', [], 'No constraint notes captured.');
                setListContent('promptAnalystCodeRefs', [], 'No code references captured.');
                return;
            }

            const payload = record.payload || {};
            const scope = typeof payload.scope_classification === 'string' ? payload.scope_classification : 'Not provided';
            const strategy = typeof payload.decomposition_strategy === 'string' ? payload.decomposition_strategy : 'No decomposition strategy captured.';
            const confidence = typeof payload.confidence_score === 'number'
                ? Math.round(payload.confidence_score * 100) + '%'
                : 'Not provided';
            const rationale = typeof payload.confidence_rationale === 'string'
                ? payload.confidence_rationale
                : 'No confidence rationale captured.';

            if (scopeElement) scopeElement.textContent = scope;
            if (strategyElement) strategyElement.textContent = strategy;
            if (confidenceElement) confidenceElement.textContent = confidence;
            if (decisionElement) decisionElement.textContent = rationale;

            if (summaryElement) {
                const recommendedPlanCount = typeof payload.recommended_plan_count === 'number' ? payload.recommended_plan_count : 0;
                const recommendedProgramCount = typeof payload.recommended_program_count === 'number' ? payload.recommended_program_count : 0;
                const integratedProgram = payload.recommends_integrated_program === true ? 'Integrated program required' : 'Integrated program optional';
                summaryElement.innerHTML = [
                    '<span class="ops-inline-pill">Plans: ' + recommendedPlanCount + '</span>',
                    '<span class="ops-inline-pill">Programs: ' + recommendedProgramCount + '</span>',
                    '<span class="ops-inline-pill">' + integratedProgram + '</span>'
                ].join('');
            }

            const constraints = Array.isArray(payload.constraint_notes) ? payload.constraint_notes : [];
            setListContent(
                'promptAnalystConstraints',
                constraints.map(note => escapeHtml(String(note))),
                'No constraint notes captured.'
            );

            const references = Array.isArray(payload.relevant_code_references) ? payload.relevant_code_references : [];
            const referenceItems = references.map(reference => {
                const path = escapeHtml(reference && reference.path ? String(reference.path) : 'unknown');
                const reason = escapeHtml(reference && reference.reason ? String(reference.reason) : 'No reason provided');
                return '<strong>' + path + '</strong> — ' + reason;
            });
            setListContent('promptAnalystCodeRefs', referenceItems, 'No code references captured.');
        }

        function getLatestBuildRunEvent(events) {
            if (!Array.isArray(events)) {
                return null;
            }
            for (let index = 0; index < events.length; index += 1) {
                const event = events[index];
                const type = String(event?.type || '').toLowerCase();
                const payload = getEventPayload(event);
                const matches =
                    type.includes('build') ||
                    type.includes('script_run') ||
                    type.includes('run_build_script') ||
                    !!payload.script_id ||
                    !!payload.script_name;
                if (matches) {
                    return { event, payload };
                }
            }
            return null;
        }

        function updateBuildGatePanel() {
            const countElement = document.getElementById('buildGateCount');
            const runElement = document.getElementById('buildGateLastRun');
            const scriptsElement = document.getElementById('buildGateScriptsList');

            if (countElement) {
                countElement.textContent = String(Array.isArray(selectedPlanBuildScripts) ? selectedPlanBuildScripts.length : 0);
            }

            const latestRun = getLatestBuildRunEvent(recentEvents || []);
            if (runElement) {
                if (!latestRun) {
                    runElement.textContent = 'No run recorded';
                } else {
                    const payload = latestRun.payload || {};
                    const scriptName = payload.script_name || payload.script_id || latestRun.event.type || 'Script run';
                    const hasError = payload.error || payload.failed || payload.success === false;
                    runElement.textContent = String(scriptName) + (hasError ? ' (failed)' : ' (ok)');
                    runElement.classList.toggle('ops-status-bad', !!hasError);
                    runElement.classList.toggle('ops-status-ok', !hasError);
                }
            }

            if (!scriptsElement) {
                return;
            }

            if (!Array.isArray(selectedPlanBuildScripts) || selectedPlanBuildScripts.length === 0) {
                scriptsElement.innerHTML = '<li class="ops-list-empty">Select a plan to inspect registered build scripts.</li>';
                return;
            }

            scriptsElement.innerHTML = selectedPlanBuildScripts.map(script => {
                const name = escapeHtml(String(script.name || script.script_name || script.id || 'Unnamed script'));
                const command = escapeHtml(String(script.command || script.script_command || ''));
                const directory = escapeHtml(String(script.directory || script.directory_path || script.script_directory || '.'));
                return '<li><strong>' + name + '</strong><br><span class="ops-list-meta">' + command + ' @ ' + directory + '</span></li>';
            }).join('');
        }

        function updateOperationsSurface(_data) {
            // Supported dashboard surfaces are described statically in the shell.
            // The archived session/integrity cards were removed, so no DOM mutation
            // is required here beyond keeping the call site intact.
        }

        function updatePlanIntelligencePanel() {
            const summaryElement = document.getElementById('planIntelSummary');
            const depsElement = document.getElementById('planIntelDependencies');
            const agentElement = document.getElementById('planIntelRecommendedAgent');
            const confirmationElement = document.getElementById('planIntelConfirmations');

            if (!selectedPlanDetails) {
                if (summaryElement) summaryElement.textContent = 'Select a plan to inspect orchestration metadata.';
                if (depsElement) depsElement.textContent = 'None';
                if (agentElement) agentElement.textContent = 'None';
                if (confirmationElement) confirmationElement.textContent = 'None pending';
                return;
            }

            const dependencies = Array.isArray(selectedPlanDetails.depends_on_plans)
                ? selectedPlanDetails.depends_on_plans
                : (Array.isArray(selectedPlanDetails.linked_plan_ids) ? selectedPlanDetails.linked_plan_ids : []);

            const recommendedAgent = selectedPlanDetails.recommended_next_agent || selectedPlanDetails.current_agent || 'None';
            const steps = Array.isArray(selectedPlanDetails.steps) ? selectedPlanDetails.steps : [];
            const pendingConfirmations = steps.filter(step => {
                const requires = step && (step.requires_confirmation === true || step.requires_user_confirmation === true);
                const status = String(step?.status || '').toLowerCase();
                return requires && status !== 'done';
            }).length;

            if (depsElement) {
                depsElement.textContent = dependencies.length > 0 ? String(dependencies.length) : 'None';
            }
            if (agentElement) {
                agentElement.textContent = String(recommendedAgent);
            }
            if (confirmationElement) {
                confirmationElement.textContent = pendingConfirmations > 0 ? (pendingConfirmations + ' pending') : 'None pending';
            }

            if (summaryElement) {
                const phase = selectedPlanDetails.current_phase || selectedPlanDetails.phase || 'No phase';
                const status = selectedPlanDetails.status || 'unknown';
                const dependencyText = dependencies.length > 0
                    ? ('Depends on: ' + dependencies.map(id => String(id).slice(-8)).join(', '))
                    : 'No linked dependencies';
                summaryElement.textContent = phase + ' • ' + status + ' • ' + dependencyText;
            }
        }

        function getSelectedPlanPanelElements() {
            return {
                title: document.getElementById('selectedPlanTitle'),
                meta: document.getElementById('selectedPlanMeta'),
                body: document.getElementById('selectedPlanBody'),
            };
        }

        function renderStepViewer(steps) {
            if (!Array.isArray(steps) || steps.length === 0) {
                return '<div class="empty-state">No steps available for this plan.</div>';
            }

            const orderedSteps = steps.slice().sort((a, b) => {
                const left = typeof a.index === 'number' ? a.index : Number.MAX_SAFE_INTEGER;
                const right = typeof b.index === 'number' ? b.index : Number.MAX_SAFE_INTEGER;
                return left - right;
            });

            return '<div class="step-viewer-list">' + orderedSteps.map(step => {
                const index = typeof step.index === 'number' ? step.index + 1 : '?';
                const task = escapeHtml(step.task || '(untitled step)');
                const phase = escapeHtml(step.phase || 'Unknown phase');
                const type = escapeHtml(step.type || 'standard');
                const status = String(step.status || 'pending').toLowerCase();
                const safeStatus = escapeHtml(status);

                return (
                    '<div class="step-viewer-item">' +
                        '<div class="step-viewer-line">' +
                            '<span class="step-viewer-index">#' + index + '</span>' +
                            '<span class="step-viewer-task">' + task + '</span>' +
                            '<span class="step-viewer-status ' + safeStatus + '">' + safeStatus + '</span>' +
                        '</div>' +
                        '<div class="step-viewer-meta">' +
                            '<span>' + phase + '</span>' +
                            '<span>&#8226;</span>' +
                            '<span>' + type + '</span>' +
                        '</div>' +
                    '</div>'
                );
            }).join('') + '</div>';
        }

        function renderProgramChildren(program) {
            const directChildren = Array.isArray(program?.child_plans)
                ? program.child_plans
                : (Array.isArray(program?.plans) ? program.plans : []);
            const childIds = Array.isArray(program?.child_plan_ids) ? program.child_plan_ids : [];

            if (directChildren.length === 0 && childIds.length === 0) {
                return '<div class="empty-state">No child plans available for this program.</div>';
            }

            const childItems = directChildren.length > 0
                ? directChildren
                : childIds.map(childPlanId => ({
                    id: childPlanId,
                    title: String(childPlanId),
                    status: 'unknown',
                    current_phase: '',
                }));

            return '<div class="step-viewer-list">' + childItems.map((child, index) => {
                const childId = child.id || child.plan_id || 'unknown';
                const childTitle = escapeHtml(child.title || child.name || String(childId));
                const childStatus = escapeHtml(String(child.status || 'unknown').toLowerCase());
                const childPhase = escapeHtml(child.current_phase || child.phase || 'No phase');

                return (
                    '<div class="step-viewer-item">' +
                        '<div class="step-viewer-line">' +
                            '<span class="step-viewer-index">#' + (index + 1) + '</span>' +
                            '<span class="step-viewer-task">' + childTitle + '</span>' +
                            '<span class="step-viewer-status ' + childStatus + '">' + childStatus + '</span>' +
                        '</div>' +
                        '<div class="step-viewer-meta">' +
                            '<span>' + escapeHtml(String(childId)) + '</span>' +
                            '<span>&#8226;</span>' +
                            '<span>' + childPhase + '</span>' +
                        '</div>' +
                    '</div>'
                );
            }).join('') + '</div>';
        }

        function updateSelectedPlanPanel() {
            const elements = getSelectedPlanPanelElements();
            if (!elements.title || !elements.meta || !elements.body) {
                return;
            }

            if (!selectedPlanDetails) {
                elements.title.textContent = 'No plan selected';
                elements.meta.textContent = '';
                elements.body.innerHTML = '<div class="empty-state">Select a plan to view steps, or a program to view child plans.</div>';
                return;
            }

            const planId = selectedPlanDetails.id || selectedPlanDetails.plan_id || selectedPlanId || 'unknown';
            const workspaceValue = selectedPlanDetails.workspace_id || selectedPlanWorkspaceId || workspaceId;
            const status = (selectedPlanDetails.status || 'unknown').toLowerCase();
            const currentPhase = selectedPlanDetails.current_phase || selectedPlanDetails.phase || '';
            const isProgram = selectedPlanDetails.is_program === true ||
                selectedPlanDetails.is_program === 1 ||
                selectedPlanDetails.is_program === '1';

            elements.title.textContent = selectedPlanDetails.title || planId;
            elements.meta.textContent = [workspaceValue, status, currentPhase].filter(Boolean).join(' • ');
            elements.body.innerHTML = isProgram
                ? renderProgramChildren(selectedPlanDetails)
                : renderStepViewer(selectedPlanDetails.steps || []);
        }

        async function fetchSelectedPlanDetails() {
            const target = getSelectedPlanTarget();
            if (!target) {
                selectedPlanDetails = null;
                selectedPlanBuildScripts = [];
                updateSelectedPlanPanel();
                updateBuildGatePanel();
                updatePlanIntelligencePanel();
                updateActionAvailability();
                return;
            }

            const selectedSummary = findPlanBySelection(target.planId, target.workspaceId);
            const selectedIsProgram = !!selectedSummary && (
                selectedSummary.is_program === true ||
                selectedSummary.is_program === 1 ||
                selectedSummary.is_program === '1'
            );

            try {
                let planDetails;

                if (selectedIsProgram) {
                    const response = await fetch('http://localhost:' + apiPort + '/api/programs/' + target.workspaceId + '/' + target.planId);

                    if (response.ok) {
                        const payload = await response.json();
                        const programDetails = payload?.data?.program || payload?.program || payload?.data || payload;

                        planDetails = normalizePlanEntity({
                            ...programDetails,
                            id: programDetails?.program_id || programDetails?.id || target.planId,
                            title: programDetails?.name || programDetails?.title || target.planId,
                            workspace_id: programDetails?.workspace_id || target.workspaceId,
                            status: programDetails?.status || 'active',
                            category: programDetails?.category || 'program',
                            is_program: true,
                            child_plans: Array.isArray(programDetails?.plans)
                                ? programDetails.plans
                                : (Array.isArray(selectedSummary?.plans) ? selectedSummary.plans : []),
                            child_plan_ids: Array.isArray(programDetails?.plans)
                                ? programDetails.plans
                                    .map(plan => plan.plan_id || plan.id)
                                    .filter(Boolean)
                                : (Array.isArray(selectedSummary?.child_plan_ids) ? selectedSummary.child_plan_ids : []),
                            child_plans_count: Array.isArray(programDetails?.plans)
                                ? programDetails.plans.length
                                : (typeof selectedSummary?.child_plans_count === 'number' ? selectedSummary.child_plans_count : 0),
                            progress: {
                                done: programDetails?.aggregate_progress?.done_steps || 0,
                                total: programDetails?.aggregate_progress?.total_steps || 0,
                            },
                            steps: [],
                        });
                    } else {
                        const programsResponse = await fetch('http://localhost:' + apiPort + '/api/programs/' + target.workspaceId);
                        if (!programsResponse.ok) {
                            throw new Error('Failed to load program details (' + response.status + ')');
                        }

                        const programsPayload = await programsResponse.json();
                        const programItems = extractProgramList(programsPayload);
                        const matchedProgram = programItems.find(program => (program.program_id || program.id) === target.planId);
                        if (!matchedProgram) {
                            throw new Error('Program not found in workspace listing');
                        }

                        planDetails = normalizePlanEntity({
                            ...matchedProgram,
                            id: matchedProgram.program_id || matchedProgram.id || target.planId,
                            title: matchedProgram.name || matchedProgram.title || target.planId,
                            workspace_id: matchedProgram.workspace_id || target.workspaceId,
                            status: matchedProgram.status || 'active',
                            category: matchedProgram.category || 'program',
                            is_program: true,
                            child_plans: Array.isArray(matchedProgram.plans) ? matchedProgram.plans : [],
                            child_plan_ids: Array.isArray(matchedProgram.plans)
                                ? matchedProgram.plans
                                    .map(plan => plan.plan_id || plan.id)
                                    .filter(Boolean)
                                : [],
                            child_plans_count: Array.isArray(matchedProgram.plans) ? matchedProgram.plans.length : 0,
                            progress: {
                                done: matchedProgram.aggregate_progress?.done_steps || 0,
                                total: matchedProgram.aggregate_progress?.total_steps || 0,
                            },
                            steps: [],
                        });
                    }
                } else {
                    const response = await fetch('http://localhost:' + apiPort + '/api/plans/' + target.workspaceId + '/' + target.planId);
                    if (!response.ok) {
                        throw new Error('Failed to load plan details (' + response.status + ')');
                    }

                    const payload = await response.json();
                    planDetails = payload?.data?.plan || payload?.plan || payload?.data || payload;
                }

                if (!planDetails || typeof planDetails !== 'object') {
                    throw new Error('Invalid plan details response payload');
                }

                selectedPlanDetails = planDetails;
                updateSelectedPlanPanel();
                updatePlanLists();
                updatePlanIntelligencePanel();
                updateActionAvailability();

                if (selectedIsProgram) {
                    selectedPlanBuildScripts = [];
                } else {
                    try {
                        const scriptsResponse = await fetch('http://localhost:' + apiPort + '/api/plans/' + target.planId + '/build-scripts');
                        if (scriptsResponse.ok) {
                            const scriptsPayload = await scriptsResponse.json();
                            const scriptsData = scriptsPayload?.data && !Array.isArray(scriptsPayload.data)
                                ? scriptsPayload.data
                                : undefined;
                            selectedPlanBuildScripts = Array.isArray(scriptsPayload?.scripts)
                                ? scriptsPayload.scripts
                                : (Array.isArray(scriptsData?.scripts) ? scriptsData.scripts : []);
                        } else {
                            selectedPlanBuildScripts = [];
                        }
                    } catch (scriptError) {
                        console.log('Failed to fetch build scripts for selected plan:', scriptError);
                        selectedPlanBuildScripts = [];
                    }
                }

                updateBuildGatePanel();
            } catch (error) {
                console.log('Failed to fetch selected plan details:', error);
                selectedPlanDetails = normalizePlanEntity({
                    id: target.planId,
                    workspace_id: target.workspaceId,
                    title: selectedSummary?.title || selectedSummary?.name || target.planId,
                    status: selectedSummary?.status || 'unknown',
                    category: selectedSummary?.category || (selectedIsProgram ? 'program' : 'general'),
                    is_program: selectedIsProgram,
                    child_plans: selectedIsProgram
                        ? (Array.isArray(selectedSummary?.plans)
                            ? selectedSummary.plans
                            : (Array.isArray(selectedSummary?.child_plans) ? selectedSummary.child_plans : []))
                        : [],
                    child_plan_ids: selectedIsProgram
                        ? (Array.isArray(selectedSummary?.child_plan_ids)
                            ? selectedSummary.child_plan_ids
                            : (Array.isArray(selectedSummary?.plans)
                                ? selectedSummary.plans
                                    .map(plan => plan.plan_id || plan.id)
                                    .filter(Boolean)
                                : []))
                        : [],
                    child_plans_count: selectedIsProgram
                        ? (typeof selectedSummary?.child_plans_count === 'number'
                            ? selectedSummary.child_plans_count
                            : (Array.isArray(selectedSummary?.plans) ? selectedSummary.plans.length : 0))
                        : 0,
                    steps: [],
                });
                selectedPlanBuildScripts = [];
                updateSelectedPlanPanel();
                updatePlanLists();
                updatePlanIntelligencePanel();
                updateBuildGatePanel();
                updateActionAvailability();
            }
        }

        function updatePlanLists() {
            const activeList = document.getElementById('plansListActive');
            const archivedList = document.getElementById('plansListArchived');
            const programsList = document.getElementById('plansListPrograms');
            const programsSummary = document.getElementById('programsSummary');
            const activeCount = document.getElementById('activeCount');
            const archivedCount = document.getElementById('archivedCount');
            const programsCount = document.getElementById('programsCount');
            const sortedActivePlans = sortPlans(activePlans, planSortBy);
            const sortedArchivedPlans = sortPlans(archivedPlans, planSortBy);
            const sortedProgramPlans = sortPlans(programPlans, planSortBy);
            if (activeList) activeList.innerHTML = renderPlanList(sortedActivePlans, 'active');
            if (archivedList) archivedList.innerHTML = renderPlanList(sortedArchivedPlans, 'archived');
            if (programsList) programsList.innerHTML = renderPlanList(sortedProgramPlans, 'programs');
            if (programsSummary) programsSummary.innerHTML = renderProgramsSummary(sortedProgramPlans);
            if (activeCount) activeCount.textContent = activePlans.length;
            if (archivedCount) archivedCount.textContent = archivedPlans.length;
            if (programsCount) programsCount.textContent = programPlans.length;
            setPlanTab(currentPlanTab);
            updateSelectedPlanPanel();
            updatePlanIntelligencePanel();
            updateBuildGatePanel();
            updateActionAvailability();
            saveDashboardState();
        }

        function eventLabel(event) {
            if (!event || !event.type) return 'Activity';
            switch (event.type) {
                case 'handoff_completed':
                case 'handoff_started':
                    return 'Handoff';
                case 'note_added':
                    return 'Note added';
                case 'step_updated':
                    return 'Step updated';
                case 'plan_created':
                    return 'Plan created';
                case 'plan_archived':
                    return 'Plan archived';
                default:
                    return event.type.replace(/_/g, ' ');
            }
        }

        function eventIcon(event) {
            if (!event || !event.type) return icons.diagnostics;
            if (event.type.startsWith('handoff')) return icons.handoffEvent;
            if (event.type === 'note_added') return icons.noteEvent;
            if (event.type === 'step_updated') return icons.stepUpdate;
            return icons.diagnostics;
        }

        function renderActivityList(events) {
            if (!events || events.length === 0) {
                return '<div class="empty-state">No recent activity</div>';
            }
            return events.map(event => {
                const label = eventLabel(event);
                const time = event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '';
                return \`
                    <div class="activity-item">
                        \${eventIcon(event)}
                        <span>\${label}</span>
                        <span style="margin-left:auto; color: var(--vscode-descriptionForeground);">\${time}</span>
                    </div>
                \`;
            }).join('');
        }

        async function fetchEvents() {
            try {
                let response = await fetch('http://localhost:' + apiPort + '/api/events?limit=25');
                if (!response.ok) {
                    response = await fetch('http://localhost:' + apiPort + '/api/events');
                }
                if (response.ok) {
                    const data = await response.json();
                    const events = Array.isArray(data.events) ? data.events : [];
                    recentEvents = events.slice(0, 25);
                    const activityList = document.getElementById('activityList');
                    if (activityList) {
                        activityList.innerHTML = renderActivityList(recentEvents.slice(0, 5));
                    }
                    updatePromptAnalystPanel();
                    updateBuildGatePanel();
                }
            } catch (error) {
                console.log('Failed to fetch events:', error);
            }
        }

        function updateStatusCards(data) {
            latestHealthSnapshot = data;
            const healthValue = document.getElementById('healthStatusValue');
            const staleValue = document.getElementById('staleStatusValue');
            const dataRootValue = document.getElementById('dataRootValue');
            function setStatusClass(element, state) {
                if (!element) return;
                element.classList.remove('status-ok', 'status-warn', 'status-bad');
                if (state) { element.classList.add(state); }
            }
            if (healthValue) {
                if (data && typeof data.status === 'string') {
                    healthValue.textContent = data.status;
                    setStatusClass(healthValue, data.status === 'ok' ? 'status-ok' : 'status-warn');
                } else if (data && data.ok === true) {
                    healthValue.textContent = 'Healthy';
                    setStatusClass(healthValue, 'status-ok');
                } else if (data && data.ok === false) {
                    healthValue.textContent = 'Unhealthy';
                    setStatusClass(healthValue, 'status-bad');
                } else {
                    healthValue.textContent = 'Connected';
                    setStatusClass(healthValue, null);
                }
            }
            if (staleValue) {
                if (data && typeof data.stale_count === 'number') {
                    staleValue.textContent = data.stale_count === 0 ? 'None' : data.stale_count + ' stale';
                    setStatusClass(staleValue, data.stale_count === 0 ? 'status-ok' : 'status-warn');
                } else if (data && Array.isArray(data.stale_processes)) {
                    staleValue.textContent = data.stale_processes.length === 0 ? 'None' : data.stale_processes.length + ' stale';
                    setStatusClass(staleValue, data.stale_processes.length === 0 ? 'status-ok' : 'status-warn');
                } else if (data && typeof data.stale === 'boolean') {
                    staleValue.textContent = data.stale ? 'Stale' : 'Fresh';
                    setStatusClass(staleValue, data.stale ? 'status-warn' : 'status-ok');
                } else {
                    staleValue.textContent = 'Not available';
                    setStatusClass(staleValue, null);
                }
            }
            if (dataRootValue) {
                dataRootValue.textContent = (data && data.dbPath) || (data && data.dataRoot) || 'Unknown';
            }

            updateOperationsSurface(data);
        }

        function setLayoutSize(width) {
            document.body.classList.remove('size-small', 'size-medium', 'size-large');
            if (width < 300) {
                document.body.classList.add('size-small');
            } else if (width < 420) {
                document.body.classList.add('size-medium');
            } else {
                document.body.classList.add('size-large');
            }
        }
    `;
}
