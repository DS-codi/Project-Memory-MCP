import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb, teardownTestDb } from '../db/fixtures.js';
import { getContext } from '../../db/context-db.js';
import { logToolCall } from '../../logging/tool-logger.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('tool-logger session retention', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('keeps only the latest 3 plan session logs', async () => {
    const planId = 'plan-retention-test';

    await logToolCall('memory_plan', { plan_id: planId, _session_id: 's1' }, 'success');
    await sleep(2);
    await logToolCall('memory_plan', { plan_id: planId, _session_id: 's2' }, 'success');
    await sleep(2);
    await logToolCall('memory_plan', { plan_id: planId, _session_id: 's3' }, 'success');
    await sleep(2);
    await logToolCall('memory_plan', { plan_id: planId, _session_id: 's4' }, 'success');

    const rows = getContext('plan', planId).filter(row => row.type.startsWith('tool_log_session:'));
    const types = rows.map(row => row.type).sort();

    expect(rows).toHaveLength(3);
    expect(types).toEqual([
      'tool_log_session:s2',
      'tool_log_session:s3',
      'tool_log_session:s4',
    ]);
  });

  it('keeps only the latest 3 runtime session logs per workspace', async () => {
    const workspaceId = 'workspace-retention-test';

    await logToolCall('memory_terminal', { workspace_id: workspaceId, _session_id: 'r1' }, 'success');
    await sleep(2);
    await logToolCall('memory_terminal', { workspace_id: workspaceId, _session_id: 'r2' }, 'success');
    await sleep(2);
    await logToolCall('memory_terminal', { workspace_id: workspaceId, _session_id: 'r3' }, 'success');
    await sleep(2);
    await logToolCall('memory_terminal', { workspace_id: workspaceId, _session_id: 'r4' }, 'success');

    const rows = getContext('workspace', workspaceId).filter(row => row.type.startsWith('runtime_log_session:'));
    const types = rows.map(row => row.type).sort();

    expect(rows).toHaveLength(3);
    expect(types).toEqual([
      'runtime_log_session:r2',
      'runtime_log_session:r3',
      'runtime_log_session:r4',
    ]);
  });
});
