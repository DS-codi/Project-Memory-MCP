import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  access: vi.fn(),
}));

vi.mock('../db/queries.js', () => ({
  getWorkspace: vi.fn(),
  getPlansByWorkspace: vi.fn(),
  listPrograms: vi.fn(),
  getPlan: vi.fn(),
  getPlanPhases: vi.fn(),
  getPlanSteps: vi.fn(),
  getProgramChildPlans: vi.fn(),
  getPlanSessions: vi.fn(),
  getPlanLineage: vi.fn(),
  getPlanNotes: vi.fn(),
  getBuildScripts: vi.fn(),
}));

vi.mock('../events/emitter.js', () => ({
  emitEvent: vi.fn(),
}));

import * as fs from 'fs/promises';
import { getWorkspace, getPlansByWorkspace, listPrograms, getPlanSteps, getProgramChildPlans } from '../db/queries.js';
import { plansRouter } from './plans.js';

const WORKSPACE_REGISTRATION_ERROR =
  'Workspace not registered. Register the workspace first via POST /api/workspaces/register.';

function getPostHandler(routePath: string) {
  const layer = plansRouter.stack.find((entry: any) => entry.route?.path === routePath);
  if (!layer || !layer.route?.stack?.length) {
    throw new Error(`Route handler not found for ${routePath}`);
  }
  return layer.route.stack[0].handle as (req: Request, res: Response) => Promise<void>;
}

function getGetHandler(routePath: string) {
  const layer = plansRouter.stack.find((entry: any) => entry.route?.path === routePath);
  if (!layer || !layer.route?.stack?.length) {
    throw new Error(`Route handler not found for ${routePath}`);
  }
  return layer.route.stack[0].handle as (req: Request, res: Response) => void;
}

describe('Plan creation workspace guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const globalState = globalThis as typeof globalThis & { MBS_DATA_ROOT: string };
    globalState.MBS_DATA_ROOT = '/tmp/data';
  });

  it('should block plan creation when workspace meta is missing', async () => {
    vi.mocked(getWorkspace).mockReturnValue(null as any);

    const handler = getPostHandler('/:workspaceId');
    const req = {
      params: { workspaceId: 'ws_missing' },
      body: { title: 'Plan', description: 'Desc', category: 'feature' }
    } as unknown as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    } as unknown as Response;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: WORKSPACE_REGISTRATION_ERROR });
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

describe('Workspace plans summary payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPrograms).mockReturnValue([] as any);
  });

  it('should include progress counts and child plan counts for program rows', () => {
    vi.mocked(getPlansByWorkspace).mockReturnValue([
      {
        id: 'plan_1',
        workspace_id: 'ws_1',
        title: 'Regular plan',
        description: '',
        status: 'active',
        category: 'feature',
        priority: 'high',
        is_program: 0,
        parent_program_id: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        archived_at: null,
      } as any,
      {
        id: 'program_1',
        workspace_id: 'ws_1',
        title: 'Integrated program',
        description: '',
        status: 'active',
        category: 'feature',
        priority: 'medium',
        is_program: 1,
        parent_program_id: null,
        created_at: '2026-01-02T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
        archived_at: null,
      } as any,
    ] as any);

    vi.mocked(getPlanSteps).mockImplementation((planId: string) => {
      if (planId === 'plan_1') {
        return [{ status: 'done' }, { status: 'pending' }] as any;
      }
      return [{ status: 'done' }, { status: 'done' }, { status: 'active' }] as any;
    });

    vi.mocked(getProgramChildPlans).mockImplementation((planId: string) => {
      if (planId === 'program_1') {
        return [{ id: 'child_a' }, { id: 'child_b' }] as any;
      }
      return [] as any;
    });

    const handler = getGetHandler('/workspace/:workspaceId');
    const req = { params: { workspaceId: 'ws_1' } } as unknown as Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const resMock = res as unknown as { json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> };

    handler(req, res);

    expect(resMock.json).toHaveBeenCalledTimes(1);
    const payload = resMock.json.mock.calls[0][0] as any;
    expect(payload.total).toBe(2);

    const regularPlan = payload.plans.find((p: any) => p.id === 'plan_1');
    const integratedProgram = payload.plans.find((p: any) => p.id === 'program_1');

    expect(regularPlan.progress).toEqual({ done: 1, total: 2 });
    expect(regularPlan.child_plans_count).toBe(0);
    expect(integratedProgram.is_program).toBe(true);
    expect(integratedProgram.progress).toEqual({ done: 2, total: 3 });
    expect(integratedProgram.child_plans_count).toBe(2);
  });
});
