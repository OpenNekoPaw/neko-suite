import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockWebviewWindow, type MockWebviewWindow } from '@neko/shared/vscode/test-utils';

describe('dashboard messenger', () => {
  const mockWindows: MockWebviewWindow[] = [];

  afterEach(() => {
    for (const mockWindow of mockWindows.splice(0)) {
      mockWindow.dispose();
    }
  });

  async function loadMessenger() {
    vi.resetModules();
    const mockWindow = installMockWebviewWindow();
    mockWindows.push(mockWindow);
    const mod = await import('./messenger');
    return { postMessage: mod.postMessage, mockWindow };
  }

  it('posts typed dashboard messages through the shared VS Code bridge', async () => {
    const { postMessage, mockWindow } = await loadMessenger();

    postMessage({ type: 'ready' });

    expect(mockWindow.acquireCalls).toBe(1);
    expect(mockWindow.api.postedMessages).toEqual([{ type: 'ready' }]);
  });
});
