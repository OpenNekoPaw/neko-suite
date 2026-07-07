import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as vscode from 'vscode';
import { buildAgentPromptCommandMessage } from '@neko/agent/runtime';
import {
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND,
  NEKO_AGENT_EMBODY_CHARACTER_COMMAND,
  type CreativeAiDocumentRef,
  type CreativeAiSourceRef,
  type CreativeAiTargetRef,
  type ExternalCreativeAiInvocation,
} from '@neko/shared';
import { registerAgentCoreCommands } from '../agentCoreCommands';

vi.mock('@neko/agent/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neko/agent/runtime')>();
  return {
    ...actual,
    buildAgentPromptCommandMessage: vi.fn(actual.buildAgentPromptCommandMessage),
  };
});

function createMemoryMemento(): vscode.Memento {
  const values = new Map<string, unknown>();
  return {
    keys: () => Array.from(values.keys()),
    get: <T>(key: string, defaultValue?: T): T | undefined =>
      values.has(key) ? (values.get(key) as T) : defaultValue,
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  } as vscode.Memento;
}

function externalInvocation(): ExternalCreativeAiInvocation {
  const documentRef: CreativeAiDocumentRef = {
    kind: 'nk-document',
    packageId: 'neko-canvas',
    documentId: 'doc-1',
    projectRelativePath: 'boards/intro.nkc',
    label: 'Intro',
  };
  const sourceRef: CreativeAiSourceRef = {
    kind: 'canvas-node',
    packageId: 'neko-canvas',
    id: 'canvas-node:shot-1',
    documentRef,
    entityId: 'shot-1',
    revision: 'source-rev-1',
  };
  const targetRef: CreativeAiTargetRef = {
    kind: 'canvas-field',
    packageId: 'neko-canvas',
    id: 'canvas-node:shot-1#/generatedImage',
    documentRef,
    entityId: 'shot-1',
    fieldPath: '/generatedImage',
    revision: 'target-rev-1',
  };
  return {
    schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
    domain: 'external-creative-package',
    invocationId: 'invoke-1',
    sourcePackage: 'neko-canvas',
    documentRef,
    sourceRef,
    targetRef,
    intent: 'Generate a stable image output.',
    mode: 'generate',
    writeback: {
      kind: 'mutating',
      atomicity: 'per-target',
      requiresRevisionMatch: true,
    },
    documentRevision: 'doc-rev-1',
    targetRevision: 'target-rev-1',
    routing: {
      associationKey: 'neko-canvas:document:boards/intro.nkc',
      allowCreateBackgroundConversation: true,
    },
    idempotencyKey: 'canvas-ai:doc-1:shot-1:target-rev-1',
  };
}

