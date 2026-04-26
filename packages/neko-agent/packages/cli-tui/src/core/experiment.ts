import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  AgentSession,
  ExperimentRunner,
  createStandardAblationSuite,
  createGroupAblationSuite,
  createParameterAblationSuite,
  formatComparisonMarkdown,
  MCPManager,
  createAllMCPTools,
  createSkillService,
  createNodeSkillLoader,
  ToolRegistry,
  buildAgentSessionConfigWithRuntime,
  createSystemPromptBuilder,
  getDefaultPersonalPath,
  createCoreTools,
  createFileProjectMemoryManager,
  createConversationId,
  type AgentSessionConfig,
  type ExperimentConfig,
  type ExperimentIsolationMode,
  type ExperimentResult,
  type ExperimentVariant,
  type IExperimentSession,
  type ISessionFactory,
} from '@neko/agent';
import type { IService } from '@neko/shared';
import type { IRuntimeTaskManager } from '@neko/agent';
import type { CLIConfig } from './types';
import { createCLIPlatform, createCLITaskManager } from './platform-bootstrap';
import { createCliAgentRuntime } from './runtime-bootstrap';
import { loadSkillArtifactsAsSkills } from './skill-artifacts';

export type ExperimentSuiteName = 'standard' | 'group' | 'parameter';

export interface CLIExperimentOptions {
  config: CLIConfig;
  prompt: string;
  suite: ExperimentSuiteName;
  repetitions?: number;
  timeout?: number;
  outputDir?: string;
  isolation?: ExperimentIsolationMode;
  service?: IService;
  taskManager?: IRuntimeTaskManager;
}

export interface CLIExperimentRunResult {
  result: ExperimentResult;
  outputDir: string;
}

class AgentSessionFactory implements ISessionFactory {
  create(config: AgentSessionConfig): IExperimentSession {
    return new AgentSession(config);
  }
}

export async function runExperiment(
  options: CLIExperimentOptions,
): Promise<CLIExperimentRunResult> {
  const outputRoot = options.outputDir ?? path.join(options.config.workDir, '.neko', 'experiments');
  const outputDir = createCliExperimentOutputDir(outputRoot, options.suite);
  const baseSessionConfig = await buildCliExperimentSessionConfig(options);
  const variants = createSuite(options.suite).map((variant) => ({
    ...variant,
    ...(options.repetitions ? { repetitions: options.repetitions } : {}),
  }));

  const experimentConfig: ExperimentConfig = {
    name: `cli-${options.suite}-ablation`,
    taskPrompt: options.prompt,
    taskContext: { workspaceRoot: options.config.workDir },
    variants,
    baseSessionConfig,
    outputDir,
    outputWriter: createNodeExperimentOutputWriter(),
    ...(options.timeout ? { variantTimeoutMs: options.timeout } : {}),
    ...(options.isolation ? { isolation: options.isolation } : {}),
  };

  const runner = new ExperimentRunner(experimentConfig, new AgentSessionFactory());
  const result = await runner.runAll();
  return { result, outputDir };
}

function createCliExperimentOutputDir(outputRoot: string, suite: ExperimentSuiteName): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(outputRoot, `${timestamp}-${suite}`);
}

export function formatExperimentReport(result: ExperimentResult): string {
  const outputFiles = result.outputFiles?.map((file) => `- ${file.kind}: ${file.path}`).join('\n');
  return [
    `# ${result.name}`,
    '',
    `Started: ${result.startedAt}`,
    `Completed: ${result.completedAt}`,
    '',
    formatComparisonMarkdown(result.comparison),
    ...(outputFiles ? ['', '## Output Files', outputFiles] : []),
  ].join('\n');
}

function createSuite(name: ExperimentSuiteName): ExperimentVariant[] {
  switch (name) {
    case 'group':
      return createGroupAblationSuite();
    case 'parameter':
      return createParameterAblationSuite();
    case 'standard':
      return createStandardAblationSuite();
  }
}

function createNodeExperimentOutputWriter() {
  return {
    async writeTextFile(filePath: string, content: string): Promise<void> {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf8');
    },
  };
}

async function buildCliExperimentSessionConfig(
  options: CLIExperimentOptions,
): Promise<AgentSessionConfig> {
  if (options.config.modelNotFound) {
    throw new Error(`Model "${options.config.modelNotFound}" not found in config.`);
  }

  const mcpManager = new MCPManager();
  for (const serverConfig of options.config.mcpServers) {
    mcpManager.register(serverConfig);
  }
  if (options.config.mcpServers.length > 0) {
    await mcpManager.connectAll();
  }

  const toolRegistry = new ToolRegistry();
  toolRegistry.registerMany(await createAllMCPTools(mcpManager));

  const memoryFilePath = path.join(options.config.workDir, '.neko', 'memory.md');
  const projectMemoryManager = createFileProjectMemoryManager(memoryFilePath);
  await projectMemoryManager.load();

  toolRegistry.registerMany(
    createCoreTools({ defaultCwd: options.config.workDir, projectMemoryManager }),
  );

  let skillService: ReturnType<typeof createSkillService> | undefined;
  if (options.config.skillsDir) {
    const skillLoader = createNodeSkillLoader(fs, path);
    skillService = createSkillService();
    const loadedSkills = await loadSkillArtifactsAsSkills(skillLoader, options.config.skillsDir);
    for (const skill of loadedSkills) {
      skillService.registry.registerSkill(skill);
    }
  }

  const taskManager = options.taskManager ?? createCLITaskManager();
  const service =
    options.service ??
    createCLIPlatform({
      workspacePath: options.config.workDir,
      toolRegistry,
      taskManager,
    }).service;

  const promptBuilder = createSystemPromptBuilder({ locale: 'en', mode: 'default' });
  await promptBuilder.loadAgentsFile(options.config.workDir, getDefaultPersonalPath());
  const conversationId = createConversationId(options.config.workDir);

  return buildAgentSessionConfigWithRuntime({
    service,
    toolRegistry,
    systemPrompt: promptBuilder.build(),
    executionMode: 'auto',
    temperature: options.config.temperature,
    maxTokens: options.config.maxTokens,
    modelId: options.config.model,
    conversationId,
    onConfirmTool: async () => true,
    runtime: createCliAgentRuntime({
      workspaceRoot: options.config.workDir,
      taskManager,
      ...(skillService ? { skillService } : {}),
      projectMemoryManager,
    }),
  });
}
