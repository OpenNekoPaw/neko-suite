import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES,
  handleChatWebviewMessage,
  type ChatWebviewMessageRouterDeps,
} from '../chatWebviewMessageRouter';
import {
  WEBVIEW_TO_EXTENSION_MESSAGE_TYPES,
  type WebviewToExtensionMessage,
} from '@neko-agent/types';
import { CONFIG_BRIDGE_MESSAGE_TYPES } from '../../services/configBridge';
import { sendGeneratedAssetToPlugin } from '../../services/pluginTransferBridge';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

vi.mock('../../services/pluginTransferBridge', () => ({
  sendGeneratedAssetToPlugin: vi.fn(),
}));

type RoutedWebviewMessageType =
  (typeof CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES)[number] | (typeof CONFIG_BRIDGE_MESSAGE_TYPES)[number];
type UnroutedWebviewMessageType = Exclude<
  WebviewToExtensionMessage['type'],
  RoutedWebviewMessageType
>;
type DuplicateBridgeMessageType = Extract<
  (typeof CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES)[number],
  (typeof CONFIG_BRIDGE_MESSAGE_TYPES)[number]
>;
type AssertNever<T extends never> = T;
type _AllWebviewMessagesRouted = AssertNever<UnroutedWebviewMessageType>;
type _NoBridgeMessageOverlap = AssertNever<DuplicateBridgeMessageType>;

function createDeps(): ChatWebviewMessageRouterDeps {
  return {
    webview: { postMessage: vi.fn().mockResolvedValue(true) } as any,
    messages: {
      handleUserMessage: vi.fn(),
      searchProjectFiles: vi.fn(),
    } as any,
    characterDialogue: {
      hasSession: vi.fn(() => false),
      routeUserMessage: vi.fn(),
      launchFromSlash: vi.fn(),
      cancel: vi.fn(() => false),
      exit: vi.fn(),
    } as any,
    embodyCharacter: {
      hasSession: vi.fn(() => false),
      routeUserMessage: vi.fn(),
      cancel: vi.fn(() => false),
      exit: vi.fn(),
    } as any,
    taskHandler: {
      sendTasks: vi.fn(),
      handleCancelTask: vi.fn(),
      handleRetryTask: vi.fn(),
      handleViewTaskResult: vi.fn(),
    } as any,
    skillHandler: {
      sendSkillsList: vi.fn(),
      clearActiveSkill: vi.fn(),
      handleSkillInvocation: vi.fn().mockResolvedValue({ applied: true }),
    } as any,
    fileOperationHandler: {
      handleOpenFile: vi.fn(),
      handleRevealDocumentLocator: vi.fn(),
      handleRevealFile: vi.fn(),
      handleRevealAsset: vi.fn(),
      handleOpenConfigFile: vi.fn(),
      handleOpenUrl: vi.fn(),
      handleDownloadSvg: vi.fn(),
    } as any,
    planModeHandler: {
      handlePlanApprove: vi.fn(),
      handlePlanReject: vi.fn(),
      handlePlanStepAction: vi.fn(),
      handlePlanStepModify: vi.fn(),
      handleSetPromptMode: vi.fn(),
      handleTogglePlanMode: vi.fn(),
      sendPromptMode: vi.fn(),
    } as any,
    settingsHandler: {
      sendSettings: vi.fn(),
      handleUpdateSettings: vi.fn(),
    } as any,
    contextHandler: {
      getTokenCount: vi.fn(),
      compressContext: vi.fn(),
    } as any,
    slashCommandHandler: {
      handleCommand: vi.fn(),
    } as any,
    conversationMessageHandler: {
      handleConfirmTool: vi.fn(),
      handleCancelMessage: vi.fn(),
      handleNewConversation: vi.fn(),
      handleSwitchConversation: vi.fn(),
      handleDeleteConversation: vi.fn(),
      sendConversationList: vi.fn(),
      sendActiveConversation: vi.fn(),
      sendAgentStateSnapshot: vi.fn(),
      sendMessageQueueSnapshot: vi.fn(),
      handlePromoteQueuedMessage: vi.fn(),
      handleCancelQueuedMessage: vi.fn(),
      handleEditQueuedMessage: vi.fn(),
      handleClearHistory: vi.fn(),
      handleClearAllConversations: vi.fn(),
    } as any,
    dndBroker: {
      setPayload: vi.fn(),
    } as any,
    refreshConfigSnapshot: vi.fn(),
    sendTabState: vi.fn(),
    updateTabState: vi.fn(),
    syncCanvasAmbientScopeFromActiveConversation: vi.fn(),
  };
}

