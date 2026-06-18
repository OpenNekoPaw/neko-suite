import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockWebviewWindow, type MockWebviewWindow } from '@neko/shared/vscode/test-utils';

describe('live vscode api facade', () => {
  const mockWindows: MockWebviewWindow[] = [];

  afterEach(() => {
    for (const mockWindow of mockWindows.splice(0)) {
      mockWindow.dispose();
    }
  });

  async function loadFacade() {
    vi.resetModules();
    const mockWindow = installMockWebviewWindow();
    mockWindows.push(mockWindow);
    const mod = await import('./vscode-api');
    return { vscode: mod.vscode, mockWindow };
  }

  it('posts live messages through the shared VS Code bridge', async () => {
    const { vscode, mockWindow } = await loadFacade();

    vscode.postMessage({ type: 'ready' });
    vscode.postMessage({ type: 'requestEnginePort' });

    expect(mockWindow.acquireCalls).toBe(1);
    expect(mockWindow.api.postedMessages).toEqual([
      { type: 'ready' },
      { type: 'requestEnginePort' },
    ]);
  });
});
