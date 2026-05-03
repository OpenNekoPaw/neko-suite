/**
 * SubAgentManager Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SubAgentManager, SPECIALIZED_PRESETS } from '../subagent-manager';
import type { SubAgentConfig, SubAgentManagerDeps, SubAgentEvent } from '../types';

// =============================================================================
// Mocks
// =============================================================================

function createMockDeps(): SubAgentManagerDeps {
  const mockExecutor = {
    execute: vi.fn().mockResolvedValue({
      success: true,
      response: 'Task completed successfully',
      iterations: 3,
    }),
    executeStream: vi.fn(),
    abort: vi.fn(),
    getState: vi.fn().mockReturnValue('done'),
  };

  const mockService = {
    chat: vi.fn(),
    chatStream: vi.fn(),
    chatWithTools: vi.fn(),
    embed: vi.fn(),
    hasMediaGenerationService: vi.fn().mockReturnValue(false),
    getMediaGenerationService: vi.fn(),
    listProviderModels: vi.fn(),
    supportsModelListing: vi.fn(),
    listProviderModelsDetailed: vi.fn(),
    validateProviderApiKey: vi.fn(),
    supportsApiKeyValidation: vi.fn(),
  };

  const mockToolRegistry = {
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(),
    has: vi.fn(),
    list: vi.fn().mockReturnValue([
      { name: 'read_file', description: 'Read file' },
      { name: 'write_file', description: 'Write file' },
      { name: 'grep', description: 'Search content' },
    ]),
    listByCategory: vi.fn(),
    execute: vi.fn(),
    toToolDefinitions: vi.fn().mockReturnValue([
      {
        type: 'function',
        function: { name: 'read_file', description: 'Read file', parameters: {} },
      },
      {
        type: 'function',
        function: { name: 'write_file', description: 'Write file', parameters: {} },
      },
      {
        type: 'function',
        function: { name: 'grep', description: 'Search content', parameters: {} },
      },
    ]),
    size: 3,
  };

  return {
    createService: vi.fn().mockReturnValue(mockService),
    createAgent: vi.fn().mockReturnValue(mockExecutor),
    toolRegistry: mockToolRegistry,
    modelTierResolver: vi.fn((tier) => `test-${tier}-model`),
  };
}

function createTestConfig(overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    id: `test-${Date.now()}`,
    type: 'general',
    description: 'Test task',
    prompt: 'Do something',
    runMode: 'foreground',
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('SubAgentManager', () => {
  let manager: SubAgentManager;
  let deps: SubAgentManagerDeps;

  beforeEach(() => {
    deps = createMockDeps();
    manager = new SubAgentManager(deps);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('spawn', () => {
    it('should spawn a SubAgent and return its ID', async () => {
      const config = createTestConfig({ id: 'test-agent-1' });
      const id = await manager.spawn('parent-1', 'conv-1', config);

      expect(id).toBe('test-agent-1');
      expect(manager.getStatus('test-agent-1')).toBeDefined();
    });

    it('should emit spawned event', async () => {
      const events: SubAgentEvent[] = [];
      manager.onEvent((event) => events.push(event));

      const config = createTestConfig({ id: 'test-agent-2' });
      await manager.spawn('parent-1', 'conv-1', config);

      // Wait for async execution to start
      await new Promise((r) => setTimeout(r, 10));

      const spawnedEvent = events.find((e) => e.type === 'spawned');
      expect(spawnedEvent).toBeDefined();
      expect(spawnedEvent?.subAgentId).toBe('test-agent-2');
      expect(spawnedEvent?.parentAgentId).toBe('parent-1');
    });

    it('should respect MAX_SUBAGENTS_PER_PARENT limit', async () => {
      // Spawn max agents
      for (let i = 0; i < SubAgentManager.MAX_SUBAGENTS_PER_PARENT; i++) {
        await manager.spawn('parent-1', 'conv-1', createTestConfig({ id: `agent-${i}` }));
      }

      // Next spawn should throw
      await expect(
        manager.spawn('parent-1', 'conv-1', createTestConfig({ id: 'agent-overflow' })),
      ).rejects.toThrow('Max SubAgents per parent reached');
    });

    it('should create agent with correct config for specialized type', async () => {
      const config = createTestConfig({
        id: 'code-search-agent',
        type: 'code-search',
      });
      await manager.spawn('parent-1', 'conv-1', config);

      expect(deps.createAgent).toHaveBeenCalled();
      const agentConfig = (deps.createAgent as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(agentConfig.name).toContain('code-search');
      expect(agentConfig.systemPrompt).toContain(SPECIALIZED_PRESETS['code-search'].systemPrompt);
    });

    it('should resolve primary model through injected model tier resolver', async () => {
      const config = createTestConfig({
        id: 'model-resolver-agent',
        modelTier: 'powerful',
      });

      await manager.spawn('parent-1', 'conv-1', config);
      await manager.getResult('model-resolver-agent', 5000);

      const agentConfig = (deps.createAgent as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(agentConfig.primaryModel).toBe('test-powerful-model');
      expect(deps.modelTierResolver).toHaveBeenCalledWith(
        'powerful',
        expect.objectContaining({
          parentId: 'parent-1',
          conversationId: 'conv-1',
          subAgentId: 'model-resolver-agent',
        }),
      );
    });

    it('should fail clearly when neither modelId nor model tier resolver is configured', async () => {
      const depsWithoutResolver = createMockDeps();
      delete depsWithoutResolver.modelTierResolver;
      const managerWithoutResolver = new SubAgentManager(depsWithoutResolver);
      const config = createTestConfig({ id: 'missing-model-agent' });

      await managerWithoutResolver.spawn('parent-1', 'conv-1', config);
      const result = await managerWithoutResolver.getResult('missing-model-agent', 5000);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('SubAgent model tier "balanced" could not be resolved');
      expect(depsWithoutResolver.createAgent).not.toHaveBeenCalled();
    });
  });

  describe('spawnBatch', () => {
    it('should spawn multiple SubAgents', async () => {
      const configs = [
        createTestConfig({ id: 'batch-1' }),
        createTestConfig({ id: 'batch-2' }),
        createTestConfig({ id: 'batch-3' }),
      ];

      const ids = await manager.spawnBatch('parent-1', 'conv-1', configs);

      expect(ids).toHaveLength(3);
      expect(ids).toContain('batch-1');
      expect(ids).toContain('batch-2');
      expect(ids).toContain('batch-3');
    });
  });

  describe('getStatus', () => {
    it('should return undefined for non-existent SubAgent', () => {
      expect(manager.getStatus('non-existent')).toBeUndefined();
    });

    it('should return correct status', async () => {
      const config = createTestConfig({ id: 'status-test' });
      await manager.spawn('parent-1', 'conv-1', config);

      // Status should be defined (pending, running, or completed depending on timing)
      const status = manager.getStatus('status-test');
      expect(status).toBeDefined();
      expect(['pending', 'running', 'completed']).toContain(status);
    });
  });

  describe('getResult', () => {
    it('should return result when SubAgent completes', async () => {
      const config = createTestConfig({ id: 'result-test' });
      await manager.spawn('parent-1', 'conv-1', config);

      const result = await manager.getResult('result-test', 5000);

      expect(result.id).toBe('result-test');
      expect(result.status).toBe('completed');
      expect(result.response).toBe('Task completed successfully');
    });

    it('should throw for non-existent SubAgent', async () => {
      await expect(manager.getResult('non-existent')).rejects.toThrow('SubAgent not found');
    });
  });

  describe('getResults', () => {
    it('should return results for multiple SubAgents', async () => {
      await manager.spawn('parent-1', 'conv-1', createTestConfig({ id: 'multi-1' }));
      await manager.spawn('parent-1', 'conv-1', createTestConfig({ id: 'multi-2' }));

      const results = await manager.getResults(['multi-1', 'multi-2'], 5000);

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id)).toContain('multi-1');
      expect(results.map((r) => r.id)).toContain('multi-2');
    });
  });

  describe('cancel', () => {
    it('should cancel a running SubAgent', async () => {
      // Create a long-running mock
      const slowExecutor = {
        execute: vi
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 10000))),
        abort: vi.fn(),
        getState: vi.fn().mockReturnValue('running'),
      };
      (deps.createAgent as ReturnType<typeof vi.fn>).mockReturnValue(slowExecutor);

      const config = createTestConfig({ id: 'cancel-test' });
      await manager.spawn('parent-1', 'conv-1', config);

      // Wait for it to start running
      await new Promise((r) => setTimeout(r, 50));

      manager.cancel('cancel-test');

      expect(slowExecutor.abort).toHaveBeenCalled();
    });
  });

  describe('cancelAll', () => {
    it('should cancel all SubAgents for a parent', async () => {
      const slowExecutor = {
        execute: vi
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 10000))),
        abort: vi.fn(),
        getState: vi.fn().mockReturnValue('running'),
      };
      (deps.createAgent as ReturnType<typeof vi.fn>).mockReturnValue(slowExecutor);

      await manager.spawn('parent-1', 'conv-1', createTestConfig({ id: 'cancel-all-1' }));
      await manager.spawn('parent-1', 'conv-1', createTestConfig({ id: 'cancel-all-2' }));

      await new Promise((r) => setTimeout(r, 50));

      manager.cancelAll('parent-1');

      // Both should have abort called
      expect(slowExecutor.abort).toHaveBeenCalledTimes(2);
    });
  });

  describe('listByParent', () => {
    it('should list SubAgents for a specific parent', async () => {
      await manager.spawn('parent-1', 'conv-1', createTestConfig({ id: 'list-1' }));
      await manager.spawn('parent-1', 'conv-1', createTestConfig({ id: 'list-2' }));
      await manager.spawn('parent-2', 'conv-1', createTestConfig({ id: 'list-3' }));

      const parent1Agents = manager.listByParent('parent-1');
      const parent2Agents = manager.listByParent('parent-2');

      expect(parent1Agents).toHaveLength(2);
      expect(parent2Agents).toHaveLength(1);
    });
  });

  describe('cleanup', () => {
    it('should remove completed SubAgents', async () => {
      await manager.spawn('parent-1', 'conv-1', createTestConfig({ id: 'cleanup-1' }));

      // Wait for completion
      await manager.getResult('cleanup-1', 5000);

      manager.cleanup('parent-1');

      expect(manager.listByParent('parent-1')).toHaveLength(0);
    });
  });

  describe('onEvent', () => {
    it('should unsubscribe when returned function is called', async () => {
      const events: SubAgentEvent[] = [];
      const unsubscribe = manager.onEvent((event) => events.push(event));

      await manager.spawn('parent-1', 'conv-1', createTestConfig({ id: 'event-1' }));
      await new Promise((r) => setTimeout(r, 10));

      const countBefore = events.length;

      unsubscribe();

      await manager.spawn('parent-1', 'conv-1', createTestConfig({ id: 'event-2' }));
      await new Promise((r) => setTimeout(r, 10));

      // Should not receive new events after unsubscribe
      expect(events.length).toBe(countBefore);
    });
  });
});

describe('SPECIALIZED_PRESETS', () => {
  it('should have all expected preset types', () => {
    expect(SPECIALIZED_PRESETS['code-search']).toBeDefined();
    expect(SPECIALIZED_PRESETS['file-explorer']).toBeDefined();
    expect(SPECIALIZED_PRESETS['test-runner']).toBeDefined();
    expect(SPECIALIZED_PRESETS['document-writer']).toBeDefined();
    expect(SPECIALIZED_PRESETS.general).toBeDefined();
  });

  it('should have valid configurations', () => {
    for (const [type, preset] of Object.entries(SPECIALIZED_PRESETS)) {
      expect(preset.description).toBeTruthy();
      expect(preset.systemPrompt).toBeTruthy();
      expect(Array.isArray(preset.allowedTools)).toBe(true);
      expect(['fast', 'balanced', 'powerful']).toContain(preset.defaultModelTier);
      expect(preset.defaultMaxIterations).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Skill & ToolSkill Injection Tests
// =============================================================================

describe('SubAgentManager - Skill Injection', () => {
  let manager: SubAgentManager;
  let deps: SubAgentManagerDeps;

  beforeEach(() => {
    deps = createMockDeps();

    // Create mock registry
    const mockRegistry = {
      registerSkill: vi.fn(),
      unregisterSkill: vi.fn(),
      getSkill: vi.fn().mockImplementation((name: string) => {
        if (name === 'test-skill') {
          return {
            name: 'test-skill',
            description: 'A test skill',
            content: 'This is the test skill content.\n\nFollow these guidelines...',
            source: 'project' as const,
            enabled: true,
          };
        }
        if (name === 'disabled-skill') {
          return {
            name: 'disabled-skill',
            description: 'A disabled skill',
            content: 'This should not be injected',
            source: 'project' as const,
            enabled: false,
          };
        }
        return undefined;
      }),
      listSkills: vi.fn().mockReturnValue([]),
      listAllSkills: vi.fn().mockReturnValue([]),
      registerCommand: vi.fn(),
      unregisterCommand: vi.fn(),
      getCommand: vi.fn(),
      listCommands: vi.fn().mockReturnValue([]),
      hasCommand: vi.fn().mockReturnValue(false),
      searchSkills: vi.fn().mockReturnValue([]),
      skillCount: 0,
      commandCount: 0,
      clear: vi.fn(),
    };

    // Add mock skill service with registry
    deps.skillService = {
      registry: mockRegistry,
    };

    manager = new SubAgentManager(deps);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should inject skill content into system prompt', async () => {
    const config = createTestConfig({
      id: 'skill-inject-test',
      skills: ['test-skill'],
    });

    await manager.spawn('parent-1', 'conv-1', config);

    // Wait for execution
    await manager.getResult('skill-inject-test', 5000);

    expect(deps.createAgent).toHaveBeenCalled();
    const agentConfig = (deps.createAgent as ReturnType<typeof vi.fn>).mock.calls[0]![0];

    // System prompt should contain skill content
    expect(agentConfig.systemPrompt).toContain('# Injected Skills');
    expect(agentConfig.systemPrompt).toContain('## Skill: test-skill');
    expect(agentConfig.systemPrompt).toContain('This is the test skill content');
  });

  it('should not inject disabled skills', async () => {
    const config = createTestConfig({
      id: 'disabled-skill-test',
      skills: ['disabled-skill'],
    });

    await manager.spawn('parent-1', 'conv-1', config);
    await manager.getResult('disabled-skill-test', 5000);

    const agentConfig = (deps.createAgent as ReturnType<typeof vi.fn>).mock.calls[0]![0];

    // Should not contain disabled skill content
    expect(agentConfig.systemPrompt).not.toContain('This should not be injected');
  });

  it('should not inject non-existent skills', async () => {
    const config = createTestConfig({
      id: 'nonexistent-skill-test',
      skills: ['nonexistent-skill'],
    });

    await manager.spawn('parent-1', 'conv-1', config);
    await manager.getResult('nonexistent-skill-test', 5000);

    const agentConfig = (deps.createAgent as ReturnType<typeof vi.fn>).mock.calls[0]![0];

    // Should not have injected skills section if no valid skills
    expect(agentConfig.systemPrompt).not.toContain('# Injected Skills');
  });

  it('should inject multiple skills', async () => {
    // Add another skill
    (deps.skillService!.registry.getSkill as ReturnType<typeof vi.fn>).mockImplementation(
      (name: string) => {
        if (name === 'skill-a') {
          return {
            name: 'skill-a',
            description: 'Skill A',
            content: 'Content of skill A',
            source: 'project' as const,
            enabled: true,
          };
        }
        if (name === 'skill-b') {
          return {
            name: 'skill-b',
            description: 'Skill B',
            content: 'Content of skill B',
            source: 'project' as const,
            enabled: true,
          };
        }
        return undefined;
      },
    );

    const config = createTestConfig({
      id: 'multi-skill-test',
      skills: ['skill-a', 'skill-b'],
    });

    await manager.spawn('parent-1', 'conv-1', config);
    await manager.getResult('multi-skill-test', 5000);

    const agentConfig = (deps.createAgent as ReturnType<typeof vi.fn>).mock.calls[0]![0];

    expect(agentConfig.systemPrompt).toContain('## Skill: skill-a');
    expect(agentConfig.systemPrompt).toContain('Content of skill A');
    expect(agentConfig.systemPrompt).toContain('## Skill: skill-b');
    expect(agentConfig.systemPrompt).toContain('Content of skill B');
  });
});

describe('SubAgentManager - ToolSkill Injection', () => {
  let manager: SubAgentManager;
  let deps: SubAgentManagerDeps;

  beforeEach(() => {
    deps = createMockDeps();

    // Add mock toolskill registry
    deps.toolSkillRegistry = {
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      listEnabled: vi.fn().mockReturnValue([]),
      match: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockImplementation((activeSkills: string[]) => {
        const toolMap: Record<string, string[]> = {
          'git-operations': ['git_status', 'git_commit', 'git_push'],
          'file-editing': ['write_file', 'edit_file'],
        };
        const tools: string[] = [];
        for (const skill of activeSkills) {
          if (toolMap[skill]) {
            tools.push(...toolMap[skill]);
          }
        }
        return tools;
      }),
      getDefaultTools: vi.fn().mockReturnValue([]),
      getGroupsForTool: vi.fn().mockReturnValue([]),
    };

    // Update tool registry to include more tools
    (deps.toolRegistry.toToolDefinitions as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        type: 'function',
        function: { name: 'read_file', description: 'Read file', parameters: {} },
      },
      {
        type: 'function',
        function: { name: 'write_file', description: 'Write file', parameters: {} },
      },
      {
        type: 'function',
        function: { name: 'edit_file', description: 'Edit file', parameters: {} },
      },
      {
        type: 'function',
        function: { name: 'grep', description: 'Search content', parameters: {} },
      },
      {
        type: 'function',
        function: { name: 'git_status', description: 'Git status', parameters: {} },
      },
      {
        type: 'function',
        function: { name: 'git_commit', description: 'Git commit', parameters: {} },
      },
      { type: 'function', function: { name: 'git_push', description: 'Git push', parameters: {} } },
    ]);

    manager = new SubAgentManager(deps);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should add tools from ToolSkills to allowed tools', async () => {
    const config = createTestConfig({
      id: 'toolskill-test',
      type: 'code-search', // Has preset allowedTools: ['grep', 'glob', 'read_file', 'list_directory']
      toolSkills: ['git-operations'],
    });

    await manager.spawn('parent-1', 'conv-1', config);
    await manager.getResult('toolskill-test', 5000);

    const agentConfig = (deps.createAgent as ReturnType<typeof vi.fn>).mock.calls[0]![0];

    // Should include both preset tools and toolskill tools
    const toolNames = agentConfig.tools.map((t: { function: { name: string } }) => t.function.name);

    // From toolskill
    expect(toolNames).toContain('git_status');
    expect(toolNames).toContain('git_commit');
    expect(toolNames).toContain('git_push');
  });

  it('should merge tools from multiple ToolSkills', async () => {
    const config = createTestConfig({
      id: 'multi-toolskill-test',
      type: 'general', // Empty allowedTools means all tools
      toolSkills: ['git-operations', 'file-editing'],
    });

    await manager.spawn('parent-1', 'conv-1', config);
    await manager.getResult('multi-toolskill-test', 5000);

    expect(deps.toolSkillRegistry!.getActiveTools).toHaveBeenCalledWith([
      'git-operations',
      'file-editing',
    ]);
  });

  it('should work without toolSkillRegistry', async () => {
    // Remove toolskill registry
    delete deps.toolSkillRegistry;
    manager = new SubAgentManager(deps);

    const config = createTestConfig({
      id: 'no-registry-test',
      toolSkills: ['git-operations'], // Should be ignored
    });

    await manager.spawn('parent-1', 'conv-1', config);
    const result = await manager.getResult('no-registry-test', 5000);

    // Should complete without error
    expect(result.status).toBe('completed');
  });
});
