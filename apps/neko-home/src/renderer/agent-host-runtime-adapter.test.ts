import { describe, expect, it, vi } from 'vitest';
import type { NekoHomeBridge } from '../shared/contracts';
import { HOME_AGENT_RUNTIME_IDS } from '../shared/contracts';
import { createElectronAgentHostRuntimeAdapter } from './agent-host-runtime-adapter';

describe('Electron Agent host runtime adapter', () => {
  it('sends messages through the scoped Home runtime channel', async () => {
    const bridge = createBridge({
      messages: [{ type: 'globalError', message: 'settings unavailable' }],
    });
    const adapter = createElectronAgentHostRuntimeAdapter({ bridge });
    const received: unknown[] = [];

    adapter.subscribe((message) => received.push(message));
    adapter.send({ type: 'getSettings', conversationId: 'home-conversation-1' });
    await flushAsyncWork();

    expect(bridge.sendAgentRuntimeMessage).toHaveBeenCalledWith({
      runtimeId: HOME_AGENT_RUNTIME_IDS.agentWebview,
      message: { type: 'getSettings', conversationId: 'home-conversation-1' },
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
    agentAdapter.send({ type: 'getSettings', conversationId: 'home-conversation-1' });
    await flushAsyncWork();

    expect(agentMessages).toEqual([{ type: 'globalError', message: 'agent only' }]);
    expect(unrelatedMessages).toEqual([]);
  });

  it('keeps recoverable state scoped to the adapter instance', () => {
    const bridge = createBridge({ messages: [] });
    const agentAdapter = createElectronAgentHostRuntimeAdapter({ bridge });
    const unrelatedAdapter = createElectronAgentHostRuntimeAdapter({ bridge });

    agentAdapter.setState({ activeConversationId: 'home-conversation-1' });

    expect(agentAdapter.getState()).toEqual({ activeConversationId: 'home-conversation-1' });
    expect(unrelatedAdapter.getState()).toBeUndefined();
  });
});

function createBridge(
  result: Awaited<ReturnType<NekoHomeBridge['sendAgentRuntimeMessage']>>,
): NekoHomeBridge {
  return {
    getSnapshot: vi.fn(),
    sendAgentRuntimeMessage: vi.fn(async () => result),
    handoff: vi.fn(),
  };
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
