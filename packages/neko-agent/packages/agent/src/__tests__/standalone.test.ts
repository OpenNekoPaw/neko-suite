/**
 * Standalone Mode Tests
 *
 * Verifies that @neko/agent can work independently without @neko/platform
 */

import { describe, it, expect } from 'vitest';

// Import all major exports to verify they work standalone
import {
  // Errors
  AgentError,

  // Skill system
  SkillRegistry,
  SkillLoader,
  SkillInjector,
  SkillMatcher,
  KeywordSkillMatcher,
  ToolGuard,
  NoOpToolGuard,
  createToolGuard,
  SkillService,
  createSkillService,
  builtinSkills,
  builtinCommands,
  MarkdownParser,

  // Tools
  ToolRegistry,
  createToolRegistry,
  BuiltinTool,
  createTool,

  // MCP
  MCPManager,
  MCPTool,

  // Memory
  InMemorySessionMemory,

  // Context
  ConversationCompressor,

  // Validation
  ImageValidator,
  OutputValidator,
  ValidationHooks,
  createImageValidator,
  createOutputValidator,

  // Permission
  PermissionRuleMatcher,
  PermissionHooks,
  createPermissionRuleMatcher,
  DEFAULT_READ_ONLY_TOOLS,

  // Hooks
  RetryHooks,
  MemoryHooks,
  composeHooks,

  // Hook Loader
  HookLoader,
  HOOK_DIRECTORIES,
  DEFAULT_HOOK_METADATA,
} from '../index';

