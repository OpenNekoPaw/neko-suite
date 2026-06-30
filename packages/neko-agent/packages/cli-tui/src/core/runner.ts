/**
 * Agent Runner
 *
 * Core execution logic for running the agent from CLI.
 * Uses AgentSession for unified session management.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { AgentResult, AgentStep, ExecutorHooks, AgentEvent } from '@neko/agent';
import {
  MCPManager,
  createAllMCPTools,
  createPlanModeIdcMetadata,
  createSkillService,
  createNodeSkillLoader,
  ToolRegistry,
  AgentSession,
  SystemPromptBuilder,
  createSystemPromptBuilder,
  getDefaultPersonalPath,
  createInputProcessor,
  createCoreTools,
  createFileProjectMemoryManager,
  mergeIdcExecutionMetadata,
  type InputProcessor,
  type ConversationRecord,
  createFileConversationStorage,
  createConversationId,
  type FileConversationStorage,
  type SkillLifecycleRuntime,
  resolveSlashCommandCatalogEntry,
} from '@neko/agent';
import { createAgentSessionWithRuntime } from '@neko/agent/runtime';
import { toSharedService, type Platform } from '@neko/platform';

type ExecutionMode = 'plan' | 'ask' | 'auto';
import { resolveStorageLayout, type IService } from '@neko/shared';
import type { SkillService, IRuntimeTaskManager } from '@neko/agent';
import type { CLIConfig, RunOptions, CLIResult } from './types';
import { theme } from './theme';
import { formatToolCall } from './formatter';
import {
  handleSkillInvocation,
  handleSlashCommand,
  isSkillInvocation,
  isSlashCommand,
  parseSlashCommand,
  type SlashCommandContext,
} from './slash-commands';
import { getProviderModels } from './config';
import { createCLIPlatform, createCLITaskManager } from './platform-bootstrap';
import { createCliAgentRuntime } from './runtime-bootstrap';
import { loadSkillArtifactsAsSkills } from './skill-artifacts';
import {
  activateCliDomainSkill,
  type CliSkillLifecycleSessionBridge,
  createCliSkillLifecycleRuntime,
  wireCliSkillLifecycleSession,
} from './skill-lifecycle-session';

interface CliLifecycleActivationHint {
  readonly skillName: string;
  readonly args?: string;
}

/**
 * Agent runner options
 */
export interface AgentRunnerOptions {
  config: CLIConfig;
  runOptions: RunOptions;
  /** Optional Platform Service for advanced LLM features */
  service?: IService;
  /** Optional shared task plane provided by the host bootstrap */
  taskManager?: IRuntimeTaskManager;
  hooks?: Partial<ExecutorHooks>;
  onOutput?: (text: string) => void;
  onToolCall?: (name: string, args: unknown) => void;
  onThinking?: (thought: string) => void;
  /** Execution mode (plan/ask/auto) */
  executionMode?: ExecutionMode;
}

/**
 * Run the agent
 */
