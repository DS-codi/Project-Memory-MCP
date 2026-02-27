import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from '../../storage/db-store.js';
import {
  extractImportantResponseContext,
  getImportantResponseContext,
  getImportantResponseContextForRequest,
} from '../../utils/important-response-context.js';

vi.mock('../../storage/db-store.js');

const WORKSPACE_ID = 'ws_important_context_test';

describe('important-response-context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts important_context section when present', () => {
    const result = extractImportantResponseContext({
      schema_version: '1.0.0',
      workspace_id: WORKSPACE_ID,
      workspace_path: '/tmp/workspace',
      name: 'Test Workspace',
      created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-02-27T00:00:00.000Z',
      sections: {
        important_context: {
          summary: 'Always use strict TDD loop for auth changes.',
          items: [{ title: 'Constraint', description: 'Never touch backup/*' }]
        }
      }
    });

    expect(result).toEqual({
      section_key: 'important_context',
      summary: 'Always use strict TDD loop for auth changes.',
      items: [{ title: 'Constraint', description: 'Never touch backup/*' }],
      updated_at: '2026-02-27T00:00:00.000Z'
    });
  });

  it('falls back to important_notes if important_context is absent', () => {
    const result = extractImportantResponseContext({
      schema_version: '1.0.0',
      workspace_id: WORKSPACE_ID,
      workspace_path: '/tmp/workspace',
      name: 'Test Workspace',
      created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-02-27T00:00:00.000Z',
      sections: {
        important_notes: {
          summary: 'Validate migrations in staging first.'
        }
      }
    });

    expect(result?.section_key).toBe('important_notes');
    expect(result?.summary).toContain('Validate migrations');
  });

  it('returns undefined when no important section exists', () => {
    const result = extractImportantResponseContext({
      schema_version: '1.0.0',
      workspace_id: WORKSPACE_ID,
      workspace_path: '/tmp/workspace',
      name: 'Test Workspace',
      created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-02-27T00:00:00.000Z',
      sections: {
        architecture: {
          summary: 'Service-oriented architecture'
        }
      }
    });

    expect(result).toBeUndefined();
  });

  it('loads context from db helper and returns extracted result', async () => {
    vi.mocked(store.getWorkspaceContextFromDb).mockResolvedValue({
      schema_version: '1.0.0',
      workspace_id: WORKSPACE_ID,
      workspace_path: '/tmp/workspace',
      name: 'Test Workspace',
      created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-02-27T00:00:00.000Z',
      sections: {
        important_context: {
          summary: 'Include this in every tool response.'
        }
      }
    } as never);

    const result = await getImportantResponseContext(WORKSPACE_ID);

    expect(store.getWorkspaceContextFromDb).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(result?.summary).toBe('Include this in every tool response.');
  });

  it('resolves workspace_id from workspace_path when workspace_id is absent', async () => {
    vi.mocked(store.resolveWorkspaceIdForPath).mockResolvedValue(WORKSPACE_ID);
    vi.mocked(store.getWorkspaceContextFromDb).mockResolvedValue({
      schema_version: '1.0.0',
      workspace_id: WORKSPACE_ID,
      workspace_path: '/tmp/workspace',
      name: 'Test Workspace',
      created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-02-27T00:00:00.000Z',
      sections: {
        important_context: {
          summary: 'Resolved from workspace_path'
        }
      }
    } as never);

    const result = await getImportantResponseContextForRequest({
      workspace_path: '/tmp/workspace'
    });

    expect(store.resolveWorkspaceIdForPath).toHaveBeenCalledWith('/tmp/workspace');
    expect(store.getWorkspaceContextFromDb).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(result?.summary).toBe('Resolved from workspace_path');
  });

  it('returns undefined when workspace_path cannot be resolved', async () => {
    vi.mocked(store.resolveWorkspaceIdForPath).mockRejectedValue(new Error('not found'));

    const result = await getImportantResponseContextForRequest({
      workspace_path: '/missing/workspace'
    });

    expect(result).toBeUndefined();
  });
});
