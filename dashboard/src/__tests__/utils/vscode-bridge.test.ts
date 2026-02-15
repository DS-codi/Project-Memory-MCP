import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postToVsCode } from '../../utils/vscode-bridge';

describe('vscode bridge postToVsCode', () => {
  const originalVscode = (window as any).vscode;
  const originalParent = window.parent;

  beforeEach(() => {
    delete (window as any).vscode;
  });

  afterEach(() => {
    if (originalVscode) {
      (window as any).vscode = originalVscode;
    } else {
      delete (window as any).vscode;
    }
    Object.defineProperty(window, 'parent', {
      value: originalParent,
      configurable: true,
    });
  });

  it('posts directly to vscode when running in webview context', () => {
    const vscodePostMessage = vi.fn();
    (window as any).vscode = {
      postMessage: vscodePostMessage,
      getState: vi.fn(),
      setState: vi.fn(),
    };

    postToVsCode({ type: 'discussPlanInChat', data: { planId: 'plan_123' } });

    expect(vscodePostMessage).toHaveBeenCalledWith({
      type: 'discussPlanInChat',
      data: { planId: 'plan_123' },
    });
  });

  it('posts to parent window bridge payload when embedded in iframe without vscode api', () => {
    const parentPostMessage = vi.fn();
    Object.defineProperty(window, 'parent', {
      value: { postMessage: parentPostMessage },
      configurable: true,
    });

    postToVsCode({ type: 'discussPlanInChat', data: { planId: 'plan_abc' } });

    expect(parentPostMessage).toHaveBeenCalledWith(
      {
        type: 'projectMemory.dashboard',
        payload: {
          type: 'discussPlanInChat',
          data: { planId: 'plan_abc' },
        },
      },
      '*',
    );
  });
});