describe('agentCoreCommands bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('collects VSCode input and delegates image command prompt construction to runtime', async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> };
    const chatViewProvider = {
      sendMessageToAssistant: vi.fn(),
      sendContextPayload: vi.fn(),
      startCharacterDialogue: vi.fn(),
      startEmbodyCharacter: vi.fn(),
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

  it('routes Canvas storyboard action intent context through Agent prompt prefill', async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> };
    const chatViewProvider = {
      sendMessageToAssistant: vi.fn(),
      sendContextPayload: vi.fn(),
      startCharacterDialogue: vi.fn(),
      startEmbodyCharacter: vi.fn(),
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
      .mock.calls.find(([command]) => command === 'neko.agent.sendContext')?.[1];
    expect(callback).toBeDefined();

    await callback?.({
      type: 'canvas-storyboard-action-intent',
      id: 'shot-1:generate-video',
      label: 'Storyboard action: generate-video',
      summary: 'Raw Canvas summary',
      data: {
        intent: {
          version: 1,
          actionId: 'generate-video',
          target: { nodeId: 'shot-1', sceneNodeId: 'scene-1', shotNumber: 1 },
        },
      },
      intent: 'generate-video',
    });

    expect(chatViewProvider.sendContextPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'canvas-storyboard-action-intent',
        id: 'shot-1:generate-video',
        summary: 'Generate Video for shot-1',
        intent: expect.stringContaining('处理 Canvas 分镜下一步动作'),
      }),
    );
    expect(chatViewProvider.sendContextPayload.mock.calls[0]?.[0].intent).toContain(
      'Action intent: generate-video',
    );
    expect(chatViewProvider.sendContextPayload.mock.calls[0]?.[0].intent).toContain(
      'Agent 拥有 provider 调用、异步任务',
    );
    expect(chatViewProvider.sendMessageToAssistant).not.toHaveBeenCalled();
  });

  it('accepts external creative AI invocations into background conversations', async () => {
    const context = {
      subscriptions: [] as Array<{ dispose(): void }>,
      workspaceState: createMemoryMemento(),
    };
    const conversations = new Set(['agent-selected']);
    const chatViewProvider = {
      sendMessageToAssistant: vi.fn(),
      sendContextPayload: vi.fn(),
      startCharacterDialogue: vi.fn(),
      startEmbodyCharacter: vi.fn(),
      dndBroker: { getPayload: vi.fn(), clearPayload: vi.fn() },
      setPluginCommandsGetter: vi.fn(),
      sendPluginSlashCommands: vi.fn(),
      getSelectedAgentConversationId: vi.fn(() => 'agent-selected'),
      hasConversation: vi.fn((conversationId: string) => conversations.has(conversationId)),
      createBackgroundCreativeAiConversation: vi.fn(({ title }: { title?: string }) => {
        expect(title).toContain('neko-canvas AI');
        conversations.add('background-1');
        return 'background-1';
      }),
    };

    registerAgentCoreCommands(
      context as never,
      chatViewProvider as never,
      { get: vi.fn() } as never,
    );

    const callback = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(([command]) => command === 'neko.agent.creativeAi.invokeExternal')?.[1];
    expect(callback).toBeDefined();

    const result = await callback?.(externalInvocation());

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        status: 'created',
        decision: expect.objectContaining({
          conversationId: 'background-1',
          domain: 'external-creative-package',
          routingReason: 'created-new-background-conversation',
        }),
        snapshot: expect.objectContaining({
          conversationId: 'background-1',
          invocationId: 'invoke-1',
          sourcePackage: 'neko-canvas',
        }),
      }),
    );
    expect(result.decision.conversationId).not.toBe('agent-selected');
    expect(chatViewProvider.createBackgroundCreativeAiConversation).toHaveBeenCalled();
  });

  it('registers the Character Dialogue command through the Agent-owned launch path', async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> };
    const chatViewProvider = {
      sendMessageToAssistant: vi.fn(),
      sendContextPayload: vi.fn(),
      startCharacterDialogue: vi.fn().mockResolvedValue({ sessionId: 'npc-session-1' }),
      startEmbodyCharacter: vi.fn(),
      dndBroker: { getPayload: vi.fn(), clearPayload: vi.fn() },
      setPluginCommandsGetter: vi.fn(),
      sendPluginSlashCommands: vi.fn(),
    };
    const services = { get: vi.fn() };

    registerAgentCoreCommands(context as never, chatViewProvider as never, services as never);

    const registration = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(([command]) => command === NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND);
    const callback = registration?.[1];
    expect(callback).toBeDefined();

    const request = {
      entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
      source: 'dashboard',
    };
    await callback?.(request);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('neko.aiAssistant.focus');
    expect(chatViewProvider.startCharacterDialogue).toHaveBeenCalledWith(request);
  });

  it('rejects invalid Character Dialogue launch command payloads', async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> };
    const chatViewProvider = {
      sendMessageToAssistant: vi.fn(),
      sendContextPayload: vi.fn(),
      startCharacterDialogue: vi.fn(),
      startEmbodyCharacter: vi.fn(),
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
      .mock.calls.find(([command]) => command === NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND)?.[1];
    await callback?.({ source: 'dashboard' });

    expect(chatViewProvider.startCharacterDialogue).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('无法启动角色对话：启动请求无效。');
  });

  it('registers Embody Character as an Agent-owned context switch', async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> };
    const chatViewProvider = {
      sendMessageToAssistant: vi.fn(),
      sendContextPayload: vi.fn(),
      startCharacterDialogue: vi.fn(),
      startEmbodyCharacter: vi.fn().mockResolvedValue({
        ok: true,
        conversationId: 'conv-embody-xiaoju',
      }),
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
      .mock.calls.find(
        ([registeredCommand]) => registeredCommand === NEKO_AGENT_EMBODY_CHARACTER_COMMAND,
      )?.[1];
    expect(callback).toBeDefined();

    await callback?.({
      workflow: 'embody-character',
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

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('neko.aiAssistant.focus');
    expect(chatViewProvider.startCharacterDialogue).not.toHaveBeenCalled();
    expect(chatViewProvider.sendMessageToAssistant).not.toHaveBeenCalled();
    expect(chatViewProvider.startEmbodyCharacter).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: 'embody-character',
        entityRef: expect.objectContaining({ entityId: 'char-xiaoju' }),
      }),
    );
    expect(
      vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.some(
          ([registeredCommand]) => registeredCommand === 'neko.agent.validateCharacter',
        ),
    ).toBe(false);
    expect(
      vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.some(
          ([registeredCommand]) => registeredCommand === 'neko.agent.improveCharacter',
        ),
    ).toBe(false);
  });

  it('declares activation events for character role commands before the Agent panel opens', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../../../../package.json', import.meta.url), 'utf8'),
    ) as { readonly activationEvents?: readonly string[] };

    expect(manifest.activationEvents).toContain(
      `onCommand:${NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND}`,
    );
    expect(manifest.activationEvents).toContain(`onCommand:${NEKO_AGENT_EMBODY_CHARACTER_COMMAND}`);
  });
});
