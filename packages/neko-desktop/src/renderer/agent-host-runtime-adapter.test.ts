import { describe, expect, it, vi } from 'vitest';
import type { NekoDesktopBridge } from '../shared/contracts';
import { DESKTOP_AGENT_RUNTIME_IDS } from '../shared/contracts';
import { createElectronAgentHostRuntimeAdapter } from './agent-host-runtime-adapter';

describe('Electron Agent host runtime adapter', () => {
  it('sends messages through the scoped Desktop runtime channel', async () => {
    const bridge = createBridge({
      messages: [{ type: 'globalError', message: 'settings unavailable' }],
    });
    const adapter = createElectronAgentHostRuntimeAdapter({ bridge });
    const received: unknown[] = [];

    adapter.subscribe((message) => received.push(message));
    adapter.send({ type: 'getSettings' });
    await flushAsyncWork();

    expect(bridge.sendAgentRuntimeMessage).toHaveBeenCalledWith({
      runtimeId: DESKTOP_AGENT_RUNTIME_IDS.agentWebview,
      message: { type: 'getSettings' },
    });
    expect(received).toEqual([{ type: 'globalError', message: 'settings unavailable' }]);
  });

  it('does not deliver host messages to unrelated adapter instances', async () => {
    const bridge = createBridge({
      messages: [{ type: 'globalError', message: 'agent only' }],
    });
    const agentAdapter = createElectronAgentHostRuntimeAdapter({ bridge });
    const unrelatedAdapter = createElectronAgentHostRuntimeAdapter({ bridge });
    const agentMessages: unknown[] = [];
    const unrelatedMessages: unknown[] = [];

    agentAdapter.subscribe((message) => agentMessages.push(message));
    unrelatedAdapter.subscribe((message) => unrelatedMessages.push(message));
    agentAdapter.send({ type: 'getSettings' });
    await flushAsyncWork();

    expect(agentMessages).toEqual([{ type: 'globalError', message: 'agent only' }]);
    expect(unrelatedMessages).toEqual([]);
  });

  it('keeps recoverable state scoped to the adapter instance', () => {
    const bridge = createBridge({ messages: [] });
    const agentAdapter = createElectronAgentHostRuntimeAdapter({ bridge });
    const unrelatedAdapter = createElectronAgentHostRuntimeAdapter({ bridge });

    agentAdapter.setState({ activeConversationId: 'desktop-conversation-1' });

    expect(agentAdapter.getState()).toEqual({ activeConversationId: 'desktop-conversation-1' });
    expect(unrelatedAdapter.getState()).toBeUndefined();
  });
});

function createBridge(
  result: Awaited<ReturnType<NekoDesktopBridge['sendAgentRuntimeMessage']>>,
): NekoDesktopBridge {
  return {
    getSnapshot: vi.fn(),
    readWorkspaceFile: vi.fn(),
    writeWorkspaceFile: vi.fn(),
    sendViewportIntent: vi.fn(),
    setFeatureWebviewContext: vi.fn(),
    sendFeatureWebviewMessage: vi.fn(),
    sendAgentRuntimeMessage: vi.fn(async () => result),
  };
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