describe('Standalone Mode', () => {
  describe('Imports', () => {
    it('should export AgentError', () => {
      expect(AgentError).toBeDefined();
      const error = new AgentError({ message: 'test', category: 'tool' });
      expect(error.message).toBe('test');
      expect(error.category).toBe('tool');
    });

    it('should export skill system components', () => {
      expect(SkillRegistry).toBeDefined();
      expect(SkillLoader).toBeDefined();
      expect(SkillInjector).toBeDefined();
      expect(SkillMatcher).toBeDefined();
      expect(KeywordSkillMatcher).toBeDefined();
      expect(ToolGuard).toBeDefined();
      expect(NoOpToolGuard).toBeDefined();
      expect(createToolGuard).toBeDefined();
      expect(SkillService).toBeDefined();
      expect(createSkillService).toBeDefined();
      expect(builtinSkills).toBeDefined();
      expect(builtinCommands).toBeDefined();
      expect(MarkdownParser).toBeDefined();
    });

    it('should export tool system components', () => {
      expect(ToolRegistry).toBeDefined();
      expect(createToolRegistry).toBeDefined();
      expect(BuiltinTool).toBeDefined();
      expect(createTool).toBeDefined();
    });

    it('should export MCP components', () => {
      expect(MCPManager).toBeDefined();
      expect(MCPTool).toBeDefined();
    });

    it('should export memory components', () => {
      expect(InMemorySessionMemory).toBeDefined();
      expect(ConversationCompressor).toBeDefined();
    });

    it('should export validation components', () => {
      expect(ImageValidator).toBeDefined();
      expect(OutputValidator).toBeDefined();
      expect(ValidationHooks).toBeDefined();
      expect(createImageValidator).toBeDefined();
      expect(createOutputValidator).toBeDefined();
    });

    it('should export permission components', () => {
      expect(PermissionRuleMatcher).toBeDefined();
      expect(PermissionHooks).toBeDefined();
      expect(createPermissionRuleMatcher).toBeDefined();
      expect(DEFAULT_READ_ONLY_TOOLS).toBeDefined();
    });

    it('should export hooks components', () => {
      expect(RetryHooks).toBeDefined();
      expect(MemoryHooks).toBeDefined();
      expect(composeHooks).toBeDefined();
    });

    it('should export hook-loader components', () => {
      expect(HookLoader).toBeDefined();
      expect(HOOK_DIRECTORIES).toBeDefined();
      expect(DEFAULT_HOOK_METADATA).toBeDefined();
    });
  });

  describe('SkillRegistry', () => {
    it('should create and use skill registry standalone', () => {
      const registry = new SkillRegistry();

      // Register a skill
      registry.registerSkill({
        name: 'test-skill',
        description: 'A test skill',
        content: 'Test content',
        source: 'project',
        directoryPath: '/test',
        enabled: true,
      });

      // Verify skill is registered
      expect(registry.getSkill('test-skill')).toBeDefined();
      expect(registry.getSkill('test-skill')?.name).toBe('test-skill');
      expect(registry.listSkills().length).toBe(1);
    });

    it('should register and list commands', () => {
      const registry = new SkillRegistry();

      // Register a command
      registry.registerCommand({
        command: 'test-command',
        name: 'Test Command',
        description: 'A test command',
        content: 'Test content',
        source: 'project',
        filePath: '/test/command.md',
        enabled: true,
      });

      // Verify command is registered
      expect(registry.hasCommand('test-command')).toBe(true);
      expect(registry.getCommand('test-command')?.command).toBe('test-command');
      expect(registry.listCommands().length).toBe(1);
    });
  });

  describe('ToolRegistry', () => {
    it('should create and use tool registry standalone', () => {
      const registry = createToolRegistry();

      // Create a simple tool
      const tool = createTool({
        name: 'test-tool',
        description: 'A test tool',
        category: 'utility',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
        },
        execute: async (args) => {
          return { success: true, data: `Received: ${args.input}` };
        },
      });

      // Register and execute
      registry.register(tool);
      expect(registry.has('test-tool')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should execute tools', async () => {
      const registry = createToolRegistry();

      const tool = createTool({
        name: 'echo',
        description: 'Echo input',
        category: 'utility',
        parameters: { type: 'object', properties: {} },
        execute: async (args) => {
          return { success: true, data: args };
        },
      });

      registry.register(tool);
      const result = await registry.execute('echo', { message: 'hello' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ message: 'hello' });
    });
  });

  describe('MCPManager', () => {
    it('should create MCP manager standalone', () => {
      const manager = new MCPManager();
      expect(manager).toBeDefined();
      expect(manager.listServers()).toEqual([]);
    });

    it('should register MCP server config', () => {
      const manager = new MCPManager();

      manager.register({
        id: 'test-server',
        name: 'Test Server',
        transport: 'stdio',
        enabled: true,
        config: {
          command: 'node',
          args: ['server.js'],
        },
      });

      expect(manager.listServers().length).toBe(1);
      expect(manager.listServers()[0]?.name).toBe('Test Server');
    });
  });

  describe('Memory Components', () => {
    it('should use InMemorySessionMemory', async () => {
      const memory = new InMemorySessionMemory();

      await memory.addMessage({ role: 'user', content: 'Hello' });
      await memory.addMessage({ role: 'assistant', content: 'Hi there!' });

      const history = await memory.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]?.role).toBe('user');
    });

    it('should use ConversationCompressor', () => {
      const compressor = new ConversationCompressor();
      const tokens = compressor.estimateTokens([
        { role: 'user', content: 'Hello world' },
      ]);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('Permission Components', () => {
    it('should create permission rule matcher', () => {
      const matcher = createPermissionRuleMatcher({
        allow: ['Read', 'Glob'],
        deny: ['Bash(rm *)'],
        ask: ['Write'],
      });

      expect(matcher).toBeDefined();
    });

    it('should check read-only tools', () => {
      expect(DEFAULT_READ_ONLY_TOOLS).toContain('Read');
      expect(DEFAULT_READ_ONLY_TOOLS).toContain('Glob');
      expect(DEFAULT_READ_ONLY_TOOLS).toContain('Grep');
    });
  });

  describe('Validation Components', () => {
    it('should create image validator', () => {
      const validator = createImageValidator();
      expect(validator).toBeDefined();
    });

    it('should create output validator', () => {
      const validator = createOutputValidator();
      expect(validator).toBeDefined();
    });
  });

  describe('Hook Loader', () => {
    it('should have correct default values', () => {
      expect(HOOK_DIRECTORIES.project).toBe('.hook');
      expect(DEFAULT_HOOK_METADATA.enabled).toBe(true);
      expect(DEFAULT_HOOK_METADATA.priority).toBe(100);
    });
  });

  describe('Hooks Composition', () => {
    it('should compose multiple hooks', () => {
      const retryHooks = new RetryHooks();
      const memoryHooks = new MemoryHooks();

      const composed = composeHooks(retryHooks, memoryHooks);
      expect(composed.length).toBe(2);
    });
  });
});
