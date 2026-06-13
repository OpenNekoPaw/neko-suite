import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Mock VSCode API - must be before any imports that use it
const mockPostMessage = vi.fn();
const mockVSCodeApi = {
  postMessage: mockPostMessage,
  getState: vi.fn(),
  setState: vi.fn(),
};

// Setup global mock before module loads
beforeAll(() => {
  (globalThis as Record<string, unknown>).acquireVsCodeApi = () => mockVSCodeApi;
});

// Dynamic import to ensure mock is set up first
let postMessage: typeof import('../../../messages').postMessage;
let VSCodeMessages: typeof import('../../../messages').VSCodeMessages;
let vscode: typeof import('../../../messages').vscode;

beforeAll(async () => {
  // Clear module cache to ensure fresh import with mock
  vi.resetModules();
  const module = await import('../../../messages');
  postMessage = module.postMessage;
  VSCodeMessages = module.VSCodeMessages;
  vscode = module.vscode;
});

describe('messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('vscode API', () => {
    it('should acquire VSCode API', () => {
      expect(vscode).toBeDefined();
      expect(vscode).toBe(mockVSCodeApi);
    });
  });

  describe('postMessage()', () => {
    it('should call vscode.postMessage with message', () => {
      const message = { type: 'test', data: 'value' };
      postMessage(message);
      expect(mockPostMessage).toHaveBeenCalledWith(message);
    });

    it('should handle complex message objects', () => {
      const message = {
        type: 'complex',
        nested: { key: 'value' },
        array: [1, 2, 3],
      };
      postMessage(message);
      expect(mockPostMessage).toHaveBeenCalledWith(message);
    });
  });

  describe('VSCodeMessages', () => {
    describe('sendMessage()', () => {
      it('should post sendMessage with basic params', () => {
        VSCodeMessages.sendMessage({
          conversationId: 'conv-1',
          message: 'Hello AI',
          sessionMode: 'agent',
        });
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'sendMessage',
          conversationId: 'conv-1',
          message: 'Hello AI',
          sessionMode: 'agent',
        });
      });

      it('should post sendMessage with all params', () => {
        const attachments = [{ id: '1', name: 'test.txt', type: 'file' as const }];
        VSCodeMessages.sendMessage({
          conversationId: 'conv-1',
          message: 'Hello',
          sessionMode: 'agent',
          chatModel: { providerId: 'openai', modelId: 'gpt-4', category: 'llm' },
          mediaModels: {
            image: { providerId: 'openai', modelId: 'gpt-image-1', category: 'image' },
          },
          attachments,
          promptId: 'prompt-1',
        });
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'sendMessage',
          conversationId: 'conv-1',
          message: 'Hello',
          sessionMode: 'agent',
          chatModel: { providerId: 'openai', modelId: 'gpt-4', category: 'llm' },
          mediaModels: {
            image: { providerId: 'openai', modelId: 'gpt-image-1', category: 'image' },
          },
          attachments,
          promptId: 'prompt-1',
        });
      });
    });

    describe('conversation management', () => {
      it('should post newConversation', () => {
        VSCodeMessages.newConversation();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'newConversation' });
      });

      it('should post switchConversation with ID', () => {
        VSCodeMessages.switchConversation('conv-123');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'switchConversation',
          conversationId: 'conv-123',
        });
      });

      it('should post deleteConversation with ID', () => {
        VSCodeMessages.deleteConversation('conv-456');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'deleteConversation',
          conversationId: 'conv-456',
        });
      });

      it('should post getConversations', () => {
        VSCodeMessages.getConversations();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getConversations' });
      });

      it('should post getActiveConversation', () => {
        VSCodeMessages.getActiveConversation();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getActiveConversation' });
      });
    });

    describe('settings', () => {
      it('should post getSettings', () => {
        VSCodeMessages.getSettings();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getSettings' });
      });

      it('should post updateSettings with data', () => {
        VSCodeMessages.updateSettings({ executionMode: 'auto' });
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'updateSettings',
          settings: { executionMode: 'auto' },
        });
      });

      it('should post clearHistory', () => {
        VSCodeMessages.clearHistory('conv-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'clearHistory',
          conversationId: 'conv-1',
        });
      });
    });

    describe('task management', () => {
      it('should post getTasks', () => {
        VSCodeMessages.getTasks('conv-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'getTasks',
          conversationId: 'conv-1',
        });
      });

      it('should post getAgentStates', () => {
        VSCodeMessages.getAgentStates();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getAgentStates' });
      });

      it('should post cancelTask', () => {
        VSCodeMessages.cancelTask('task-123', 'conv-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'cancelTask',
          taskId: 'task-123',
          conversationId: 'conv-1',
        });
      });

      it('should post viewTaskResult', () => {
        VSCodeMessages.viewTaskResult('task-123', 'conv-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'viewTaskResult',
          taskId: 'task-123',
          conversationId: 'conv-1',
        });
      });

      it('should post retryTask', () => {
        VSCodeMessages.retryTask('task-123', 'conv-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'retryTask',
          taskId: 'task-123',
          conversationId: 'conv-1',
        });
      });
    });

    describe('config management', () => {
      it('should post getConfig', () => {
        VSCodeMessages.getConfig();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getConfig' });
      });

      it('should post getSkills', () => {
        VSCodeMessages.getSkills();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getSkills' });
      });

      it('should post searchProjectFiles', () => {
        VSCodeMessages.searchProjectFiles('*.ts', 'conv-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'searchProjectFiles',
          filter: '*.ts',
          conversationId: 'conv-1',
        });
      });

      it('should post confirmTool', () => {
        VSCodeMessages.confirmTool('tool-1', true, 'conv-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'confirmTool',
          toolCallId: 'tool-1',
          approved: true,
          conversationId: 'conv-1',
        });
      });

      it('should post cancelMessage with conversationId', () => {
        VSCodeMessages.cancelMessage('conv-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'cancelMessage',
          conversationId: 'conv-1',
        });
      });

      it('should post exitCharacterDialogueSession with session scope', () => {
        VSCodeMessages.exitCharacterDialogueSession('npc-session-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'exitCharacterDialogueSession',
          sessionId: 'npc-session-1',
        });
      });

      it('should post invokePluginSlashCommand with conversationId', () => {
        VSCodeMessages.invokePluginSlashCommand('neko.canvas', 'batch', 'conv-1', 'scene 1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'invokePluginSlashCommand',
          extensionId: 'neko.canvas',
          commandId: 'batch',
          conversationId: 'conv-1',
          args: 'scene 1',
        });
      });
    });
  });
});
