import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
}));

import { workspacesRouter } from './workspaces.js';

type MockRequest = {
  params: { id: string };
  body?: { display_name?: unknown };
};

type MockResponse = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function createResponse(): MockResponse {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as MockResponse;

  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);

  return response;
}

function getDisplayNamePostHandler() {
  const layer = (workspacesRouter as any).stack.find(
    (entry: any) => entry?.route?.path === '/:id/display-name' && entry?.route?.methods?.post
  );

  if (!layer) {
    throw new Error('Display-name route handler not found');
  }

  return layer.route.stack[0].handle as (req: MockRequest, res: MockResponse) => Promise<void>;
}

describe('workspaces display-name route', () => {
  const displayNameHandler = getDisplayNamePostHandler();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).MBS_DATA_ROOT = '/tmp/pm-data';
  });

  it('returns 400 when display_name is missing', async () => {
    const req = { params: { id: 'ws_1' }, body: {} } as MockRequest;
    const res = createResponse();

    await displayNameHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'display_name is required' });
  });

  it('returns 400 when display_name is empty after trimming', async () => {
    const req = { params: { id: 'ws_1' }, body: { display_name: '   ' } } as MockRequest;
    const res = createResponse();

    await displayNameHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'display_name must be a non-empty string' });
  });

  it('persists trimmed display_name and returns updated workspace payload', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        workspace_id: 'ws_1',
        name: 'Original Name',
        display_name: 'Original Name',
      })
    );

    const req = {
      params: { id: 'ws_1' },
      body: { display_name: '  Updated Workspace Name  ' },
    } as MockRequest;
    const res = createResponse();

    await displayNameHandler(req, res);

    expect(fs.readFile).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);

    const writtenPayload = vi.mocked(fs.writeFile).mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(writtenPayload);

    expect(parsed.display_name).toBe('Updated Workspace Name');
    expect(parsed.name).toBe('Updated Workspace Name');
    expect(typeof parsed.updated_at).toBe('string');
    expect(parsed.last_accessed).toBe(parsed.updated_at);

    expect(res.json).toHaveBeenCalledWith({ workspace: parsed });
  });
});
