import { http, HttpResponse } from 'msw';

// Sample test data
export const mockWorkspaces = [
  {
    id: 'ws_test_123',
    name: 'Test Workspace',
    path: '/test/workspace',
    registeredAt: '2024-01-15T10:00:00Z',
    lastAccessed: '2024-01-20T14:30:00Z',
    activePlanCount: 2,
    archivedPlanCount: 1,
    indexed: true,
  },
  {
    id: 'ws_demo_456',
    name: 'Demo Project',
    path: '/demo/project',
    registeredAt: '2024-01-10T09:00:00Z',
    lastAccessed: '2024-01-19T16:45:00Z',
    activePlanCount: 1,
    archivedPlanCount: 0,
    indexed: true,
  },
];

export const mockPlans = [
  {
    id: 'plan_abc123',
    workspace_id: 'ws_test_123',
    title: 'Add Authentication',
    description: 'Implement OAuth2 authentication flow',
    priority: 'high',
    status: 'active',
    category: 'feature',
    current_phase: 'implementation',
    current_agent: 'Executor',
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-20T11:00:00Z',
    steps: [
      { phase: 'research', task: 'Research OAuth providers', status: 'done' },
      { phase: 'implementation', task: 'Implement auth flow', status: 'active' },
      { phase: 'testing', task: 'Write auth tests', status: 'pending' },
    ],
    agent_sessions: [],
    lineage: [],
  },
  {
    id: 'plan_def456',
    workspace_id: 'ws_test_123',
    title: 'Fix Login Bug',
    description: 'Users unable to login with email',
    priority: 'critical',
    status: 'active',
    category: 'bug',
    current_phase: 'debugging',
    current_agent: 'Executor',
    created_at: '2024-01-18T14:00:00Z',
    updated_at: '2024-01-20T15:30:00Z',
    steps: [
      { phase: 'investigation', task: 'Reproduce the bug', status: 'done' },
      { phase: 'debugging', task: 'Find root cause', status: 'active' },
    ],
    agent_sessions: [],
    lineage: [],
  },
];

export const mockAgents = [
  {
    id: 'coordinator',
    name: 'Coordinator',
    description: 'Orchestrates the planning process and delegates tasks',
    lastModified: '2024-01-10T12:00:00Z',
    deployedCount: 3,
    isTemplate: true,
  },
  {
    id: 'executor',
    name: 'Executor',
    description: 'Implements the planned tasks',
    lastModified: '2024-01-12T14:00:00Z',
    deployedCount: 2,
    isTemplate: true,
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Reviews completed work for quality',
    lastModified: '2024-01-14T16:00:00Z',
    deployedCount: 1,
    isTemplate: true,
  },
];

export const mockEvents = [
  {
    id: 'evt_001',
    type: 'step_updated',
    timestamp: '2024-01-20T15:30:00Z',
    data: {
      workspace_id: 'ws_test_123',
      plan_id: 'plan_abc123',
      step_index: 1,
      status: 'active',
    },
  },
  {
    id: 'evt_002',
    type: 'handoff',
    timestamp: '2024-01-20T14:00:00Z',
    data: {
      workspace_id: 'ws_test_123',
      plan_id: 'plan_abc123',
      from_agent: 'Coordinator',
      to_agent: 'Executor',
    },
  },
];

// API Handlers
export const handlers = [
  // Workspaces
  http.get('/api/workspaces', () => {
    return HttpResponse.json(mockWorkspaces);
  }),

  http.get('/api/workspaces/:id', ({ params }) => {
    const workspace = mockWorkspaces.find((w) => w.id === params.id);
    if (!workspace) {
      return HttpResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    return HttpResponse.json(workspace);
  }),

  // Plans
  http.get('/api/plans', ({ request }) => {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');
    
    let plans = mockPlans;
    if (workspaceId) {
      plans = mockPlans.filter((p) => p.workspace_id === workspaceId);
    }
    return HttpResponse.json(plans);
  }),

  http.get('/api/plans/:workspaceId/:planId', ({ params }) => {
    const plan = mockPlans.find(
      (p) => p.workspace_id === params.workspaceId && p.id === params.planId
    );
    if (!plan) {
      return HttpResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    return HttpResponse.json(plan);
  }),

  http.post('/api/plans', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newPlan = {
      id: `plan_${Date.now()}`,
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      steps: [],
      agent_sessions: [],
      lineage: [],
    };
    return HttpResponse.json(newPlan, { status: 201 });
  }),

  http.post('/api/plans/:workspaceId/:planId/archive', ({ params }) => {
    return HttpResponse.json({ success: true, planId: params.planId });
  }),

  http.delete('/api/plans/:workspaceId/:planId', ({ params }) => {
    return HttpResponse.json({ success: true, planId: params.planId });
  }),

  // Agents
  http.get('/api/agents', () => {
    return HttpResponse.json(mockAgents);
  }),

  http.get('/api/agents/:id', ({ params }) => {
    const agent = mockAgents.find((a) => a.id === params.id);
    if (!agent) {
      return HttpResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    return HttpResponse.json(agent);
  }),

  // Events
  http.get('/api/events', ({ request }) => {
    const url = new URL(request.url);
    const since = url.searchParams.get('since');
    
    let events = mockEvents;
    if (since) {
      events = mockEvents.filter((e) => e.timestamp > since);
    }
    return HttpResponse.json(events);
  }),

  // Stats
  http.get('/api/stats', () => {
    return HttpResponse.json({
      totalWorkspaces: mockWorkspaces.length,
      activePlans: mockPlans.filter((p) => p.status === 'active').length,
      completedPlans: 5,
      deployedAgents: 6,
      eventsToday: 24,
    });
  }),
];
