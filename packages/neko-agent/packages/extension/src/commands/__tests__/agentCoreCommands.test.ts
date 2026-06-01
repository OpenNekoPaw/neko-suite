import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { buildAgentPromptCommandMessage } from '@neko/agent/runtime';
import { NEKO_AGENT_TEST_NPC_COMMAND } from '@neko/shared';
import { registerAgentCoreCommands } from '../agentCoreCommands';

vi.mock('@neko/agent/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neko/agent/runtime')>();
  return {
    ...actual,
    buildAgentPromptCommandMessage: vi.fn(actual.buildAgentPromptCommandMessage),
  };
});

describe('agentCoreCommands bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('collects VSCode input and delegates image command prompt construction to runtime', async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> };
    const chatViewProvider = {
      sendMessageToAssistant: vi.fn(),
      sendContextPayload: vi.fn(),
      startNpcTestBench: vi.fn(),
      dndBroker: { getPayload: vi.fn(), clearPayload: vi.fn() },
      setPluginCommandsGetter: vi.fn(),
      sendPluginSlashCommands: vi.fn(),
    };
    const services = { get: vi.fn() };

    registerAgentCoreCommands(context as never, chatViewProvider as never, services as never);
    vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('sunset mountains');

    const generateImageRegistration = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(([command]) => command === 'neko.ai.generateImage');
    const callback = generateImageRegistration?.[1];
    expect(callback).toBeDefined();

    await callback?.();

    expect(buildAgentPromptCommandMessage).toHaveBeenCalledWith({
      kind: 'generate-image',
      prompt: 'sunset mountains',
    });
    expect(chatViewProvider.sendMessageToAssistant).toHaveBeenCalledWith(
      'Generate an image: sunset mountains',
      true,
    );
  });

  it('registers the NPC test command through the Agent-owned launch path', async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> };
    const chatViewProvider = {
      sendMessageToAssistant: vi.fn(),
      sendContextPayload: vi.fn(),
      startNpcTestBench: vi.fn().mockResolvedValue({ sessionId: 'npc-session-1' }),
      dndBroker: { getPayload: vi.fn(), clearPayload: vi.fn() },
      setPluginCommandsGetter: vi.fn(),
      sendPluginSlashCommands: vi.fn(),
    };
    const services = { get: vi.fn() };

    registerAgentCoreCommands(context as never, chatViewProvider as never, services as never);

    const registration = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(([command]) => command === NEKO_AGENT_TEST_NPC_COMMAND);
    const callback = registration?.[1];
    expect(callback).toBeDefined();

    const request = {
      entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
      source: 'dashboard',
    };
    await callback?.(request);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('neko.aiAssistant.focus');
    expect(chatViewProvider.startNpcTestBench).toHaveBeenCalledWith(request);
  });

  it('rejects invalid NPC launch command payloads', async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> };
    const chatViewProvider = {
      sendMessageToAssistant: vi.fn(),
      sendContextPayload: vi.fn(),
      startNpcTestBench: vi.fn(),
      dndBroker: { getPayload: vi.fn(), clearPayload: vi.fn() },
      setPluginCommandsGetter: vi.fn(),
      sendPluginSlashCommands: vi.fn(),
    };

    registerAgentCoreCommands(
      context as never,
      chatViewProvider as never,
      { get: vi.fn() } as never,
    );

    const callback = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(([command]) => command === NEKO_AGENT_TEST_NPC_COMMAND)?.[1];
    await callback?.({ source: 'dashboard' });

    expect(chatViewProvider.startNpcTestBench).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Cannot start NPC test: invalid launch request.',
    );
  });
});