describe('handleChatWebviewMessage', () => {
  it('keeps every webview-to-extension message assigned to exactly one bridge', () => {
    const chatTypes = new Set<string>(CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES);
    const configTypes = new Set<string>(CONFIG_BRIDGE_MESSAGE_TYPES);
    const duplicated = [...chatTypes].filter((type) => configTypes.has(type));
    const covered = new Set([...chatTypes, ...configTypes]);
    const missing = WEBVIEW_TO_EXTENSION_MESSAGE_TYPES.filter((type) => !covered.has(type));

    expect(duplicated).toEqual([]);
    expect(missing).toEqual([]);
    expect(configTypes.has('getSkills')).toBe(false);
    expect(chatTypes.has('getSkills')).toBe(true);
  });

  it('routes sendMessage to the message handler with explicit conversation state', () => {
    const deps = createDeps();
    const agentModels = {
      primary: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' as const },
    };
    const llmConfig = {
      reasoningPreset: 'balanced' as const,
      verbosityPreset: 'standard' as const,
      creativityPreset: 'creative' as const,
    };

    handleChatWebviewMessage(
      {
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        agentModels,
        llmConfig,
        contextPayloads: [
          {
            type: 'document-selection',
            id: 'selection-1',
            label: 'Selection',
            summary: 'Selected text',
            data: { selectedText: 'hello' },
          },
        ],
      },
      deps,
    );

    expect(deps.messages?.handleUserMessage).toHaveBeenCalledWith(
      deps.webview,
      expect.objectContaining({
        conversationId: 'conv-1',
        messageText: 'hello',
        sessionMode: 'agent',
        agentModels,
        llmConfig,
        contextPayloads: [
          {
            type: 'document-selection',
            id: 'selection-1',
            label: 'Selection',
            summary: 'Selected text',
            data: { selectedText: 'hello' },
          },
        ],
      }),
    );
    expect(deps.messages?.handleUserMessage).toHaveBeenCalledTimes(1);
    expect(deps.slashCommandHandler.handleCommand).not.toHaveBeenCalled();
    expect(deps.taskHandler.sendTasks).not.toHaveBeenCalled();
  });

  it('routes message queue commands with explicit conversation scope', () => {
    const deps = createDeps();

    handleChatWebviewMessage({ type: 'getMessageQueue', conversationId: 'conv-1' }, deps);
    handleChatWebviewMessage(
      {
        type: 'promoteQueuedMessage',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      },
      deps,
    );
    handleChatWebviewMessage(
      {
        type: 'cancelQueuedMessage',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      },
      deps,
    );
    handleChatWebviewMessage(
      {
        type: 'editQueuedMessage',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      },
      deps,
    );

    expect(deps.conversationMessageHandler.sendMessageQueueSnapshot).toHaveBeenCalledWith(
      deps.webview,
      'conv-1',
    );
    expect(deps.conversationMessageHandler.handlePromoteQueuedMessage).toHaveBeenCalledWith(
      deps.webview,
      'conv-1',
      'queue-1',
    );
    expect(deps.conversationMessageHandler.handleCancelQueuedMessage).toHaveBeenCalledWith(
      deps.webview,
      'conv-1',
      'queue-1',
    );
    expect(deps.conversationMessageHandler.handleEditQueuedMessage).toHaveBeenCalledWith(
      deps.webview,
      'conv-1',
      'queue-1',
    );
  });

  it('routes Character Dialogue sendMessage to the Character Dialogue controller without ordinary conversation persistence', () => {
    const deps = createDeps();
    vi.mocked(deps.characterDialogue!.hasSession).mockReturnValue(true);

    handleChatWebviewMessage(
      {
        type: 'sendMessage',
        conversationId: 'npc-session-1',
        message: 'hello',
        sessionMode: 'agent',
      },
      deps,
    );

    expect(deps.characterDialogue?.routeUserMessage).toHaveBeenCalledWith('npc-session-1', 'hello');
    expect(deps.messages?.handleUserMessage).not.toHaveBeenCalled();
  });

  it('routes Embody Character sendMessage to the Embody controller without ordinary conversation persistence', () => {
    const deps = createDeps();
    vi.mocked(deps.embodyCharacter!.hasSession).mockReturnValue(true);

    handleChatWebviewMessage(
      {
        type: 'sendMessage',
        conversationId: 'embody-session-1',
        message: '记录今天的日记',
        sessionMode: 'agent',
      },
      deps,
    );

    expect(deps.embodyCharacter?.routeUserMessage).toHaveBeenCalledWith(
      'embody-session-1',
      '记录今天的日记',
    );
    expect(deps.messages?.handleUserMessage).not.toHaveBeenCalled();
  });

  it('routes roleplay candidate search without requiring an ordinary conversation', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      {
        type: 'searchProjectFiles',
        filter: '',
        purpose: 'roleplay',
      },
      deps,
    );

    expect(deps.messages?.searchProjectFiles).toHaveBeenCalledWith(deps.webview, '', undefined, {
      purpose: 'roleplay',
    });
    expect(deps.webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'globalError' }),
    );
  });

  it('routes entry mention search without requiring an ordinary conversation', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      {
        type: 'searchProjectFiles',
        filter: 'hero',
        purpose: 'entry',
      },
      deps,
    );

    expect(deps.messages?.searchProjectFiles).toHaveBeenCalledWith(
      deps.webview,
      'hero',
      undefined,
      {
        purpose: 'entry',
      },
    );
    expect(deps.webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'globalError' }),
    );
  });

  it('routes entry roleplay launches directly to Character Dialogue without an ordinary tab', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      {
        type: 'startCharacterDialogueFromSlash',
        args: 'entity:char-xiaoju --roleplay --skip-enrich',
      },
      deps,
    );

    expect(deps.characterDialogue?.launchFromSlash).toHaveBeenCalledWith({
      args: 'entity:char-xiaoju --roleplay --skip-enrich',
    });
    expect(deps.slashCommandHandler.handleCommand).not.toHaveBeenCalled();
    expect(deps.messages?.handleUserMessage).not.toHaveBeenCalled();
  });

  it('routes Character Dialogue exit events to the Character Dialogue controller', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      { type: 'exitCharacterDialogueSession', sessionId: 'npc-session-1' },
      deps,
    );

    expect(deps.characterDialogue?.exit).toHaveBeenCalledWith('npc-session-1');
  });

  it('routes Embody Character exit events to the Embody controller', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      { type: 'exitEmbodyCharacterSession', sessionId: 'embody-session-1' },
      deps,
    );

    expect(deps.embodyCharacter?.exit).toHaveBeenCalledWith('embody-session-1');
  });

  it('rejects task actions without an explicit conversationId', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      { type: 'cancelTask', taskId: 'task-1' } as WebviewToExtensionMessage,
      deps,
    );

    expect(deps.taskHandler.handleCancelTask).not.toHaveBeenCalled();
    expect(deps.webview.postMessage).toHaveBeenCalledWith({
      type: 'globalError',
      message: 'Cannot cancelTask without an explicit conversationId.',
    });
  });

  it('syncs ambient scope after switching conversations', () => {
    const deps = createDeps();

    handleChatWebviewMessage({ type: 'switchConversation', conversationId: 'conv-2' }, deps);

    expect(deps.conversationMessageHandler.handleSwitchConversation).toHaveBeenCalledWith('conv-2');
    expect(deps.syncCanvasAmbientScopeFromActiveConversation).toHaveBeenCalledTimes(1);
  });

  it('routes delete conversation activation intent to the conversation handler', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      { type: 'deleteConversation', conversationId: 'conv-2', activateNext: false },
      deps,
    );

    expect(deps.conversationMessageHandler.handleDeleteConversation).toHaveBeenCalledWith(
      'conv-2',
      { activateNext: false },
    );
    expect(deps.syncCanvasAmbientScopeFromActiveConversation).toHaveBeenCalledTimes(1);
  });

  it('routes plugin slash commands with explicit conversation context', () => {
    const deps = createDeps();
    vi.mocked(vscode.commands.executeCommand).mockClear();

    handleChatWebviewMessage(
      {
        type: 'invokePluginSlashCommand',
        extensionId: 'neko.canvas',
        commandId: 'batch',
        conversationId: 'conv-1',
        args: 'scene 1',
      },
      deps,
    );

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('neko.canvas.slashCommand.batch', {
      extensionId: 'neko.canvas',
      commandId: 'batch',
      conversationId: 'conv-1',
      args: 'scene 1',
    });
  });

  it('routes builtin slash commands with explicit conversation context', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      {
        type: 'invokeSlashCommand',
        command: 'as',
        args: '@小橘 --consult',
        conversationId: 'conv-1',
      },
      deps,
    );

    expect(deps.slashCommandHandler.handleCommand).toHaveBeenCalledWith(
      deps.webview,
      'as',
      '@小橘 --consult',
      'conv-1',
    );
  });

  it('routes explicit skill invocations without reusing slash command dispatch', () => {
    const deps = createDeps();
    vi.mocked(vscode.commands.executeCommand).mockClear();

    handleChatWebviewMessage(
      {
        type: 'invokeSkill',
        skillName: 'quality-review',
        args: 'changed files',
        conversationId: 'conv-1',
      },
      deps,
    );

    expect(deps.skillHandler.handleSkillInvocation).toHaveBeenCalledWith(
      deps.webview,
      'quality-review',
      'conv-1',
      'changed files',
    );
    expect(deps.slashCommandHandler.handleCommand).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it('returns a visible diagnostic when explicit skill invocation fails', async () => {
    const deps = createDeps();
    vi.mocked(deps.skillHandler.handleSkillInvocation).mockResolvedValue({
      applied: false,
      error: 'Unknown skill: $missing',
    });

    handleChatWebviewMessage(
      {
        type: 'invokeSkill',
        skillName: 'missing',
        conversationId: 'conv-1',
      },
      deps,
    );
    await Promise.resolve();

    expect(deps.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'slashCommandResult',
        command: '$missing',
        success: false,
        error: 'Unknown skill: $missing',
      }),
    );
  });

  it('routes sendToPlugin with the media type hint intact', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      {
        type: 'sendToPlugin',
        target: 'canvas',
        assetPath: '/tmp/frame.png',
        mediaType: 'image',
      },
      deps,
    );

    expect(sendGeneratedAssetToPlugin).toHaveBeenCalledWith(
      'canvas',
      '/tmp/frame.png',
      'image',
      undefined,
    );
  });

  it('routes structured sendToPlugin payloads intact', () => {
    const deps = createDeps();
    const payload = {
      kind: 'assetBatch' as const,
      assets: [
        { path: '/tmp/frame-1.png', mediaType: 'image' as const },
        { path: '/tmp/frame-2.png', mediaType: 'image' as const },
      ],
    };

    handleChatWebviewMessage(
      {
        type: 'sendToPlugin',
        target: 'cut',
        payload,
      },
      deps,
    );

    expect(sendGeneratedAssetToPlugin).toHaveBeenCalledWith('cut', undefined, undefined, payload);
  });

  it('routes document locator reveals to the file operation handler', () => {
    const deps = createDeps();
    const locator = { kind: 'page' as const, pageNumber: 2, pageIndex: 1 };

    handleChatWebviewMessage(
      {
        type: 'revealDocumentLocator',
        filePath: '/books/a.pdf',
        locator,
        source: { filePath: '/books/a.pdf', format: 'pdf' },
      },
      deps,
    );

    expect(deps.fileOperationHandler.handleRevealDocumentLocator).toHaveBeenCalledWith({
      filePath: '/books/a.pdf',
      locator,
      source: { filePath: '/books/a.pdf', format: 'pdf' },
    });
  });

  it('routes explicit asset reveals to the file operation handler', () => {
    const deps = createDeps();

    handleChatWebviewMessage({ type: 'revealAsset', assetId: 'asset-1' }, deps);

    expect(deps.fileOperationHandler.handleRevealAsset).toHaveBeenCalledWith('asset-1');
  });

  it('routes asset context source reveals through asset-library navigation data', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      {
        type: 'revealContextSource',
        contextType: 'asset',
        contextId: 'asset:asset-1',
        navigationData: {
          partition: 'asset-library',
          sourceId: 'asset-1',
          filePath: '${ASSETS}/hero.png',
        },
      },
      deps,
    );

    expect(deps.fileOperationHandler.handleRevealAsset).toHaveBeenCalledWith('asset-1');
    expect(deps.fileOperationHandler.handleOpenFile).not.toHaveBeenCalled();
  });

  it('routes media library context source reveals to the media library tree', () => {
    const deps = createDeps();
    vi.mocked(vscode.commands.executeCommand).mockClear();

    handleChatWebviewMessage(
      {
        type: 'revealContextSource',
        contextType: 'media',
        contextId: 'media-1',
        navigationData: {
          partition: 'media-library',
          filePath: '${REFS}/hero.png',
          resolvedPath: '/refs/hero.png',
        },
      },
      deps,
    );

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'neko.assets.revealMediaLibraryFile',
      '/refs/hero.png',
    );
    expect(deps.fileOperationHandler.handleOpenFile).not.toHaveBeenCalled();
  });

  it('rejects plugin slash commands without an explicit conversationId', () => {
    const deps = createDeps();
    vi.mocked(vscode.commands.executeCommand).mockClear();

    handleChatWebviewMessage(
      {
        type: 'invokePluginSlashCommand',
        extensionId: 'neko.canvas',
        commandId: 'batch',
      } as WebviewToExtensionMessage,
      deps,
    );

    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    expect(deps.webview.postMessage).toHaveBeenCalledWith({
      type: 'globalError',
      message: 'Cannot invoke plugin slash command without an explicit conversationId.',
    });
  });

  it('routes getSkills to the chat skill handler', () => {
    const deps = createDeps();

    handleChatWebviewMessage({ type: 'getSkills' }, deps);

    expect(deps.skillHandler.sendSkillsList).toHaveBeenCalledWith(deps.webview);
  });

  it('routes lifecycle config snapshot refresh without calling settings directly', () => {
    const deps = createDeps();

    handleChatWebviewMessage({ type: 'refreshConfigSnapshot' }, deps);

    expect(deps.refreshConfigSnapshot).toHaveBeenCalledTimes(1);
    expect(deps.settingsHandler.sendSettings).not.toHaveBeenCalled();
  });

  it('routes clearActiveSkill with explicit conversation context', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      { type: 'clearActiveSkill', conversationId: 'conv-1', recordId: 'record-1' },
      deps,
    );

    expect(deps.skillHandler.clearActiveSkill).toHaveBeenCalledWith('conv-1', {
      recordId: 'record-1',
    });
  });
});
