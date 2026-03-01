import { beforeEach, describe, expect, it, vi } from 'vitest';

const { addEventLogMock, dispatchEventToWebhookMock } = vi.hoisted(() => ({
  addEventLogMock: vi.fn(),
  dispatchEventToWebhookMock: vi.fn(),
}));

vi.mock('../../db/event-log-db.js', () => ({
  addEventLog: addEventLogMock,
  getRecentEvents: vi.fn().mockReturnValue([]),
  getEventsSince: vi.fn().mockReturnValue([]),
}));

vi.mock('../../events/webhook-dispatcher.js', () => ({
  dispatchEventToWebhook: dispatchEventToWebhookMock,
}));

import { emitEvent } from '../../events/event-emitter.js';

describe('emitEvent webhook integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes event log first and then dispatches webhook non-blocking', async () => {
    await emitEvent({
      type: 'tool_call',
      workspace_id: 'ws_1',
      plan_id: 'plan_1',
      tool_name: 'memory_agent',
      data: { success: true },
    });

    expect(addEventLogMock).toHaveBeenCalledTimes(1);
    expect(dispatchEventToWebhookMock).toHaveBeenCalledTimes(1);

    const addCallArg = addEventLogMock.mock.calls[0][1] as Record<string, unknown>;
    const dispatchArg = dispatchEventToWebhookMock.mock.calls[0][0] as Record<string, unknown>;
    expect(addCallArg.id).toBe(dispatchArg.id);
  });

  it('remains non-fatal when event log write throws', async () => {
    addEventLogMock.mockImplementationOnce(() => {
      throw new Error('db failure');
    });

    await expect(
      emitEvent({
        type: 'tool_call',
        workspace_id: 'ws_1',
        plan_id: 'plan_1',
        tool_name: 'memory_agent',
        data: { success: true },
      }),
    ).resolves.toBeUndefined();

    expect(dispatchEventToWebhookMock).not.toHaveBeenCalled();
  });

  it('remains non-fatal when webhook dispatch throws (queue overflow/fail-open path)', async () => {
    dispatchEventToWebhookMock.mockImplementationOnce(() => {
      throw new Error('queue overflow');
    });

    await expect(
      emitEvent({
        type: 'tool_call',
        workspace_id: 'ws_1',
        plan_id: 'plan_1',
        tool_name: 'memory_agent',
        data: { success: true },
      }),
    ).resolves.toBeUndefined();

    expect(addEventLogMock).toHaveBeenCalledTimes(1);
    expect(dispatchEventToWebhookMock).toHaveBeenCalledTimes(1);
  });
});
