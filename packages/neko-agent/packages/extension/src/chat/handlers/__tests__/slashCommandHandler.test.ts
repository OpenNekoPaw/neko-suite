/**
 * SlashCommandHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlashCommandHandler } from '../slashCommandHandler';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockConversations() {
  return {
    getActiveId: vi.fn().mockReturnValue('conv-1'),
    list: vi.fn().mockReturnValue([
      { id: 'conv-1', title: 'Conversation 1' },
      { id: 'conv-2', title: 'Conversation 2' },
    ]),
    clearCurrent: vi.fn(),
    create: vi.fn(),
    manager: {
      get: vi.fn().mockReturnValue({ messages: [{ role: 'user', content: 'hi' }] }),
      updateMessages: vi.fn(),
    },
  };
}

function createMockSettings() {
  return {
    selectedProviderId: 'anthropic',
    selectedModelId: 'claude-3',
    executionMode: 'auto' as const,
  };
}

function createMockSystemPrompt() {
  return {
    isPlanMode: vi.fn().mockReturnValue(false),
    togglePlanMode: vi.fn(),
    getMode: vi.fn().mockReturnValue('default'),
    getPrompt: vi.fn().mockReturnValue('system prompt'),
  };
}

function createMockSkillHandler() {
  return {
    handleSlashCommand: vi.fn().mockReturnValue(null),
    getActiveSkill: vi.fn().mockReturnValue(undefined),
  };
}

function createMockTaskHandler() {
  return { sendTasks: vi.fn() };
}

function createMockContextHandler() {
  return { compressContext: vi.fn() };
}

function createMockPlanModeHandler() {
  return { handleTogglePlanMode: vi.fn() };
}

describe('SlashCommandHandler', () => {
  let handler: SlashCommandHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let conversations: ReturnType<typeof createMockConversations>;
  let settings: ReturnType<typeof createMockSettings>;
  let systemPrompt: ReturnType<typeof createMockSystemPrompt>;
  let skillHandler: ReturnType<typeof createMockSkillHandler>;
  let taskHandler: ReturnType<typeof createMockTaskHandler>;
  let contextHandler: ReturnType<typeof createMockContextHandler>;
  let planModeHandler: ReturnType<typeof createMockPlanModeHandler>;
  let sendConversationList: ReturnType<typeof vi.fn>;
  let sendActiveConversation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    conversations = createMockConversations();
    settings = createMockSettings();
    systemPrompt = createMockSystemPrompt();
    skillHandler = createMockSkillHandler();
    taskHandler = createMockTaskHandler();
    contextHandler = createMockContextHandler();
    planModeHandler = createMockPlanModeHandler();
    sendConversationList = vi.fn();
    sendActiveConversation = vi.fn();

    handler = new SlashCommandHandler({
      conversations: conversations as any,
      settings: settings as any,
      systemPrompt: systemPrompt as any,
      skillHandler: skillHandler as any,
      taskHandler: taskHandler as any,
      contextHandler: contextHandler as any,
      planModeHandler: planModeHandler as any,
      sendConversationList,
      sendActiveConversation,
    });
  });

  describe('handleCommand - builtin commands', () => {
    it('should strip leading / from command', () => {
      handler.handleCommand(webview as any, '/help');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'help', success: true, action: 'showHelp' }),
      );
    });

    it('should handle /clear command', () => {
      handler.handleCommand(webview as any, 'clear');

      expect(conversations.clearCurrent).toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith({ type: 'historyCleared' });
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'clear',
          success: true,
          message: 'Conversation cleared',
        }),
      );
    });

    it('should clear agent history on /clear when active conversation exists', () => {
      const agentManager = { clearHistory: vi.fn(), getContextTokenCount: vi.fn() };
      handler = new SlashCommandHandler({
        conversations: conversations as any,
        agentManager: agentManager as any,
        settings: settings as any,
        systemPrompt: systemPrompt as any,
        skillHandler: skillHandler as any,
        taskHandler: taskHandler as any,
        contextHandler: contextHandler as any,
        planModeHandler: planModeHandler as any,
        sendConversationList,
        sendActiveConversation,
      });

      handler.handleCommand(webview as any, 'cls');
      expect(agentManager.clearHistory).toHaveBeenCalledWith('conv-1');
    });

    it('should handle /exit command', () => {
      handler.handleCommand(webview as any, 'exit');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'exit', success: true, action: 'exit' }),
      );
    });

    it('should handle /quit alias', () => {
      handler.handleCommand(webview as any, 'q');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'q', success: true, action: 'exit' }),
      );
    });

    it('should handle /help command', () => {
      handler.handleCommand(webview as any, 'help');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'help', action: 'showHelp' }),
      );
    });

    it('should handle /new command', () => {
      handler.handleCommand(webview as any, 'new');

      expect(conversations.create).toHaveBeenCalled();
      expect(sendConversationList).toHaveBeenCalled();
      expect(sendActiveConversation).toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'new',
          success: true,
          message: 'New conversation created',
        }),
      );
    });

    it('should handle /status command', () => {
      handler.handleCommand(webview as any, 'status');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'status',
          success: true,
          action: 'showStatus',
          data: expect.objectContaining({
            provider: 'anthropic',
            model: 'claude-3',
            conversationCount: 2,
          }),
        }),
      );
    });

    it('should handle /s alias for status', () => {
      handler.handleCommand(webview as any, 's');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'status', action: 'showStatus' }),
      );
    });

    it('should handle /compact command', () => {
      handler.handleCommand(webview as any, 'compact');

      expect(contextHandler.compressContext).toHaveBeenCalledWith(webview, 'conv-1');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'compact', success: true }),
      );
    });

    it('should handle /model command', () => {
      handler.handleCommand(webview as any, 'model');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'showModelSelector' }),
      );
    });

    it('should handle /settings command', () => {
      handler.handleCommand(webview as any, 'settings');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'showSettings' }),
      );
    });

    it('should handle /plan command', () => {
      systemPrompt.isPlanMode.mockReturnValue(true);
      handler.handleCommand(webview as any, 'plan');

      expect(planModeHandler.handleTogglePlanMode).toHaveBeenCalledWith(webview);
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'plan',
          action: 'togglePlanMode',
          data: { planMode: true },
        }),
      );
    });

    it('should handle /tasks command', () => {
      handler.handleCommand(webview as any, 'tasks');

      expect(taskHandler.sendTasks).toHaveBeenCalledWith(webview);
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'showTasks' }),
      );
    });

    it('should handle /todos alias', () => {
      handler.handleCommand(webview as any, 'todos');

      expect(taskHandler.sendTasks).toHaveBeenCalledWith(webview);
    });

    it('should handle /mcp command', () => {
      handler.handleCommand(webview as any, 'mcp');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'showMCPServers' }),
      );
    });

    it('should handle /permissions command', () => {
      handler.handleCommand(webview as any, 'permissions');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'showPermissions' }),
      );
    });

    it('should handle /init command', () => {
      handler.handleCommand(webview as any, 'init');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'initProject' }),
      );
    });

    it('should handle /resume command with conversation data', () => {
      handler.handleCommand(webview as any, 'resume');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'resume',
          action: 'resumeConversation',
          data: {
            conversations: expect.arrayContaining([
              expect.objectContaining({ id: 'conv-1', title: 'Conversation 1' }),
            ]),
          },
        }),
      );
    });
  });

  describe('handleCommand - skill commands', () => {
    it('should delegate to skillHandler for unknown builtin commands', () => {
      skillHandler.handleSlashCommand.mockReturnValue({
        applied: true,
        injection: { name: 'commit' },
      });

      handler.handleCommand(webview as any, 'commit', 'fix bug');

      expect(skillHandler.handleSlashCommand).toHaveBeenCalledWith(webview, 'commit', 'fix bug');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'commit', success: true }),
      );
    });

    it('should report error when skill command fails', () => {
      skillHandler.handleSlashCommand.mockReturnValue({ applied: false, error: 'Skill not found' });

      handler.handleCommand(webview as any, 'badcmd');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'badcmd', success: false, error: 'Skill not found' }),
      );
    });

    it('should report unknown command when skill returns null', () => {
      skillHandler.handleSlashCommand.mockReturnValue(null);

      handler.handleCommand(webview as any, 'unknown');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Unknown command'),
        }),
      );
    });
  });

  describe('sendStatusInfo', () => {
    it('should aggregate status from all deps', () => {
      const agentManager = { getContextTokenCount: vi.fn().mockReturnValue(2500) };
      skillHandler.getActiveSkill.mockReturnValue({ skill: { name: 'commit' } });

      handler = new SlashCommandHandler({
        conversations: conversations as any,
        agentManager: agentManager as any,
        settings: settings as any,
        systemPrompt: systemPrompt as any,
        skillHandler: skillHandler as any,
        taskHandler: taskHandler as any,
        contextHandler: contextHandler as any,
        planModeHandler: planModeHandler as any,
        sendConversationList,
        sendActiveConversation,
      });

      handler.sendStatusInfo(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'anthropic',
            model: 'claude-3',
            conversationCount: 2,
            tokenCount: 2500,
            activeSkill: 'commit',
            planMode: false,
            executionMode: 'auto',
            messageCount: 1,
          }),
        }),
      );
    });

    it('should return 0 token count without agentManager', () => {
      handler.sendStatusInfo(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tokenCount: 0 }),
        }),
      );
    });
  });
});
