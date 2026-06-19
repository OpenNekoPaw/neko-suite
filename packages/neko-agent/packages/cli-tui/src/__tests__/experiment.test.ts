import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CLIConfig } from '../core/types';

const runAll = vi.fn();
const createStandardAblationSuite = vi.fn(() => [
  makeVariant('baseline'),
  makeVariant('no-compression'),
]);
const createGroupAblationSuite = vi.fn(() => [makeVariant('baseline'), makeVariant('minimal')]);
const createParameterAblationSuite = vi.fn(() => [
  makeVariant('baseline'),
  makeVariant('single-iteration'),
]);
const registerMany = vi.fn();
const registerBuiltinToolGroups = vi.fn();
const buildAgentSessionConfigWithRuntime = vi.fn((config: unknown) => config);
const createCoreTools = vi.fn(() => []);
const createAllMCPTools = vi.fn(async () => []);
const loadAgentsFile = vi.fn(async () => undefined);
const createConversationId = vi.fn(() => 'conversation-id');
const loadProjectMemory = vi.fn(async () => undefined);
const createCLIPlatform = vi.fn(() => ({ service: makeService() }));
const createCLITaskManager = vi.fn(() => ({ id: 'task-manager' }));

vi.mock('@neko/agent/runtime', () => ({
  buildAgentSessionConfigWithRuntime,
  createNodeArtifactStore: vi.fn(() => ({ id: 'artifact-store' })),
}));

vi.mock('@neko/agent', () => ({
  AgentSession: class AgentSession {},
  ExperimentRunner: class ExperimentRunner {
    constructor(
      public readonly config: unknown,
      public readonly factory: unknown,
    ) {}
    runAll = runAll;
  },
  createStandardAblationSuite,
  createGroupAblationSuite,
  createParameterAblationSuite,
  formatComparisonMarkdown: vi.fn(() => '| Variant | Avg Tokens |'),
  MCPManager: class MCPManager {
    register = vi.fn();
    connectAll = vi.fn(async () => undefined);
  },
  createAllMCPTools,
  createTaskManagerIdcTaskProjection: vi.fn(() => ({ id: 'projection' })),
  createSkillService: vi.fn(() => ({ registry: { registerSkill: vi.fn() } })),
  createNodeSkillLoader: vi.fn(() => ({ id: 'skill-loader' })),
  ToolRegistry: class ToolRegistry {
    registerMany = registerMany;
  },
  createSystemPromptBuilder: vi.fn(() => ({
    loadAgentsFile,
    build: vi.fn(() => 'system prompt'),
  })),
  getDefaultPersonalPath: vi.fn(() => '/home/user/.neko/AGENTS.md'),
  createCoreTools,
  createFileProjectMemoryManager: vi.fn(() => ({ load: loadProjectMemory })),
  ToolGroupRegistry: class ToolGroupRegistry {},
  registerBuiltinToolGroups,
  createConversationId,
}));

vi.mock('../core/platform-bootstrap', () => ({
  createCLIPlatform,
  createCLITaskManager,
}));

vi.mock('../core/skill-artifacts', () => ({
  loadSkillArtifactsAsSkills: vi.fn(async () => []),
}));

function makeVariant(name: string) {
  return { name, description: name, toggles: {} };
}

function makeService() {
  return { id: 'service' };
}

function makeConfig(): CLIConfig {
  return {
    provider: 'test',
    providerType: 'openai',
    providerRequiresApiKey: true,
    model: 'test-model',
    mediaModels: [],
    maxTokens: 1024,
    temperature: 0.1,
    verbose: false,
    workDir: '/workspace',
    mcpServers: [],
    skillsDir: undefined,
    outputFormat: 'text',
    thinkingBudget: 0,
  };
}

describe('CLI experiment runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:34:56.789Z'));
    runAll.mockResolvedValue({
      name: 'cli-parameter-ablation',
      startedAt: '2026-04-25T12:34:56.789Z',
      completedAt: '2026-04-25T12:34:57.000Z',
      taskPrompt: 'prompt',
      variants: [],
      comparison: [],
      outputFiles: [{ kind: 'json', path: '/tmp/result.json' }],
    });
  });

  it('uses timestamped output directories and parameter suite variants', async () => {
    const { runExperiment } = await import('../core/experiment');

    const result = await runExperiment({
      config: makeConfig(),
      prompt: 'prompt',
      suite: 'parameter',
      repetitions: 2,
      outputDir: '/tmp/experiments',
      service: makeService() as never,
    });

    expect(result.outputDir).toBe('/tmp/experiments/2026-04-25T12-34-56-789Z-parameter');
    expect(createParameterAblationSuite).toHaveBeenCalledOnce();
    expect(runAll).toHaveBeenCalledOnce();

    const runnerInstance = vi.mocked(runAll).mock.contexts[0] as {
      config: { variants: Array<{ repetitions?: number }> };
    };
    expect(runnerInstance.config.variants.map((variant) => variant.repetitions)).toEqual([2, 2]);
  });

  it('builds a CLI session config without creating a platform when service is provided', async () => {
    const { runExperiment } = await import('../core/experiment');

    await runExperiment({
      config: makeConfig(),
      prompt: 'prompt',
      suite: 'standard',
      service: makeService() as never,
    });

    expect(createCLIPlatform).not.toHaveBeenCalled();
    expect(loadProjectMemory).toHaveBeenCalledOnce();
    expect(createCoreTools).toHaveBeenCalledWith(
      expect.objectContaining({ defaultCwd: '/workspace' }),
    );
    expect(buildAgentSessionConfigWithRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        service: { id: 'service' },
        systemPrompt: 'system prompt',
        executionMode: 'auto',
        modelId: 'test-model',
        conversationId: 'conversation-id',
      }),
    );
  });

  it('formats report with output files', async () => {
    const { formatExperimentReport } = await import('../core/experiment');

    const report = formatExperimentReport({
      name: 'experiment',
      startedAt: 'start',
      completedAt: 'end',
      taskPrompt: 'prompt',
      variants: [],
      comparison: [],
      outputFiles: [{ kind: 'markdown', path: '/tmp/comparison.md' }],
    });

    expect(report).toContain('# experiment');
    expect(report).toContain('| Variant | Avg Tokens |');
    expect(report).toContain('- markdown: /tmp/comparison.md');
  });
});
