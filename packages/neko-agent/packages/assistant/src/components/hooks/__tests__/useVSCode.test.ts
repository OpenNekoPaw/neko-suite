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
  // @ts-expect-error - mocking global
  globalThis.acquireVsCodeApi = () => mockVSCodeApi;
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

    describe('provider management', () => {
      it('should post updateProvider', () => {
        const provider = {
          id: 'p1',
          name: 'Test',
          displayName: 'Test Provider',
          type: 'openai' as const,
          apiUrl: 'https://api.test.com',
          enabled: true,
        };
        VSCodeMessages.updateProvider(provider);
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'updateProvider',
          provider,
        });
      });

      it('should post deleteProvider', () => {
        VSCodeMessages.deleteProvider('p1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'deleteProvider',
          providerId: 'p1',
        });
      });

      it('should post toggleProvider', () => {
        VSCodeMessages.toggleProvider('openai', true);
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'toggleProvider',
          providerType: 'openai',
          enabled: true,
        });
      });
    });

    describe('MCP server management', () => {
      it('should post updateMCPServer', () => {
        const server = {
          id: 'mcp1',
          name: 'Test MCP',
          command: 'node',
          args: ['server.js'],
          enabled: true,
        };
        VSCodeMessages.updateMCPServer(server as any);
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'updateMCPServer',
          server,
        });
      });

      it('should post deleteMCPServer', () => {
        VSCodeMessages.deleteMCPServer('mcp1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'deleteMCPServer',
          serverId: 'mcp1',
        });
      });

      it('should post testMCPServer', () => {
        const server = {
          id: 'mcp1',
          name: 'Test',
          command: 'node',
          requestId: 'req-123',
        };
        VSCodeMessages.testMCPServer(server);
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'testMCPServer',
          server,
        });
      });
    });

    describe('workflow management', () => {
      it('should post updateWorkflow', () => {
        const workflow = {
          id: 'w1',
          name: 'Test Workflow',
          engineType: 'comfyui',
          url: 'http://localhost:8188',
          enabled: true,
        };
        VSCodeMessages.updateWorkflow(workflow as any);
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'updateWorkflow',
          workflow,
        });
      });

      it('should post deleteWorkflow', () => {
        VSCodeMessages.deleteWorkflow('w1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'deleteWorkflow',
          workflowId: 'w1',
        });
      });

      it('should post testWorkflow', () => {
        const workflow = {
          id: 'w1',
          name: 'Test',
          engineType: 'comfyui',
          url: 'http://localhost:8188',
          requestId: 'req-456',
        };
        VSCodeMessages.testWorkflow(workflow);
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'testWorkflow',
          workflow,
        });
      });
    });

    describe('prompt management', () => {
      it('should post updatePrompt', () => {
        const prompt = {
          id: 'pr1',
          name: 'Test Prompt',
          type: 'chat' as const,
          systemPrompt: 'You are helpful',
          enabled: true,
        };
        VSCodeMessages.updatePrompt(prompt as any);
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'updatePrompt',
          prompt,
        });
      });

      it('should post deletePrompt', () => {
        VSCodeMessages.deletePrompt('pr1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'deletePrompt',
          promptId: 'pr1',
        });
      });
    });

    describe('model management', () => {
      it('should post updateModel', () => {
        const model = {
          id: 'm1',
          name: 'GPT-4',
          providerId: 'openai',
          enabled: true,
        };
        VSCodeMessages.updateModel(model as any);
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'updateModel',
          model,
        });
      });

      it('should post deleteModel', () => {
        VSCodeMessages.deleteModel('m1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'deleteModel',
          modelId: 'm1',
        });
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
        VSCodeMessages.confirmTool('tool-1', true);
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'confirmTool',
          toolCallId: 'tool-1',
          approved: true,
        });
      });
    });

    describe('model presets', () => {
      it('should post getModelPresets', () => {
        VSCodeMessages.getModelPresets();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getModelPresets' });
      });

      it('should post configureModelPreset', () => {
        VSCodeMessages.configureModelPreset('gpt-4', 'sk-xxx', 'https://api.openai.com');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'configureModelPreset',
          modelId: 'gpt-4',
          apiKey: 'sk-xxx',
          baseUrl: 'https://api.openai.com',
        });
      });

      it('should post toggleModelPreset', () => {
        VSCodeMessages.toggleModelPreset('gpt-4', false);
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'toggleModelPreset',
          modelId: 'gpt-4',
          enabled: false,
        });
      });

      it('should post removeModelPresetConfig', () => {
        VSCodeMessages.removeModelPresetConfig('gpt-4');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'removeModelPresetConfig',
          modelId: 'gpt-4',
        });
      });

      it('should post exportModelConfig', () => {
        VSCodeMessages.exportModelConfig(true);
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'exportModelConfig',
          includeSecrets: true,
        });
      });

      it('should post importModelConfig', () => {
        VSCodeMessages.importModelConfig('{"models":[]}', { overwrite: true });
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'importModelConfig',
          jsonString: '{"models":[]}',
          options: { overwrite: true },
        });
      });

      it('should post addCustomModel', () => {
        VSCodeMessages.addCustomModel('{"id":"m1"}', 'sk-xxx');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'addCustomModel',
          configJson: '{"id":"m1"}',
          apiKey: 'sk-xxx',
        });
      });
    });
  });
});
