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
            const isProgram = Boolean(plan.is_program);
            const schemaVersion = plan.schema_version || null;
            const currentPhase = plan.current_phase || plan.phase || null;
            const progressDone = plan.progress?.done || 0;
            const progressTotal = plan.progress?.total || 0;
            const childPlanCount = Array.isArray(plan.child_plan_ids)
                ? plan.child_plan_ids.length
                : (typeof plan.child_plans_count === 'number' ? plan.child_plans_count : null);
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
                                <span class="entity-badge ${entityClass}">${entityType}</span>
                                ${metaParts.map(part => `<span>${part}</span>`).join('<span>&#8226;</span>')}
                            </div>
                        </div>
                        <span class="plan-status ${plan.status}">${plan.status}</span>
                        <div class="plan-actions">
                            <button class="btn btn-small btn-secondary" data-action="copy" data-copy="\${planId}" title="Copy plan ID">&#128203;</button>
                            <button class="btn btn-small btn-secondary" data-action="open-plan-browser" data-plan-id="\${planId}" title="Open plan in default browser">&#8599;</button>
                            <button class="btn btn-small" data-action="open-plan" data-plan-id="\${planId}" title="Open plan">&#8594;</button>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        function setPlanTab(tab) {
            currentPlanTab = tab === 'archived' ? 'archived' : 'active';
            const activeTab = document.getElementById('plansTabActive');
            const archivedTab = document.getElementById('plansTabArchived');
            const activePane = document.getElementById('plansPaneActive');
            const archivedPane = document.getElementById('plansPaneArchived');
            if (activeTab) activeTab.classList.toggle('active', currentPlanTab === 'active');
            if (archivedTab) archivedTab.classList.toggle('active', currentPlanTab === 'archived');
            if (activePane) activePane.classList.toggle('active', currentPlanTab === 'active');
            if (archivedPane) archivedPane.classList.toggle('active', currentPlanTab === 'archived');
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
                    const allPlans = Array.isArray(data.plans) ? data.plans : [];
                    const normalized = allPlans.map(normalizePlanEntity);
                    const nextActive = normalized.filter(p => p.status !== 'archived');
                    const nextArchived = normalized.filter(p => p.status === 'archived');
                    const signature = getPlanSignature(nextActive) + '||' + getPlanSignature(nextArchived);
                    if (signature !== lastPlanSignature) {
                        lastPlanSignature = signature;
                        activePlans = nextActive;
                        archivedPlans = nextArchived;
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
            const activeCount = document.getElementById('activeCount');
            const archivedCount = document.getElementById('archivedCount');
            if (activeList) activeList.innerHTML = renderPlanList(activePlans, 'active');
            if (archivedList) archivedList.innerHTML = renderPlanList(archivedPlans, 'archived');
            if (activeCount) activeCount.textContent = activePlans.length;
            if (archivedCount) archivedCount.textContent = archivedPlans.length;
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
