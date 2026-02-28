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
            return plans.map(plan => {
                const planId = plan.id || 'unknown';
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
                return \`
                    <div class="plan-item">
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
                            <button class="btn btn-small btn-secondary" data-action="open-plan-browser" data-plan-id="\${planId}" title="Open plan in default browser">&#8599;</button>
                            <button class="btn btn-small" data-action="open-plan" data-plan-id="\${planId}" title="Open plan">&#8594;</button>
                        </div>
                    </div>
                \`;
            }).join('');
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

        function setPlanTab(tab) {
            currentPlanTab = (tab === 'archived' || tab === 'programs') ? tab : 'active';
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
                    if (signature !== lastPlanSignature) {
                        lastPlanSignature = signature;
                        activePlans = nextActive;
                        archivedPlans = nextArchived;
                        programPlans = finalPrograms;
                        updatePlanLists();
                    }
                }
            } catch (error) {
                console.log('Failed to fetch plans:', error);
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
            if (activeList) activeList.innerHTML = renderPlanList(activePlans, 'active');
            if (archivedList) archivedList.innerHTML = renderPlanList(archivedPlans, 'archived');
            if (programsList) programsList.innerHTML = renderPlanList(programPlans, 'programs');
            if (programsSummary) programsSummary.innerHTML = renderProgramsSummary(programPlans);
            if (activeCount) activeCount.textContent = activePlans.length;
            if (archivedCount) archivedCount.textContent = archivedPlans.length;
            if (programsCount) programsCount.textContent = programPlans.length;
            setPlanTab(currentPlanTab);
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
                const response = await fetch('http://localhost:' + apiPort + '/api/events');
                if (response.ok) {
                    const data = await response.json();
                    recentEvents = (data.events || []).slice(0, 5);
                    const activityList = document.getElementById('activityList');
                    if (activityList) {
                        activityList.innerHTML = renderActivityList(recentEvents);
                    }
                }
            } catch (error) {
                console.log('Failed to fetch events:', error);
            }
        }

        function updateStatusCards(data) {
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
                dataRootValue.textContent = dataRoot || 'Unknown';
            }
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
