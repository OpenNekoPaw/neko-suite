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

vi.mock('../../services/pluginTransferBridge', () => ({
  sendGeneratedAssetToPlugin: vi.fn(),
}));

type RoutedWebviewMessageType =
  | (typeof CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES)[number]
  | (typeof CONFIG_BRIDGE_MESSAGE_TYPES)[number];
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
    taskHandler: {
      sendTasks: vi.fn(),
      handleCancelTask: vi.fn(),
      handleRetryTask: vi.fn(),
      handleViewTaskResult: vi.fn(),
    } as any,
    skillHandler: {
      sendSkillsList: vi.fn(),
      clearActiveSkill: vi.fn(),
    } as any,
    fileOperationHandler: {
      handleOpenFile: vi.fn(),
      handleRevealDocumentLocator: vi.fn(),
      handleRevealFile: vi.fn(),
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
      handleClearHistory: vi.fn(),
      handleClearAllConversations: vi.fn(),
    } as any,
    dndBroker: {
      setPayload: vi.fn(),
    } as any,
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

    handleChatWebviewMessage(
      {
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
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

  it('routes clearActiveSkill with explicit conversation context', () => {
    const deps = createDeps();

    handleChatWebviewMessage({ type: 'clearActiveSkill', conversationId: 'conv-1' }, deps);

    expect(deps.skillHandler.clearActiveSkill).toHaveBeenCalledWith('conv-1');
  });
});
