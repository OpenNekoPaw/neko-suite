import { describe, it, expect } from 'vitest';
import type {
  Message,
  MessageAttachment,
  ToolCall,
  ConversationSummary,
  OpenTab,
  TabType,
  SettingsSubTab,
  ShellExecutionMode,
  SettingsState,
  ConfiguredProvider,
} from '../types';
import type { ChatModelOption } from '@neko/shared';

/**
 * Type validation tests
 * These tests ensure our type definitions are structurally correct
 * and serve as documentation for the expected shapes.
 */
describe('types validation', () => {
  describe('Message type', () => {
    it('should accept valid user message', () => {
      const message: Message = {
        id: '123',
        role: 'user',
        content: 'Hello AI',
        timestamp: Date.now(),
      };
      expect(message.id).toBe('123');
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello AI');
      expect(typeof message.timestamp).toBe('number');
    });

    it('should accept valid assistant message with tool calls', () => {
      const message: Message = {
        id: '456',
        role: 'assistant',
        content: 'Let me help you',
        timestamp: Date.now(),
        toolCalls: [
          {
            id: 'tc1',
            name: 'read_file',
            arguments: { path: '/test.txt' },
          },
        ],
        isStreaming: false,
      };
      expect(message.toolCalls).toBeDefined();
      expect(message.toolCalls?.length).toBe(1);
      expect(message.isStreaming).toBe(false);
    });

    it('should accept message with attachments', () => {
      const attachment: MessageAttachment = {
        id: 'att1',
        name: 'test.png',
        type: 'image',
        path: '/path/to/test.png',
        size: 1024,
        preview: 'base64data...',
      };
      const message: Message = {
        id: '789',
        role: 'user',
        content: 'Check this image',
        timestamp: Date.now(),
        attachments: [attachment],
      };
      expect(message.attachments?.length).toBe(1);
      expect(message.attachments?.[0].type).toBe('image');
    });

    it('should accept message with background task IDs', () => {
      const message: Message = {
        id: '101',
        role: 'assistant',
        content: 'Task started',
        timestamp: Date.now(),
        backgroundTaskIds: ['task-1', 'task-2'],
      };
      expect(message.backgroundTaskIds?.length).toBe(2);
    });
  });

  describe('ToolCall type', () => {
    it('should accept tool call with result', () => {
      const toolCall: ToolCall = {
        id: 'tc1',
        name: 'execute_shell',
        arguments: { command: 'ls' },
        result: {
          success: true,
          data: ['file1.txt', 'file2.txt'],
        },
      };
      expect(toolCall.result?.success).toBe(true);
    });

    it('should accept tool call with pending confirmation', () => {
      const toolCall: ToolCall = {
        id: 'tc2',
        name: 'write_file',
        arguments: { path: '/test.txt', content: 'data' },
        pendingConfirmation: true,
        confirmation: {
          action: 'write',
          description: 'Write to file',
          details: { path: '/test.txt' },
        },
      };
      expect(toolCall.pendingConfirmation).toBe(true);
      expect(toolCall.confirmation?.action).toBe('write');
    });

    it('should accept tool call with error result', () => {
      const toolCall: ToolCall = {
        id: 'tc3',
        name: 'read_file',
        arguments: { path: '/nonexistent' },
        result: {
          success: false,
          data: null,
          error: 'File not found',
        },
      };
      expect(toolCall.result?.success).toBe(false);
      expect(toolCall.result?.error).toBe('File not found');
    });
  });

  describe('ConversationSummary type', () => {
    it('should accept valid conversation summary', () => {
      const summary: ConversationSummary = {
        id: 'conv-1',
        title: 'Chat about code',
        messageCount: 10,
        updatedAt: Date.now(),
      };
      expect(summary.id).toBe('conv-1');
      expect(summary.messageCount).toBe(10);
    });
  });

  describe('OpenTab type', () => {
    it('should accept valid open tab', () => {
      const tab: OpenTab = {
        id: 'tab-1',
        title: 'New Chat',
        conversationId: 'conv-1',
      };
      expect(tab.id).toBe('tab-1');
      expect(tab.conversationId).toBe('conv-1');
    });
  });

  describe('TabType and SettingsSubTab', () => {
    it('should accept valid tab types', () => {
      const tabTypes: TabType[] = ['chat', 'settings', 'tasks'];
      tabTypes.forEach((type) => {
        expect(['chat', 'settings', 'tasks']).toContain(type);
      });
    });

    it('should accept valid settings sub tabs', () => {
      const subTabs: SettingsSubTab[] = ['provider', 'mcp', 'models', 'skills'];
      subTabs.forEach((tab) => {
        expect(['provider', 'mcp', 'models', 'skills']).toContain(tab);
      });
    });
  });

  describe('ShellExecutionMode type', () => {
    it('should accept valid execution modes', () => {
      const modes: ShellExecutionMode[] = ['plan', 'ask', 'auto'];
      modes.forEach((mode) => {
        expect(['plan', 'ask', 'auto']).toContain(mode);
      });
    });
  });

  describe('ConfiguredProvider type', () => {
    it('should accept valid provider config', () => {
      const provider: ConfiguredProvider = {
        id: 'openai-1',
        type: 'openai',
        name: 'My OpenAI',
        apiKey: 'sk-xxx',
        baseUrl: 'https://api.openai.com/v1',
        enabled: true,
      };
      expect(provider.id).toBe('openai-1');
      expect(provider.type).toBe('openai');
      expect(provider.enabled).toBe(true);
    });

    it('should accept minimal provider config', () => {
      const provider: ConfiguredProvider = {
        id: 'local-1',
        type: 'ollama',
        name: 'Local Ollama',
      };
      expect(provider.apiKey).toBeUndefined();
      expect(provider.baseUrl).toBeUndefined();
      expect(provider.enabled).toBeUndefined();
    });

    it('should accept builtin provider', () => {
      const provider: ConfiguredProvider = {
        id: 'builtin-openai',
        type: 'openai',
        name: 'OpenAI',
        builtin: true,
        enabled: true,
      };
      expect(provider.builtin).toBe(true);
    });
  });

  describe('ChatModelOption type', () => {
    it('should accept valid model option', () => {
      const option: ChatModelOption = {
        id: 'openai:gpt-4',
        label: 'OpenAI / GPT-4',
        providerId: 'openai',
        modelId: 'gpt-4',
      };
      expect(option.id).toBe('openai:gpt-4');
      expect(option.label).toBe('OpenAI / GPT-4');
    });

    it('should accept auto model option', () => {
      const option: ChatModelOption = {
        id: 'auto',
        label: 'Auto',
        providerId: '',
        modelId: '',
      };
      expect(option.id).toBe('auto');
    });
  });

  describe('SettingsState type', () => {
    it('should accept valid settings state', () => {
      const settings: SettingsState = {
        providers: [],
        configuredProviders: [],
        providerTemplates: [],
        configuredModels: [],
        configuredPrompts: [],
        configuredAgents: [],
        selectedPromptId: 'default',
        selectedAgentId: 'default',
        configuredMCPServers: [],
        configuredSkills: [],
        configuredCommands: [],
        configuredHooks: [],
        configuredToolSkills: [],
        selectedProviderId: null,
        selectedModelId: null,
        systemPrompt: '',
        autoExecuteTools: true,
        streamResponses: true,
        showToolCalls: true,
        temperature: 0.7,
        maxTokens: 4096,
        executionMode: 'ask',
        promptMode: 'default',
        chatModelOptions: [],
      };
      expect(settings.executionMode).toBe('ask');
      expect(settings.temperature).toBe(0.7);
      expect(settings.maxTokens).toBe(4096);
    });

    it('should have consistent prompt/agent fields', () => {
      const settings: SettingsState = {
        providers: [],
        configuredProviders: [],
        providerTemplates: [],
        configuredModels: [],
        configuredPrompts: [
          {
            id: 'p1',
            name: 'Test',
            type: 'chat',
            systemPrompt: 'You are helpful',
            enabled: true,
          } as any,
        ],
        configuredAgents: [],
        selectedPromptId: 'p1',
        selectedAgentId: 'p1',
        configuredMCPServers: [],
        configuredSkills: [],
        configuredCommands: [],
        configuredHooks: [],
        configuredToolSkills: [],
        selectedProviderId: 'openai',
        selectedModelId: 'gpt-4',
        systemPrompt: '',
        autoExecuteTools: false,
        streamResponses: true,
        showToolCalls: false,
        temperature: 0.5,
        maxTokens: 2048,
        executionMode: 'auto',
        promptMode: 'default',
        chatModelOptions: [],
      };
      // Both should reference the same prompt system
      expect(settings.selectedPromptId).toBe('p1');
      expect(settings.configuredPrompts.length).toBe(1);
    });
  });
});
