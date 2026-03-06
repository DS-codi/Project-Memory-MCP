import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server';
import { fetchCopilotStatus, fetchGlobalCopilotStatus } from '../../hooks/useCopilotStatus';

function mockCommonCopilotEndpoints() {
  server.use(
    http.get('http://localhost:3001/api/agents', () =>
      HttpResponse.json({
        agents: [
          {
            agent_id: 'executor',
            deployments: [{ workspace_id: 'ws_123', sync_status: 'synced' }],
          },
        ],
      }),
    ),
    http.get('http://localhost:3001/api/prompts', () =>
      HttpResponse.json({ prompts: [{ id: 'prompt_1' }] }),
    ),
  );
}

describe('useCopilotStatus fetchers', () => {
  it('includes fallback API health in workspace status responses', async () => {
    mockCommonCopilotEndpoints();

    server.use(
      http.get('http://localhost:3001/api/instructions/workspace/ws_123', () =>
        HttpResponse.json({ instructions: [{ id: 'inst_1' }] }),
      ),
      http.get('http://localhost:3001/api/runtime/fallback-health', () =>
        HttpResponse.json({
          fallback_api: {
            state: 'healthy',
            detail: 'Fallback API responding',
            checked_at: '2026-03-06T00:00:00.000Z',
          },
        }),
      ),
    );

    const result = await fetchCopilotStatus('ws_123');

    expect(result.status.hasAgents).toBe(true);
    expect(result.status.hasPrompts).toBe(true);
    expect(result.status.hasInstructions).toBe(true);
    expect(result.status.fallbackApiHealth).toBe('healthy');
    expect(result.status.fallbackApiDetail).toBe('Fallback API responding');
    expect(result.status.fallbackApiCheckedAt).toBe('2026-03-06T00:00:00.000Z');
  });

  it('falls back to unknown fallback API health when runtime endpoint fails', async () => {
    mockCommonCopilotEndpoints();

    server.use(
      http.get('http://localhost:3001/api/instructions/workspace/ws_123', () =>
        HttpResponse.json({ instructions: [{ id: 'inst_1' }] }),
      ),
      http.get('http://localhost:3001/api/runtime/fallback-health', () =>
        HttpResponse.json({ error: 'unavailable' }, { status: 503 }),
      ),
    );

    const result = await fetchCopilotStatus('ws_123');

    expect(result.status.fallbackApiHealth).toBe('unknown');
    expect(result.status.fallbackApiDetail).toBe('Fallback API health unavailable');
  });

  it('propagates fallback API disabled state for global status', async () => {
    mockCommonCopilotEndpoints();

    server.use(
      http.get('http://localhost:3001/api/instructions', () =>
        HttpResponse.json({ instructions: [] }),
      ),
      http.get('http://localhost:3001/api/runtime/fallback-health', () =>
        HttpResponse.json({
          fallback_api: {
            state: 'disabled',
            detail: 'Fallback API disabled by supervisor configuration',
          },
        }),
      ),
    );

    const result = await fetchGlobalCopilotStatus();

    expect(result.status.fallbackApiHealth).toBe('disabled');
    expect(result.status.fallbackApiDetail).toContain('disabled');
  });
});
