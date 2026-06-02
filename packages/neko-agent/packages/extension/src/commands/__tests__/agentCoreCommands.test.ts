import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { buildAgentPromptCommandMessage } from '@neko/agent/runtime';
import {
  NEKO_AGENT_CHARACTER_PERSPECTIVE_COMMAND,
  NEKO_AGENT_IMPROVE_CHARACTER_COMMAND,
  NEKO_AGENT_TEST_NPC_COMMAND,
  NEKO_AGENT_VALIDATE_CHARACTER_COMMAND,
} from '@neko/shared';
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
      '无法启动 NPC 测试：启动请求无效。',
    );
  });

  it('registers NPC Agent workflow commands as ordinary Agent messages', async () => {
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

    const workflows = [
      {
        command: NEKO_AGENT_CHARACTER_PERSPECTIVE_COMMAND,
        workflow: 'character-perspective',
        label: '角色视角',
      },
      {
        command: NEKO_AGENT_VALIDATE_CHARACTER_COMMAND,
        workflow: 'validate-character',
        label: '验证角色',
      },
      {
        command: NEKO_AGENT_IMPROVE_CHARACTER_COMMAND,
        workflow: 'improve-character',
        label: '完善设定',
      },
    ] as const;

    for (const { command, workflow } of workflows) {
      const callback = vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.find(([registeredCommand]) => registeredCommand === command)?.[1];
      expect(callback, command).toBeDefined();

      await callback?.({
        workflow,
        entityRef: {
          entityId: 'char-xiaoju',
          entityKind: 'character',
          source: 'neko-entity',
          projectRoot: '/workspace',
        },
        dashboardRef: {
          source: 'neko-entity',
          sourceEntityId: 'entity:char-xiaoju',
          entityId: 'char-xiaoju',
          entityKind: 'character',
        },
        scopes: [{ kind: 'occurrence', source: 'neko-story', ref: 'cases/test.fountain:8' }],
        prompt: 'Check future knowledge leakage.',
        source: 'dashboard',
        projectRoot: '/workspace',
      });
    }

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('neko.aiAssistant.focus');
    expect(chatViewProvider.startNpcTestBench).not.toHaveBeenCalled();
    for (const { label } of workflows) {
      expect(chatViewProvider.sendMessageToAssistant).toHaveBeenCalledWith(
        expect.stringContaining(`请执行 NPC 角色工作流：${label}`),
        true,
      );
    }
    for (const [message] of chatViewProvider.sendMessageToAssistant.mock.calls) {
      expect(message).toContain('这是普通 Agent 分析工作流');
      expect(message).toContain('不要启动或模拟 /as 角色扮演会话');
      expect(message).toContain('可以读取项目内实体、剧本出现位置和关系上下文来形成证据');
      expect(message).toContain('不要自动修改角色设定');
    }
  });
});
