import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  handleChatWebviewMessage,
  type ChatWebviewMessageRouterDeps,
} from '../chatWebviewMessageRouter';
import type { WebviewToExtensionMessage } from '@neko-agent/types';

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
      handleRemoveTask: vi.fn(),
      handleViewTaskResult: vi.fn(),
      handleClearCompletedTasks: vi.fn(),
    } as any,
    skillHandler: {
      sendSkillsList: vi.fn(),
      handleExecuteSkill: vi.fn(),
      handleCancelSkill: vi.fn(),
    } as any,
    fileOperationHandler: {
      handleOpenFile: vi.fn(),
      handleRevealFile: vi.fn(),
      handleOpenConfigFile: vi.fn(),
      handleOpenPromptConfig: vi.fn(),
      handleOpenAgentsFile: vi.fn(),
      handleOpenSettingsFile: vi.fn(),
      handleOpenSkillFile: vi.fn(),
      handleOpenCommandFile: vi.fn(),
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
    providerHandler: {
      handleAddModel: vi.fn(),
      handleRemoveModel: vi.fn(),
      handleToggleProvider: vi.fn(),
      handleToggleModel: vi.fn(),
    } as any,
    integrationHandler: {
      addMCPServer: vi.fn(),
      handleTestMCPServer: vi.fn(),
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
      handleStopAgent: vi.fn(),
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
});
