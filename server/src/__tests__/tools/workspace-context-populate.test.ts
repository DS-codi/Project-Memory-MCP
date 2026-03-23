import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as workspaceContextTools from '../../tools/workspace-context.tools.js';
import * as store from '../../storage/db-store.js';

vi.mock('../../storage/db-store.js');
vi.mock('../../logging/workspace-update-log.js', () => ({
  appendWorkspaceFileUpdate: vi.fn().mockResolvedValue(undefined)
}));

const WORKSPACE_ID = 'workspace-populate-test';
const WORKSPACE_PATH = '/test/workspace';

const mockWorkspaceMeta = {
  workspace_id: WORKSPACE_ID,
  workspace_path: WORKSPACE_PATH,
  path: WORKSPACE_PATH,
  name: 'Test Workspace',
  registered_at: '2026-01-01T00:00:00.000Z',
  last_accessed: '2026-01-01T00:00:00.000Z',
  active_plans: [],
  archived_plans: [],
  active_programs: [],
  indexed: true,
  profile: {
    indexed_at: '2026-02-10T00:00:00.000Z',
    languages: [{ name: 'TypeScript', percentage: 100, file_count: 10, extensions: ['.ts'] }],
    frameworks: ['Express'],
    build_system: { type: 'npm', config_file: 'package.json', build_command: 'npm run build', dev_command: 'npm run dev' },
    test_framework: { name: 'vitest', config_file: 'vitest.config.ts', test_command: 'npx vitest' },
    package_manager: 'npm',
    key_directories: [
      { path: 'src', purpose: 'source', file_count: 8 },
      { path: 'docs', purpose: 'docs', file_count: 2 },
    ],
    conventions: { indentation: 'spaces', indent_size: 2, quote_style: 'single', semicolons: true },
    total_files: 12,
    total_lines: 2000,
  }
};

describe('populateWorkspaceContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.getWorkspace).mockResolvedValue(mockWorkspaceMeta as never);
    vi.mocked(store.resolveWorkspaceIdForPath).mockResolvedValue(WORKSPACE_ID);
    vi.mocked(store.getWorkspaceIdentityPath).mockReturnValue(`${WORKSPACE_PATH}/.projectmemory/identity.json`);
    vi.mocked(store.nowISO).mockReturnValue('2026-02-11T00:00:00.000Z');
    vi.mocked(store.saveWorkspaceContextToDb).mockResolvedValue(undefined);
  });

  it('fills empty canonical sections without replacing populated user sections', async () => {
    vi.mocked(store.getWorkspaceContextFromDb).mockResolvedValue({
      schema_version: '1.0.0',
      workspace_id: WORKSPACE_ID,
      workspace_path: WORKSPACE_PATH,
      name: 'Test Workspace',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-15T00:00:00.000Z',
      sections: {
        project_details: { summary: 'User-authored project summary' },
        purpose: { summary: '   ' },
        important_context: { summary: 'Keep this note' }
      }
    } as never);

    const result = await workspaceContextTools.populateWorkspaceContext({ workspace_id: WORKSPACE_ID });

    expect(result.success).toBe(true);
    expect(result.data?.context.sections.project_details.summary).toBe('User-authored project summary');
    expect(result.data?.context.sections.purpose.summary).toContain('Test Workspace');
    expect(result.data?.context.sections.modules.summary).toContain('Key directories detected');
    expect(result.data?.context.sections.important_context.summary).toBe('Keep this note');
    expect(result.data?.populated_section_keys).toContain('purpose');
    expect(result.data?.populated_section_keys).toContain('modules');
    expect(result.data?.skipped_section_keys).toContain('project_details');
  });
});