export async function runAgent(options: AgentRunnerOptions): Promise<CLIResult> {
  const {
    config,
    runOptions,
    service,
    taskManager: providedTaskManager,
    hooks,
    onOutput,
    onToolCall,
    onThinking,
    executionMode = 'auto',
  } = options;
  const startTime = Date.now();

  try {
    // Block if configured model was not found — do not waste API calls
    if (config.modelNotFound) {
      const models = getProviderModels(config.provider, config.workDir);
      const available = models.length > 0 ? ` Available: ${models.join(', ')}` : '';
      return {
        success: false,
        error: `Model "${config.modelNotFound}" not found in config.${available} Use --model to specify a valid model.`,
        duration: Date.now() - startTime,
      };
    }

    // Initialize MCP Manager
    const mcpManager = new MCPManager();

    // Register MCP servers from config
    for (const serverConfig of config.mcpServers) {
      mcpManager.register(serverConfig);
    }

    // Connect to MCP servers
    if (config.mcpServers.length > 0) {
      await mcpManager.connectAll();
    }

    // Initialize Tool Registry
    const toolRegistry = new ToolRegistry();

    // Register MCP tools
    const mcpTools = await createAllMCPTools(mcpManager);
    toolRegistry.registerMany(mcpTools);

    // Initialize project memory (cross-session fact persistence)
    const memoryFilePath = path.join(config.workDir, '.neko', 'memory.md');
    const projectMemoryManager = createFileProjectMemoryManager(memoryFilePath);
    await projectMemoryManager.load();

    // Register core file/system tools
    const coreTools = createCoreTools({ defaultCwd: config.workDir, projectMemoryManager });
    toolRegistry.registerMany(coreTools);

    // Initialize Skill Service
    let skillService: ReturnType<typeof createSkillService> | undefined;
    let skillLifecycleRuntime: SkillLifecycleRuntime | undefined;
    if (config.skillsDir) {
      const skillLoader = createNodeSkillLoader(fs, path);
      skillService = createSkillService();
      const loadedSkills = await loadSkillArtifactsAsSkills(skillLoader, config.skillsDir);
      for (const skill of loadedSkills) {
        skillService.registry.registerSkill(skill);
      }
      skillLifecycleRuntime = createCliSkillLifecycleRuntime(skillService);
    }

    // Create LLM service via Platform
    let llmService: IService;
    let platform: Platform | undefined;
    const taskManager = providedTaskManager ?? createCLITaskManager();

    if (service) {
      llmService = service;
    } else {
      const cliPlatform = createCLIPlatform({
        workspacePath: config.workDir,
        toolRegistry,
        taskManager,
      });
      platform = cliPlatform.platform;
      llmService = cliPlatform.service;
    }

    // Build system prompt
    const promptBuilder = createSystemPromptBuilder({
      locale: 'en',
      mode: executionMode === 'plan' ? 'plan' : 'default',
    });
    await promptBuilder.loadAgentsFile(config.workDir, getDefaultPersonalPath());
    const systemPrompt = promptBuilder.build();

    // Create agent session
    const conversationId = createConversationId(config.workDir);
    const session = createAgentSessionWithRuntime({
      service: llmService,
      toolRegistry,
      systemPrompt,
      executionMode,
      maxIterations: runOptions.maxIterations,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      modelId: config.model,
      hooks: hooks ? [hooks as ExecutorHooks] : undefined,
      runtime: createCliAgentRuntime({
        workspaceRoot: config.workDir,
        taskManager,
        ...(skillService ? { skillService } : {}),
        ...(skillLifecycleRuntime ? { skillLifecycleRuntime } : {}),
        projectMemoryManager,
      }),
      conversationId,
      onConfirmTool: async (_request) => {
        // In non-interactive mode, auto-approve all tools
        if (!runOptions.interactive) {
          return true;
        }
        // In interactive mode, this would be handled by the UI
        // For CLI, we auto-approve for now
        return true;
      },
    });

    // Wire skill provider to meta tools
    let skillLifecycleBridge: CliSkillLifecycleSessionBridge | undefined;
    if (skillService && skillLifecycleRuntime) {
      skillLifecycleBridge = wireCliSkillLifecycleSession({
        session,
        skillService,
        conversationId,
        lifecycleRuntime: skillLifecycleRuntime,
      });
    }

    // Create input processor for file references
    const inputProcessor = createInputProcessor({
      workspaceRoot: config.workDir,
      maxFileSize: 1024 * 1024, // 1MB
      maxFiles: 20,
      includeLineNumbers: true,
      includeLanguageHints: true,
    });

    const preparedInput = await prepareSingleRunPrompt({
      prompt: runOptions.prompt,
      slashContext: {
        config,
        skillService,
        toolRegistry,
        currentConversationId: conversationId,
      },
      skillLifecycleBridge,
    });
    if (!preparedInput.ok) {
      session.dispose();
      await mcpManager.disconnectAll();
      return {
        success: false,
        error: preparedInput.error,
        duration: Date.now() - startTime,
      };
    }
    if (!preparedInput.prompt) {
      session.dispose();
      await mcpManager.disconnectAll();
      return {
        success: true,
        output: '',
        duration: Date.now() - startTime,
      };
    }

    // Process input for file references
    const processedInput = await inputProcessor.process(preparedInput.prompt);

    // Build final prompt with file contents
    let finalPrompt = processedInput.message;
    if (processedInput.hasFiles) {
      finalPrompt = `${processedInput.message}\n\n## Referenced Files\n\n${processedInput.fileContents}`;
    }

    // Report any file loading errors
    if (processedInput.errors.length > 0) {
      const errorMessages = processedInput.errors
        .map((e) => `- ${e.reference}: ${e.error}`)
        .join('\n');
      finalPrompt += `\n\n## File Loading Errors\n\n${errorMessages}`;
    }

    // Execute and collect events
    let output = '';
    const collector = createEventCollector();

    // Wire timeout via AbortController
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (runOptions.timeout) {
      timeoutId = setTimeout(() => controller.abort(), runOptions.timeout);
    }

    try {
      const executionMetadata = mergeIdcExecutionMetadata(
        session.getExecutionMode() === 'plan' ? createPlanModeIdcMetadata() : undefined,
        preparedInput.executionMetadata,
      );
      for await (const event of session.execute(finalPrompt, {
        workspaceRoot: config.workDir,
        ...(executionMetadata ? { metadata: executionMetadata } : {}),
      })) {
        if (controller.signal.aborted) {
          onOutput?.('\n[Timeout] Execution aborted');
          break;
        }
        handleAgentEvent(
          event,
          {
            onOutput,
            onToolCall,
            onThinking,
            onText: (text) => {
              output += text;
            },
          },
          collector,
        );
        if (event.type === 'tool_result') {
          subscribeToMediaSave(platform, event, config.workDir, (taskId, savedOutputPaths) => {
            onOutput?.(`\n${formatCliMediaSaveSummary(taskId, savedOutputPaths.length)}\n`);
          });
        }
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    // Cleanup
    session.dispose();
    await mcpManager.disconnectAll();

    const result: AgentResult = {
      success: true,
      response: output,
      steps: collector.steps,
      iterations: collector.iterations,
      timing: {
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
      },
    };

    return {
      success: true,
      output,
      agentResult: result,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Event data collector for building AgentResult
 */
interface EventCollector {
  steps: AgentStep[];
  iterations: number;
  totalTokens: number;
}

function createEventCollector(): EventCollector {
  return { steps: [], iterations: 0, totalTokens: 0 };
}

export function formatCliMediaSaveSummary(taskId: string, fileCount: number): string {
  return `[media] Generated ${fileCount} file(s) for task ${taskId}; managed output is tracked by Neko.`;
}

async function prepareSingleRunPrompt(input: {
  readonly prompt: string;
  readonly slashContext: SlashCommandContext;
  readonly skillLifecycleBridge?: CliSkillLifecycleSessionBridge;
}): Promise<
  | {
      readonly ok: true;
      readonly prompt: string;
      readonly executionMetadata?: Record<string, unknown>;
    }
  | { readonly ok: false; readonly error: string }
> {
  const trimmed = input.prompt.trim();
  if (!trimmed) {
    return { ok: true, prompt: '' };
  }

  if (isSkillInvocation(trimmed)) {
    const result = await handleSkillInvocation(trimmed, input.slashContext);
    if (result.error) {
      return { ok: false, error: result.error };
    }
    if (result.lifecycleActivation) {
      const activation = await activateCliLifecycleHint({
        bridge: input.skillLifecycleBridge,
        conversationId: input.slashContext.currentConversationId,
        hint: result.lifecycleActivation,
      });
      if (!activation.ok) {
        return { ok: false, error: activation.message };
      }
    } else {
      return { ok: false, error: 'Skill invocation did not return lifecycle activation' };
    }
    return {
      ok: true,
      prompt: result.agentPrompt ?? '',
      executionMetadata: result.executionOverrides?.metadata,
    };
  }

  if (isSlashCommand(trimmed)) {
    const { command } = parseSlashCommand(trimmed);
    const commandEntry = resolveSlashCommandCatalogEntry(command, {
      surface: 'cli',
      skills: input.slashContext.skillService?.registry.listAllSkills(),
    });
    if (commandEntry?.source !== 'command-artifact') {
      return { ok: true, prompt: input.prompt };
    }

    const result = await handleSlashCommand(trimmed, input.slashContext);
    if (result.error) {
      return { ok: false, error: result.error };
    }
    if (result.lifecycleActivation) {
      const activation = await activateCliLifecycleHint({
        bridge: input.skillLifecycleBridge,
        conversationId: input.slashContext.currentConversationId,
        hint: result.lifecycleActivation,
      });
      if (!activation.ok) {
        return { ok: false, error: activation.message };
      }
    }
    return {
      ok: true,
      prompt: result.agentPrompt ?? (trimmed.startsWith('/run ') ? trimmed.slice(5).trim() : ''),
      executionMetadata: result.executionOverrides?.metadata,
    };
  }

  return { ok: true, prompt: input.prompt };
}

async function activateCliLifecycleHint(input: {
  readonly bridge?: CliSkillLifecycleSessionBridge;
  readonly conversationId?: string;
  readonly hint: CliLifecycleActivationHint;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }> {
  if (!input.bridge || !input.conversationId) {
    return { ok: false, message: 'Skill lifecycle runtime is not initialized' };
  }
  const result = await activateCliDomainSkill({
    lifecycleRuntime: input.bridge.runtime,
    conversationId: input.conversationId,
    skillName: input.hint.skillName,
    ...(input.hint.args !== undefined ? { args: input.hint.args } : {}),
    actor: 'user',
    syncProjection: () => input.bridge!.syncProjection(),
  });
  if (!result.ok) {
    return { ok: false, message: result.message ?? 'Skill activation failed' };
  }
  return { ok: true };
}

/**
 * Subscribe to a background media task and save outputs to local disk when complete.
 * Called on every tool_result event that carries { backgroundMode: true, taskId }.
 * No-op if platform or platform.media is unavailable.
 */
function subscribeToMediaSave(
  platform: Platform | undefined,
  event: AgentEvent,
  workDir: string,
  onSaved?: (taskId: string, savedOutputPaths: string[]) => void,
): void {
  if (!platform?.media) return;

  const resultData = event.toolResult?.data as Record<string, unknown> | undefined;
  if (resultData?.backgroundMode !== true || typeof resultData?.taskId !== 'string') return;

  const taskId = resultData.taskId;
  const outputDir = resolveCliGeneratedOutputDir(workDir);

  const unsubscribe = platform.media.onProgress(taskId, async (task) => {
    if (task.status === 'completed' && task.outputs && task.outputs.length > 0) {
      // No transcodeFile needed for TUI (terminal renders paths, not Electron webview)
      const savedOutputPaths = await platform.media!.saveOutputs(taskId, outputDir);
      if (savedOutputPaths.length > 0) {
        onSaved?.(taskId, savedOutputPaths);
      }
    }

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      unsubscribe();
    }
  });
}

/**
 * Handle agent event
 */
function handleAgentEvent(
  event: AgentEvent,
  handlers: {
    onOutput?: (text: string) => void;
    onToolCall?: (name: string, args: unknown) => void;
    onThinking?: (thought: string) => void;
    onText?: (text: string) => void;
    onTokens?: (tokens: number) => void;
  },
  collector?: EventCollector,
): void {
  const { onOutput, onToolCall, onThinking, onText, onTokens } = handlers;

  switch (event.type) {
    case 'text':
      if (event.content) {
        onOutput?.(event.content);
        onText?.(event.content);
      }
      break;

    case 'text_delta':
      // Streaming text chunk — write incrementally
      if (event.content) {
        onOutput?.(event.content);
      }
      break;

    case 'thinking_content':
      if (event.thinking) {
        onThinking?.(event.thinking);
      }
      break;

    case 'tool_call':
      if (event.toolCall) {
        onToolCall?.(event.toolCall.name, event.toolCall.arguments);
        collector?.steps.push({
          type: 'act',
          content: event.toolCall.name,
          timestamp: Date.now(),
          toolCalls: [
            {
              id: event.toolCall.id,
              name: event.toolCall.name,
              arguments: event.toolCall.arguments,
            },
          ],
        });
      }
      break;

    case 'tool_result':
      if (event.toolResult && collector) {
        collector.steps.push({
          type: 'observe',
          timestamp: Date.now(),
          content: event.toolResult.success
            ? String(event.toolResult.data ?? '')
            : `Error: ${event.toolResult.error ?? 'unknown'}`,
        });
      }
      break;

    case 'iteration':
      if (event.iteration && collector) {
        collector.iterations = event.iteration.current;
      }
      break;

    case 'done':
      if (event.usage) {
        onTokens?.(event.usage.totalTokens);
        if (collector) {
          collector.totalTokens += event.usage.totalTokens;
        }
      }
      break;

    case 'error':
      if (event.error) {
        onOutput?.(`Error: ${event.error.message}`);
      }
      break;
  }
}

/**
 * Extended agent runner options with pre-initialized context
 */
export interface AgentRunnerWithContextOptions extends AgentRunnerOptions {
  /** Pre-initialized tool registry */
  toolRegistry?: ToolRegistry;
  /** Pre-initialized skill service */
  skillService?: SkillService;
  /** Pre-initialized agent session */
  session?: AgentSession;
  /** Pre-initialized input processor */
  inputProcessor?: InputProcessor;
  /** Platform instance for media file saving */
  platform?: Platform;
}

/**
 * Run the agent with pre-initialized context
 * Used by interactive mode to reuse resources across prompts
 */
export async function runAgentWithContext(
  options: AgentRunnerWithContextOptions,
): Promise<CLIResult> {
  const {
    config,
    runOptions,
    session,
    inputProcessor,
    onOutput,
    onToolCall,
    onThinking,
    platform,
  } = options;
  const startTime = Date.now();

  if (!session) {
    // Fall back to regular runAgent if no session provided
    return runAgent(options);
  }

  try {
    // Process input for file references if inputProcessor is provided
    let finalPrompt = runOptions.prompt;
    if (inputProcessor) {
      const processedInput = await inputProcessor.process(runOptions.prompt);
      finalPrompt = processedInput.message;
      if (processedInput.hasFiles) {
        finalPrompt = `${processedInput.message}\n\n## Referenced Files\n\n${processedInput.fileContents}`;
      }
      if (processedInput.errors.length > 0) {
        const errorMessages = processedInput.errors
          .map((e) => `- ${e.reference}: ${e.error}`)
          .join('\n');
        finalPrompt += `\n\n## File Loading Errors\n\n${errorMessages}`;
      }
    }

    // Execute and collect events
    let output = '';
    const collector = createEventCollector();
    const executionMetadata =
      session.getExecutionMode() === 'plan' ? createPlanModeIdcMetadata() : undefined;

    for await (const event of session.execute(finalPrompt, {
      workspaceRoot: config.workDir,
      ...(executionMetadata ? { metadata: executionMetadata } : {}),
    })) {
      handleAgentEvent(
        event,
        {
          onOutput,
          onToolCall,
          onThinking,
          onText: (text) => {
            output += text;
          },
        },
        collector,
      );
      if (event.type === 'tool_result') {
        subscribeToMediaSave(platform, event, config.workDir, (taskId, savedOutputPaths) => {
          onOutput?.(`\n${formatCliMediaSaveSummary(taskId, savedOutputPaths.length)}\n`);
        });
      }
    }

    const result: AgentResult = {
      success: true,
      response: output,
      steps: collector.steps,
      iterations: collector.iterations,
      timing: {
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
      },
    };

    return {
      success: true,
      output,
      agentResult: result,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

function resolveCliGeneratedOutputDir(workDir: string): string {
  return resolveStorageLayout(workDir, workDir).project.local.cache.generated;
}

/**
 * Interactive session state
 */
interface InteractiveSessionState {
  mcpManager: MCPManager;
  toolRegistry: ToolRegistry;
  skillService?: SkillService;
  skillLifecycleBridge?: CliSkillLifecycleSessionBridge;
  session: AgentSession;
  promptBuilder: SystemPromptBuilder;
  inputProcessor: InputProcessor;
  config: CLIConfig;
  /** Rebuild LLM service and update session after config change */
  rebuildService: (newConfig: CLIConfig, service?: IService) => void;
  /** Platform instance (available when not using injected service) */
  platform?: Platform;
  /** Conversation persistence */
  conversationStorage: FileConversationStorage;
  conversationId: string;
  conversationTitle: string;
  conversationCreatedAt: number;
  /** Media model overrides set via /media command */
  mediaModelOverrides: {
    image?: string;
    video?: string;
    audio?: string;
  };
}

/**
 * Initialize interactive session
 *
 * @param rl - Shared readline interface (avoids stdin contention)
 * @param resumeId - Optional conversation ID to resume
 */
async function initializeInteractiveSession(
  config: CLIConfig,
  rl: import('node:readline').Interface,
  service?: IService,
  resumeId?: string,
  providedTaskManager?: IRuntimeTaskManager,
): Promise<InteractiveSessionState> {
  // Track tools the user has approved with "always"
  const alwaysAllowedTools = new Set<string>();

  // Initialize MCP Manager
  const mcpManager = new MCPManager();
  const toolRegistry = new ToolRegistry();
  let skillService: SkillService | undefined;
  let skillLifecycleRuntime: SkillLifecycleRuntime | undefined;

  // Register and connect MCP servers
  for (const serverConfig of config.mcpServers) {
    mcpManager.register(serverConfig);
  }
  if (config.mcpServers.length > 0) {
    await mcpManager.connectAll();
  }

  // Register MCP tools
  const mcpTools = await createAllMCPTools(mcpManager);
  toolRegistry.registerMany(mcpTools);

  // Register core file/system tools
  const coreTools = createCoreTools({ defaultCwd: config.workDir });
  toolRegistry.registerMany(coreTools);

  // Initialize Skill Service
  if (config.skillsDir) {
    const skillLoader = createNodeSkillLoader(fs, path);
    skillService = createSkillService();
    const loadedSkills = await loadSkillArtifactsAsSkills(skillLoader, config.skillsDir);
    for (const skill of loadedSkills) {
      skillService.registry.registerSkill(skill);
    }
    skillLifecycleRuntime = createCliSkillLifecycleRuntime(skillService);
  }

  // Create LLM service via Platform
  let platform: Platform | undefined;
  let llmService: IService;
  const taskManager = providedTaskManager ?? createCLITaskManager();
  if (service) {
    llmService = service;
  } else {
    const cliPlatform = createCLIPlatform({
      workspacePath: config.workDir,
      toolRegistry,
      taskManager,
    });
    platform = cliPlatform.platform;
    llmService = cliPlatform.service;
  }

  // Build system prompt
  const promptBuilder = createSystemPromptBuilder({ locale: 'en' });
  await promptBuilder.loadAgentsFile(config.workDir, getDefaultPersonalPath());
  const systemPrompt = promptBuilder.build();

  // Shared resume-layer storage + conversation identity
  const conversationStorage = createFileConversationStorage(config.workDir);
  let conversationCreatedAt = Date.now();
  let conversationId: string = createConversationId(config.workDir);
  let conversationTitle = '';
  let resumeRecord: ConversationRecord | undefined;

  // Resolve the target conversation before creating the session so JournalWriter
  // lands in the same conversation namespace used by resume.
  if (resumeId) {
    resumeRecord = await conversationStorage.load(resumeId).catch(() => undefined);
    if (resumeRecord) {
      conversationId = resumeRecord.id;
      conversationTitle = resumeRecord.title;
      conversationCreatedAt = resumeRecord.createdAt;
    } else {
      console.log(theme.warning(`Conversation "${resumeId}" not found — starting fresh`));
    }
  }

  // Helper: prompt user for tool confirmation using the shared rl
  const askToolConfirmation = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      process.stderr.write(question);
      const onLine = (line: string) => {
        rl.removeListener('line', onLine);
        resolve(line.trim().toLowerCase());
      };
      rl.on('line', onLine);
    });
  };

  // Create agent session
  const session = createAgentSessionWithRuntime({
    service: llmService,
    toolRegistry,
    systemPrompt,
    executionMode: 'auto',
    maxIterations: 50,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    modelId: config.model,
    runtime: createCliAgentRuntime({
      workspaceRoot: config.workDir,
      taskManager,
      ...(skillService ? { skillService } : {}),
      ...(skillLifecycleRuntime ? { skillLifecycleRuntime } : {}),
    }),
    conversationId,
    onConfirmTool: async (request) => {
      // Check always-allowed set
      if (alwaysAllowedTools.has(request.toolCall.name)) {
        return true;
      }

      // Prompt user via shared readline (no stdin contention)
      // Two-tier display: collapsed summary + full args in verbose mode
      process.stdout.write('\n');
      console.log(
        formatToolCall(request.toolCall.name, request.toolCall.arguments, 'pending', true),
      );

      const answer = await askToolConfirmation('Approve? (y)es / (n)o / (a)lways: ');
      if (answer === 'a' || answer === 'always') {
        alwaysAllowedTools.add(request.toolCall.name);
        return true;
      }
      return answer === 'y' || answer === 'yes';
    },
  });

  // Wire skill provider to meta tools
  let skillLifecycleBridge: CliSkillLifecycleSessionBridge | undefined;
  if (skillService && skillLifecycleRuntime) {
    skillLifecycleBridge = wireCliSkillLifecycleSession({
      session,
      skillService,
      conversationId,
      lifecycleRuntime: skillLifecycleRuntime,
    });
  }

  // Create input processor for file references
  const inputProcessor = createInputProcessor({
    workspaceRoot: config.workDir,
    maxFileSize: 1024 * 1024, // 1MB
    maxFiles: 20,
    includeLineNumbers: true,
    includeLanguageHints: true,
  });

  // Rebuild LLM service and update session config after /model or /config changes
  const rebuildService = (newConfig: CLIConfig, svc?: IService) => {
    if (svc) {
      llmService = svc;
    } else if (platform) {
      llmService = toSharedService(platform.createService());
    }
    session.configure({
      service: llmService,
      modelId: newConfig.model,
      temperature: newConfig.temperature,
      maxTokens: newConfig.maxTokens,
    });
  };

  if (resumeRecord) {
    session.loadHistory(resumeRecord.messages, resumeRecord.messageEventIds);
    const resumedMessageCount = resumeRecord.messages.filter(
      (message) => message.role !== 'system',
    ).length;
    console.log(theme.info(`Resumed: "${resumeRecord.title}" (${resumedMessageCount} messages)`));
  }

  return {
    mcpManager,
    toolRegistry,
    skillService,
    skillLifecycleBridge,
    session,
    promptBuilder,
    inputProcessor,
    config,
    rebuildService,
    platform,
    conversationStorage,
    conversationId,
    conversationTitle,
    conversationCreatedAt,
    mediaModelOverrides: {},
  };
}

/**
 * Run agent in interactive mode
 */
export async function runInteractive(
  config: CLIConfig,
  service?: IService,
  _hooks?: Partial<ExecutorHooks>,
  options?: { resumeId?: string; taskManager?: IRuntimeTaskManager },
): Promise<void> {
  const readline = await import('node:readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Mutable config for session
  let sessionConfig = { ...config };
  let state: InteractiveSessionState | null = null;

  try {
    // Initialize session (pass shared rl to avoid stdin contention)
    state = await initializeInteractiveSession(
      sessionConfig,
      rl,
      service,
      options?.resumeId,
      options?.taskManager,
    );

    // Create slash command context
    const slashContext: SlashCommandContext = {
      config: sessionConfig,
      skillService: state.skillService,
      toolRegistry: state.toolRegistry,
      onConfigUpdate: (updates) => {
        sessionConfig = { ...sessionConfig, ...updates };
        slashContext.config = sessionConfig;
        // Sync config changes to session
        state!.rebuildService(sessionConfig, service);
      },
      conversationStorage: state.conversationStorage,
      currentConversationId: state.conversationId,
      onLoadHistory: (messages, messageEventIds) => {
        state!.session.loadHistory(messages, messageEventIds);
      },
      getHistory: () => state!.session.getHistory(),
      onUpdateMediaOverrides: (overrides) => {
        state!.mediaModelOverrides = { ...state!.mediaModelOverrides, ...overrides };
        slashContext.currentMediaOverrides = state!.mediaModelOverrides;
        // Apply to platform config if available
        state!.platform?.config.setRuntimeMediaDefaults(state!.mediaModelOverrides);
      },
      onResetMediaOverrides: () => {
        state!.mediaModelOverrides = {};
        slashContext.currentMediaOverrides = {};
        state!.platform?.config.setRuntimeMediaDefaults({});
      },
      currentMediaOverrides: state.mediaModelOverrides,
      availableMediaModels: sessionConfig.mediaModels,
      defaultMediaModels: sessionConfig.defaultMediaModels,
    };

    console.log(theme.bold('NekoAgent CLI - Interactive Mode'));
    console.log(theme.muted(`Provider: ${sessionConfig.provider}, Model: ${sessionConfig.model}`));
    console.log(theme.muted('Type /help for commands, /exit to quit.\n'));

    const prompt = (): void => {
      rl.question('> ', async (input) => {
        const trimmed = input.trim();
        let executionPrompt = trimmed;
        let executionMetadata: Record<string, unknown> | undefined;

        if (!trimmed) {
          prompt();
          return;
        }

        if (isSkillInvocation(trimmed)) {
          const result = await handleSkillInvocation(trimmed, slashContext);

          if (result.output) {
            console.log(result.output);
          }
          if (result.error) {
            console.error(theme.error(`Error: ${result.error}`));
            prompt();
            return;
          }
          if (result.lifecycleActivation) {
            const activation = await activateCliLifecycleHint({
              bridge: state!.skillLifecycleBridge,
              conversationId: state!.conversationId,
              hint: result.lifecycleActivation,
            });
            if (!activation.ok) {
              console.error(theme.error(`Error: ${activation.message}`));
              prompt();
              return;
            }
          } else {
            console.error(
              theme.error('Error: Skill invocation did not return lifecycle activation'),
            );
            prompt();
            return;
          }

          if (result.agentPrompt) {
            executionPrompt = result.agentPrompt;
            executionMetadata = mergeIdcExecutionMetadata(
              state!.session.getExecutionMode() === 'plan'
                ? createPlanModeIdcMetadata()
                : undefined,
              result.executionOverrides?.metadata,
            );
          } else {
            console.log('');
            prompt();
            return;
          }
        }

        // Handle slash commands
        if (isSlashCommand(trimmed)) {
          // Handle special commands
          if (trimmed === '/plan') {
            state!.promptBuilder.setMode('plan');
            state!.session.setExecutionMode('plan');
            console.log(theme.info('Switched to plan mode'));
            prompt();
            return;
          }

          if (trimmed === '/auto') {
            state!.promptBuilder.setMode('default');
            state!.session.setExecutionMode('auto');
            console.log(theme.info('Switched to auto mode'));
            prompt();
            return;
          }

          if (trimmed === '/ask') {
            state!.promptBuilder.setMode('default');
            state!.session.setExecutionMode('ask');
            console.log(theme.info('Switched to ask mode'));
            prompt();
            return;
          }

          // Handle /model command
          if (trimmed.startsWith('/model')) {
            const newModel = trimmed.slice(6).trim();
            if (!newModel) {
              // List available models from Platform ConfigManager
              const models = getProviderModels(sessionConfig.provider, sessionConfig.workDir);
              console.log(`\n${theme.muted('Current:')} ${sessionConfig.model}`);
              if (models.length > 0) {
                console.log(theme.muted(`Available (${sessionConfig.provider}):`));
                for (const m of models) {
                  const marker = m === sessionConfig.model ? theme.success('* ') : '  ';
                  console.log(`  ${marker}${m}`);
                }
              }
            } else {
              sessionConfig = { ...sessionConfig, model: newModel };
              slashContext.config = sessionConfig;
              // Rebuild LLM service so the model change takes effect
              state!.rebuildService(sessionConfig, service);
              console.log(theme.info(`Model switched to: ${newModel}`));
            }
            prompt();
            return;
          }

          if (trimmed === '/clear') {
            state!.session.clearHistory();
            console.log(theme.info('Conversation history cleared'));
            prompt();
            return;
          }

          if (trimmed === '/compact') {
            const result = await state!.session.compressContext();
            console.log(
              theme.info(
                `Context compressed: ${result.originalTokens} -> ${result.compressedTokens} tokens (${(result.ratio * 100).toFixed(1)}%)`,
              ),
            );
            prompt();
            return;
          }

          const result = await handleSlashCommand(trimmed, slashContext);

          if (result.output) {
            console.log(result.output);
          }
          if (result.error) {
            console.error(theme.error(`Error: ${result.error}`));
          }

          if (result.lifecycleActivation) {
            const activation = await activateCliLifecycleHint({
              bridge: state!.skillLifecycleBridge,
              conversationId: state!.conversationId,
              hint: result.lifecycleActivation,
            });
            if (!activation.ok) {
              console.error(theme.error(`Error: ${activation.message}`));
              prompt();
              return;
            }
          }

          if (!result.continueExecution) {
            state!.session.dispose();
            await state!.mcpManager.disconnectAll();
            rl.close();
            return;
          }

          if (result.agentPrompt) {
            executionPrompt = result.agentPrompt;
            executionMetadata = mergeIdcExecutionMetadata(
              state!.session.getExecutionMode() === 'plan'
                ? createPlanModeIdcMetadata()
                : undefined,
              result.executionOverrides?.metadata,
            );
          }

          // If the slash command was handled and doesn't need agent execution
          if (result.handled && !trimmed.startsWith('/run ') && !result.agentPrompt) {
            console.log('');
            prompt();
            return;
          }
        }

        // Run agent for non-slash commands or /run commands
        const agentPrompt = trimmed.startsWith('/run ') ? trimmed.slice(5).trim() : executionPrompt;

        if (!agentPrompt) {
          prompt();
          return;
        }

        // Process input for file references
        const processedInput = await state!.inputProcessor.process(agentPrompt);

        // Build final prompt with file contents
        let finalPrompt = processedInput.message;
        if (processedInput.hasFiles) {
          finalPrompt = `${processedInput.message}\n\n## Referenced Files\n\n${processedInput.fileContents}`;
        }

        // Report any file loading errors
        if (processedInput.errors.length > 0) {
          const errorMessages = processedInput.errors
            .map((e) => `- ${e.reference}: ${e.error}`)
            .join('\n');
          console.log(
            theme.warning(`\n[Warning] Some files could not be loaded:\n${errorMessages}\n`),
          );
        }

        // Execute via session
        try {
          if (!executionMetadata) {
            executionMetadata =
              state!.session.getExecutionMode() === 'plan'
                ? createPlanModeIdcMetadata()
                : undefined;
          }

          for await (const event of state!.session.execute(finalPrompt, {
            workspaceRoot: sessionConfig.workDir,
            ...(executionMetadata ? { metadata: executionMetadata } : {}),
          })) {
            handleAgentEvent(event, {
              onOutput: (text) => process.stdout.write(text),
              onToolCall: (name, args) => {
                const argsRecord = args as Record<string, unknown>;
                process.stdout.write('\n');
                console.log(formatToolCall(name, argsRecord, 'pending'));
              },
              onThinking: (thought) => console.log(theme.muted(`\n[Thinking] ${thought}`)),
            });
            if (event.type === 'tool_result') {
              subscribeToMediaSave(
                state!.platform,
                event,
                sessionConfig.workDir,
                (taskId, paths) => {
                  console.log(
                    theme.success(`\n${formatCliMediaSaveSummary(taskId, paths.length)}`),
                  );
                },
              );
            }
          }
          console.log('\n');

          // Persist conversation after each turn
          if (!state!.conversationTitle) {
            state!.conversationTitle =
              agentPrompt.slice(0, 50) + (agentPrompt.length > 50 ? '…' : '');
          }
          const record: ConversationRecord = {
            id: state!.conversationId,
            version: 1,
            title: state!.conversationTitle,
            workDir: sessionConfig.workDir,
            messages: state!.session.getHistory(),
            createdAt: state!.conversationCreatedAt,
            updatedAt: Date.now(),
            source: 'tui',
            mediaModelSelection:
              Object.keys(state!.mediaModelOverrides).length > 0
                ? state!.mediaModelOverrides
                : undefined,
          };
          state!.conversationStorage.save(record).catch(() => {
            /* silent — storage is best-effort */
          });
        } catch (error) {
          console.error(
            theme.error(`Error: ${error instanceof Error ? error.message : String(error)}`),
          );
        }

        prompt();
      });
    };

    prompt();
  } catch (error) {
    console.error('Failed to initialize:', error);
    if (state) {
      state.session.dispose();
      await state.mcpManager.disconnectAll();
    }
    rl.close();
  }
}
