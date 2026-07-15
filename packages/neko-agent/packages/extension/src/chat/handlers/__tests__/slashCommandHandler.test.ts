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
    getMessageCount: vi.fn().mockReturnValue(1),
    updateMessagesForConversation: vi.fn(),
    manager: {
      get: vi.fn().mockReturnValue({ messages: [{ role: 'user', content: 'hi' }] }),
      updateMessages: vi.fn(),
    },
  };
}

function createMockSettings() {
  const snapshot = {
    selectedProviderId: 'anthropic',
    selectedModelId: 'claude-3',
    executionMode: 'auto' as const,
  };
  return {
    ...snapshot,
    snapshotForConversation: vi.fn(() => snapshot),
  };
}

function createMockSkillHandler() {
  return {
    handleSlashCommand: vi.fn().mockResolvedValue(null),
    getActiveSkill: vi.fn().mockReturnValue(undefined),
    clearActiveSkill: vi.fn(),
    getSkillService: vi.fn().mockReturnValue(undefined),
  };
}

function createMockTaskHandler() {
  return { sendTasks: vi.fn() };
}

function createMockContextHandler() {
  return { compressContext: vi.fn() };
}

function createMockSettingsHandler() {
  return { handleUpdateSettings: vi.fn().mockResolvedValue(undefined) };
}

function createMockAgentTurnHandler() {
  return { handleUserMessage: vi.fn().mockResolvedValue(undefined) };
}

function createMockCharacterDialogue() {
  return {
    launchFromSlash: vi.fn().mockResolvedValue({ sessionId: 'npc-session-1' }),
    exitActive: vi.fn(),
  };
}

function createCommandArtifactRegistry(skills: readonly Record<string, unknown>[]) {
  return {
    skillCount: skills.length,
    listSkills: vi.fn(() => []),
    listAllSkills: vi.fn(() => skills),
    getSkill: vi.fn(),
    getSkillByCommand: vi.fn(),
    searchSkills: vi.fn(() => []),
  };
}

