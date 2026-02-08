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

vi.mock('../services/fileScanner.js', () => ({
  getWorkspaceDetails: vi.fn(),
  getWorkspacePlans: vi.fn(),
  getPlanState: vi.fn(),
  getPlanLineage: vi.fn(),
  getPlanAudit: vi.fn(),
  getResearchNotes: vi.fn(),
}));

vi.mock('../events/emitter.js', () => ({
  emitEvent: vi.fn(),
}));

import * as fs from 'fs/promises';
import { getWorkspaceDetails } from '../services/fileScanner.js';
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

describe('Plan creation workspace guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const globalState = globalThis as typeof globalThis & { MBS_DATA_ROOT: string };
    globalState.MBS_DATA_ROOT = '/tmp/data';
  });

  it('should block plan creation when workspace meta is missing', async () => {
    vi.mocked(getWorkspaceDetails).mockResolvedValue(null);

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
