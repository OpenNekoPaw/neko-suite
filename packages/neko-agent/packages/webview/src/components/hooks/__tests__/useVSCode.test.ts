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
let postMessage: typeof import('../useVSCode').postMessage;
let VSCodeMessages: typeof import('../useVSCode').VSCodeMessages;
let vscode: typeof import('../useVSCode').vscode;

beforeAll(async () => {
  // Clear module cache to ensure fresh import with mock
  vi.resetModules();
  const module = await import('../useVSCode');
  postMessage = module.postMessage;
  VSCodeMessages = module.VSCodeMessages;
  vscode = module.vscode;
});

describe('useVSCode', () => {
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
        VSCodeMessages.sendMessage('Hello AI');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'sendMessage',
          message: 'Hello AI',
          providerId: undefined,
          modelId: undefined,
          attachments: undefined,
          promptId: undefined,
        });
      });

      it('should post sendMessage with all params', () => {
        const attachments = [{ id: '1', name: 'test.txt', type: 'file' as const }];
        VSCodeMessages.sendMessage('Hello', 'openai', 'gpt-4', attachments, 'prompt-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'sendMessage',
          message: 'Hello',
          providerId: 'openai',
          modelId: 'gpt-4',
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
        VSCodeMessages.clearHistory();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'clearHistory' });
      });
    });

    describe('task management', () => {
      it('should post getTasks', () => {
        VSCodeMessages.getTasks();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getTasks' });
      });

      it('should post getAgentStates', () => {
        VSCodeMessages.getAgentStates();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getAgentStates' });
      });

      it('should post cancelTask', () => {
        VSCodeMessages.cancelTask('task-123');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'cancelTask',
          taskId: 'task-123',
        });
      });

      it('should post removeTask', () => {
        VSCodeMessages.removeTask('task-123');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'removeTask',
          taskId: 'task-123',
        });
      });

      it('should post viewTaskResult', () => {
        VSCodeMessages.viewTaskResult('task-123');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'viewTaskResult',
          taskId: 'task-123',
        });
      });

      it('should post clearCompletedTasks', () => {
        VSCodeMessages.clearCompletedTasks();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'clearCompletedTasks' });
      });
    });

    describe('config management', () => {
      it('should post getConfig', () => {
        VSCodeMessages.getConfig();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getConfig' });
      });

      it('should post searchProjectFiles', () => {
        VSCodeMessages.searchProjectFiles('*.ts');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'searchProjectFiles',
          filter: '*.ts',
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
    });
  });
});