describe('SlashCommandHandler', () => {
  let handler: SlashCommandHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let conversations: ReturnType<typeof createMockConversations>;
  let settings: ReturnType<typeof createMockSettings>;
  let skillHandler: ReturnType<typeof createMockSkillHandler>;
  let taskHandler: ReturnType<typeof createMockTaskHandler>;
  let contextHandler: ReturnType<typeof createMockContextHandler>;
  let settingsHandler: ReturnType<typeof createMockSettingsHandler>;
  let agentTurnHandler: ReturnType<typeof createMockAgentTurnHandler>;
  let characterDialogue: ReturnType<typeof createMockCharacterDialogue>;
  let sendConversationList: ReturnType<typeof vi.fn>;
  let sendActiveConversation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    conversations = createMockConversations();
    settings = createMockSettings();
    skillHandler = createMockSkillHandler();
    taskHandler = createMockTaskHandler();
    contextHandler = createMockContextHandler();
    settingsHandler = createMockSettingsHandler();
    agentTurnHandler = createMockAgentTurnHandler();
    characterDialogue = createMockCharacterDialogue();
    sendConversationList = vi.fn();
    sendActiveConversation = vi.fn();

    handler = new SlashCommandHandler({
      conversations: conversations as any,
      settings: settings as any,
      messages: agentTurnHandler as any,
      skillHandler: skillHandler as any,
      taskHandler: taskHandler as any,
      contextHandler: contextHandler as any,
      settingsHandler: settingsHandler as any,
      characterDialogue: characterDialogue as any,
      sendConversationList,
      sendActiveConversation,
    });
  });

  describe('handleCommand - builtin commands', () => {
    it('should strip leading / from command', async () => {
      await handler.handleCommand(webview as any, '/help', undefined, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'help', success: true, action: 'showHelp' }),
      );
    });

    it('should handle /clear command', async () => {
      await handler.handleCommand(webview as any, 'clear', undefined, 'conv-1');

      expect(conversations.clearCurrent).not.toHaveBeenCalled();
      expect(conversations.updateMessagesForConversation).toHaveBeenCalledWith('conv-1', []);
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'historyCleared',
        conversationId: 'conv-1',
      });
      expect(conversations.getActiveId).not.toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'clear',
          success: true,
          action: 'clearHistory',
        }),
      );
    });

    it('should clear agent history on /clear when active conversation exists', async () => {
      const agentManager = { clearHistory: vi.fn(), getContextTokenCount: vi.fn() };
      handler = new SlashCommandHandler({
        conversations: conversations as any,
        agentManager: agentManager as any,
        settings: settings as any,
        messages: agentTurnHandler as any,
        skillHandler: skillHandler as any,
        taskHandler: taskHandler as any,
        contextHandler: contextHandler as any,
        settingsHandler: settingsHandler as any,
        sendConversationList,
        sendActiveConversation,
      });

      await handler.handleCommand(webview as any, 'cls', undefined, 'conv-1');
      expect(agentManager.clearHistory).toHaveBeenCalledWith('conv-1');
    });

    it('should handle /exit command', async () => {
      await handler.handleCommand(webview as any, 'exit', undefined, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'exit', success: true, action: 'exit' }),
      );
    });

    it('should handle /quit alias', async () => {
      await handler.handleCommand(webview as any, 'q', undefined, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'q', success: true, action: 'exit' }),
      );
    });

    it('should handle /help command', async () => {
      await handler.handleCommand(webview as any, 'help', undefined, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'help', action: 'showHelp' }),
      );
    });

    it('should handle /new command', async () => {
      await handler.handleCommand(webview as any, 'new', undefined, 'conv-1');

      expect(conversations.create).toHaveBeenCalled();
      expect(sendConversationList).toHaveBeenCalled();
      expect(sendActiveConversation).toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'new',
          success: true,
          action: 'newConversation',
        }),
      );
    });

    it('should handle /status command', async () => {
      await handler.handleCommand(webview as any, 'status', undefined, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'status',
          success: true,
          action: 'showStatus',
          data: expect.objectContaining({
            provider: 'anthropic',
            model: 'claude-3',
            conversationCount: 2,
            activeConversationId: 'conv-1',
          }),
        }),
      );
    });

    it('should use the provided conversationId for /status even if extension active differs', async () => {
      conversations.getActiveId.mockReturnValue('conv-active');

      await handler.handleCommand(webview as any, 'status', undefined, 'conv-2');

      expect(conversations.getActiveId).not.toHaveBeenCalled();
      expect(conversations.getMessageCount).toHaveBeenCalledWith('conv-2');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'status',
          data: expect.objectContaining({
            activeConversationId: 'conv-2',
            messageCount: 1,
          }),
        }),
      );
    });

    it('should handle /s alias for status', async () => {
      await handler.handleCommand(webview as any, 's', undefined, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'status', action: 'showStatus' }),
      );
    });

    it('should handle /compact command', async () => {
      await handler.handleCommand(webview as any, 'compact', undefined, 'conv-1');

      expect(contextHandler.compressContext).toHaveBeenCalledWith(webview, 'conv-1');
      expect(conversations.getActiveId).not.toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'compact', success: true }),
      );
    });

    it('should handle /model command', async () => {
      await handler.handleCommand(webview as any, 'model', undefined, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'showModelSelector' }),
      );
    });

    it('should handle /settings command', async () => {
      await handler.handleCommand(webview as any, 'settings', undefined, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'showSettings' }),
      );
    });

    it('should handle /plan command', async () => {
      await handler.handleCommand(webview as any, 'plan', undefined, 'conv-1');

      expect(settingsHandler.handleUpdateSettings).toHaveBeenCalledWith(
        webview,
        { executionMode: 'plan' },
        { conversationId: 'conv-1' },
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'plan',
          action: 'updateExecutionMode',
          data: { executionMode: 'plan' },
        }),
      );
    });

    it('should not execute slash arguments as a plan-mode side effect', async () => {
      await handler.handleCommand(webview as any, 'plan', 'outline the rollout', 'conv-1');

      expect(settingsHandler.handleUpdateSettings).toHaveBeenCalled();
      expect(agentTurnHandler.handleUserMessage).not.toHaveBeenCalled();
    });

    it('should handle /tasks command', async () => {
      await handler.handleCommand(webview as any, 'tasks', undefined, 'conv-1');

      expect(taskHandler.sendTasks).toHaveBeenCalledWith(webview, 'conv-1');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'showTasks' }),
      );
    });

    it('should handle /todos alias', async () => {
      await handler.handleCommand(webview as any, 'todos', undefined, 'conv-1');

      expect(taskHandler.sendTasks).toHaveBeenCalledWith(webview, 'conv-1');
    });

    it('should handle /mcp command', async () => {
      await handler.handleCommand(webview as any, 'mcp', undefined, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'showMCPServers' }),
      );
    });

    it('should handle /permissions command', async () => {
      await handler.handleCommand(webview as any, 'permissions', undefined, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'showPermissions' }),
      );
    });

    it('should handle /init command', async () => {
      await handler.handleCommand(webview as any, 'init', undefined, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'initProject' }),
      );
    });

    it('should handle /resume command with conversation data', async () => {
      await handler.handleCommand(webview as any, 'resume', undefined, 'conv-1');

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

    it('should use shared builtin registry for /skills in extension', async () => {
      skillHandler.getSkillService.mockReturnValue({
        registry: {
          skillCount: 1,
          listSkills: vi.fn(() => [
            {
              name: 'commit-helper',
              description: 'Create commit messages',
              enabled: true,
              command: 'commit',
            },
          ]),
          listAllSkills: vi.fn(() => []),
          getSkill: vi.fn(),
          getSkillByCommand: vi.fn(),
          searchSkills: vi.fn(() => []),
        },
      });

      await handler.handleCommand(webview as any, 'skills', undefined, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'skills',
          success: true,
          message: expect.stringContaining('commit-helper'),
        }),
      );
    });

    it('should not execute CLI-only builtins in extension mode', async () => {
      await handler.handleCommand(webview as any, 'config', undefined, 'conv-1');

      expect(skillHandler.handleSlashCommand).not.toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'config',
          success: false,
          error: expect.any(String),
        }),
      );
    });

    it('routes /as into the Character Dialogue controller instead of ordinary slash runtime', async () => {
      await handler.handleCommand(webview as any, 'as', '@小橘 --consult hello', 'conv-1');

      expect(characterDialogue.launchFromSlash).toHaveBeenCalledWith({
        args: '@小橘 --consult hello',
        conversationId: 'conv-1',
      });
      expect(skillHandler.handleSlashCommand).not.toHaveBeenCalled();
      expect(agentTurnHandler.handleUserMessage).not.toHaveBeenCalled();
      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('routes /exit-as into the Character Dialogue controller', async () => {
      await handler.handleCommand(webview as any, 'exit-as', undefined, 'npc-session-1');

      expect(characterDialogue.exitActive).toHaveBeenCalledWith('npc-session-1');
      expect(skillHandler.handleSlashCommand).not.toHaveBeenCalled();
      expect(agentTurnHandler.handleUserMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleCommand - skill commands', () => {
    it('should execute command-artifact slash commands through the skill handler', async () => {
      const agentManager = { applySkillInjection: vi.fn() };
      handler = new SlashCommandHandler({
        conversations: conversations as any,
        agentManager: agentManager as any,
        settings: settings as any,
        messages: agentTurnHandler as any,
        skillHandler: skillHandler as any,
        taskHandler: taskHandler as any,
        contextHandler: contextHandler as any,
        settingsHandler: settingsHandler as any,
        sendConversationList,
        sendActiveConversation,
      });
      const skill = {
        name: 'commit-workflow',
        command: 'commit',
        entryPointKind: 'command-artifact',
        enabled: true,
      };
      skillHandler.getSkillService.mockReturnValue({
        registry: createCommandArtifactRegistry([skill]),
      });
      skillHandler.handleSlashCommand.mockResolvedValue({
        applied: true,
        injection: { name: 'commit' },
        skill,
      });

      await handler.handleCommand(webview as any, 'commit', 'fix bug', 'conv-1');

      expect(skillHandler.handleSlashCommand).toHaveBeenCalledWith(
        webview,
        'commit',
        'conv-1',
        'fix bug',
      );
      expect(agentManager.applySkillInjection).not.toHaveBeenCalled();
      expect(agentTurnHandler.handleUserMessage).toHaveBeenCalledWith(webview, {
        conversationId: 'conv-1',
        messageText: 'fix bug',
        sessionMode: 'agent',
      });
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'commit', success: true }),
      );
      const resultMessage = webview.postMessage.mock.calls.find(
        ([message]) => message?.type === 'slashCommandResult' && message.command === 'commit',
      )?.[0];
      expect(resultMessage).not.toHaveProperty('injection');
    });

    it('should only activate the skill when no slash arguments are provided', async () => {
      const agentManager = { applySkillInjection: vi.fn() };
      handler = new SlashCommandHandler({
        conversations: conversations as any,
        agentManager: agentManager as any,
        settings: settings as any,
        messages: agentTurnHandler as any,
        skillHandler: skillHandler as any,
        taskHandler: taskHandler as any,
        contextHandler: contextHandler as any,
        settingsHandler: settingsHandler as any,
        sendConversationList,
        sendActiveConversation,
      });
      const skill = {
        name: 'commit',
        command: 'commit',
        entryPointKind: 'command-artifact',
        enabled: true,
      };
      skillHandler.getSkillService.mockReturnValue({
        registry: createCommandArtifactRegistry([skill]),
      });
      skillHandler.handleSlashCommand.mockResolvedValue({
        applied: true,
        injection: { name: 'commit' },
        skill,
      });

      await handler.handleCommand(webview as any, 'commit', undefined, 'conv-1');

      expect(agentManager.applySkillInjection).not.toHaveBeenCalled();
      expect(agentTurnHandler.handleUserMessage).not.toHaveBeenCalled();
    });

    it('should escape skill names in IDC metadata for slash execution', async () => {
      const agentManager = { applySkillInjection: vi.fn() };
      handler = new SlashCommandHandler({
        conversations: conversations as any,
        agentManager: agentManager as any,
        settings: settings as any,
        messages: agentTurnHandler as any,
        skillHandler: skillHandler as any,
        taskHandler: taskHandler as any,
        contextHandler: contextHandler as any,
        settingsHandler: settingsHandler as any,
        sendConversationList,
        sendActiveConversation,
      });
      const skill = {
        name: '剪辑: 快速 workflow',
        command: 'edit',
        entryPointKind: 'command-artifact',
        enabled: true,
      };
      skillHandler.getSkillService.mockReturnValue({
        registry: createCommandArtifactRegistry([skill]),
      });
      skillHandler.handleSlashCommand.mockResolvedValue({
        applied: true,
        injection: { name: 'edit' },
        skill,
      });

      await handler.handleCommand(webview as any, 'edit', 'polish cut', 'conv-1');

      expect(agentTurnHandler.handleUserMessage).toHaveBeenCalledWith(webview, {
        conversationId: 'conv-1',
        messageText: 'polish cut',
        sessionMode: 'agent',
      });
    });

    it('should execute explicit skill slash input through the ordinary Agent turn', async () => {
      const agentManager = { applySkillInjection: vi.fn() };
      handler = new SlashCommandHandler({
        conversations: conversations as any,
        agentManager: agentManager as any,
        settings: settings as any,
        messages: agentTurnHandler as any,
        skillHandler: skillHandler as any,
        taskHandler: taskHandler as any,
        contextHandler: contextHandler as any,
        settingsHandler: settingsHandler as any,
        sendConversationList,
        sendActiveConversation,
      });
      const skill = {
        name: 'commit',
        command: 'commit',
        entryPointKind: 'command-artifact',
        enabled: true,
      };
      skillHandler.getSkillService.mockReturnValue({
        registry: createCommandArtifactRegistry([skill]),
      });
      skillHandler.handleSlashCommand.mockResolvedValue({
        applied: true,
        injection: { name: 'commit' },
        skill,
      });

      await handler.handleCommand(webview as any, 'commit', 'fix bug', 'conv-1');

      expect(agentTurnHandler.handleUserMessage).toHaveBeenCalledWith(webview, {
        conversationId: 'conv-1',
        messageText: 'fix bug',
        sessionMode: 'agent',
      });
    });

    it('should report unknown slash command without falling back to ordinary skills', async () => {
      skillHandler.handleSlashCommand.mockResolvedValue({
        applied: false,
        error: 'Skill not found',
      });

      await handler.handleCommand(webview as any, 'badcmd', undefined, 'conv-1');

      expect(skillHandler.handleSlashCommand).not.toHaveBeenCalled();
      expect(agentTurnHandler.handleUserMessage).not.toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'badcmd',
          success: false,
          error: expect.any(String),
        }),
      );
    });

    it('should report unknown command when skill returns null', async () => {
      skillHandler.handleSlashCommand.mockResolvedValue(null);

      await handler.handleCommand(webview as any, 'unknown', undefined, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String),
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
        messages: agentTurnHandler as any,
        skillHandler: skillHandler as any,
        taskHandler: taskHandler as any,
        contextHandler: contextHandler as any,
        settingsHandler: settingsHandler as any,
        sendConversationList,
        sendActiveConversation,
      });

      handler.sendStatusInfo(webview as any, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'anthropic',
            model: 'claude-3',
            conversationCount: 2,
            tokenCount: 2500,
            activeSkill: 'commit',
            executionMode: 'auto',
            messageCount: 1,
          }),
        }),
      );
    });

    it('should return 0 token count without agentManager', () => {
      handler.sendStatusInfo(webview as any, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tokenCount: 0 }),
        }),
      );
    });
  });
});
