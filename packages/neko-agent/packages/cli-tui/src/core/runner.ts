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
  createPlanModeCreationMetadata,
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
  mergeCreationExecutionMetadata,
  type InputProcessor,
  type ConversationRecord,
  createFileConversationStorage,
  createConversationId,
  type FileConversationStorage,
  type SkillLifecycleRuntime,
  resolveSlashCommandCatalogEntry,
} from '@neko/agent';
import { createAgentSessionWithRuntime } from '@neko/agent/runtime';
import {
  ConfigManager,
  FileUserConfigManager,
  projectLlmParameters,
  toSharedService,
  type Platform,
} from '@neko/platform';
import type { AgentLlmConfig, ModelRef } from '@neko-agent/types';

type ExecutionMode = 'plan' | 'ask' | 'auto';
import { resolveStorageLayout, type AgentCapabilityProvider, type IService } from '@neko/shared';
import type { SkillService, IRuntimeTaskManager } from '@neko/agent';
import { ProviderCardRegistry } from '@neko/agent';
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
import {
  handleTuiControlCommand,
  type TuiCommandRouterContext,
  type TuiCommandRouterResult,
  type TuiModelIdentity,
  type TuiParameterValidationResult,
} from './tui-command-router';
import { getProviderModels, listChatModelOptions } from './config';
import { createCLIPlatform, createCLITaskManager } from './platform-bootstrap';
import { formatTuiReferenceDiagnostics } from './reference-diagnostics';
import { createTuiMessageQueue, type TuiMessageQueue } from './message-queue';
import { createCliAgentRuntime, createCliToolGroupRegistry } from './runtime-bootstrap';
import { createTuiCapabilityLoader, type TuiCapabilityLoaderResult } from './tui-capability-loader';
import { detectTuiLocale } from './tui-locale';
import { loadSkillArtifactsAsSkills } from './skill-artifacts';
import {
  activateCliDomainSkill,
  type CliSkillLifecycleSessionBridge,
  createCliSkillLifecycleRuntime,
  wireCliSkillLifecycleSession,
} from './skill-lifecycle-session';
import {
  connectTuiMcpServer,
  createTuiMcpServerSnapshots,
  disconnectTuiMcpServer,
  listRegisteredTuiMcpTools,
  reconnectTuiMcpServer,
} from './tui-mcp-ports';
import { withTuiDefaultCapabilityProviders } from '../host/tui-default-capabilities';

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
  /** Host-agnostic package capability providers injected by the CLI host. */
  capabilityProviders?: readonly AgentCapabilityProvider[];
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
    capabilityProviders,
    hooks,
    onOutput,
    onToolCall,
    onThinking,
    executionMode = 'auto',
  } = options;
  const startTime = Date.now();
  const locale = detectTuiLocale();

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
    const toolGroupRegistry = createCliToolGroupRegistry();
    const providerCardRegistry = new ProviderCardRegistry();
    const capabilityLoader = createTuiCapabilityLoader({
      toolRegistry,
      ...(skillService ? { skillRegistry: skillService.registry } : {}),
      toolGroupRegistry,
      providerCardRegistry,
      locale,
    });
    const capabilityLoadResult = capabilityLoader.registerProviders(
      withTuiDefaultCapabilityProviders({
        workDir: config.workDir,
        capabilityProviders,
      }),
    );

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
      locale,
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
      locale,
      executionMode,
      maxIterations: runOptions.maxIterations,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      providerId: config.chatModel?.providerId ?? config.provider,
      modelId: config.model,
      hooks: hooks ? [hooks as ExecutorHooks] : undefined,
      runtime: createCliAgentRuntime({
        workspaceRoot: config.workDir,
        taskManager,
        ...(skillService ? { skillService } : {}),
        ...(skillLifecycleRuntime ? { skillLifecycleRuntime } : {}),
        toolGroupRegistry,
        providerCardRegistry,
        promptFragments: capabilityLoadResult.promptFragments,
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
        locale,
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
    const referenceDiagnostic = formatTuiReferenceDiagnostics(processedInput.errors);
    if (referenceDiagnostic) {
      session.dispose();
      await mcpManager.disconnectAll();
      return {
        success: false,
        error: referenceDiagnostic,
        duration: Date.now() - startTime,
      };
    }

    // Build final prompt with file contents
    let finalPrompt = processedInput.message;
    if (processedInput.hasFiles) {
      finalPrompt = `${processedInput.message}\n\n## Referenced Files\n\n${processedInput.fileContents}`;
    }

    // Execute and collect events
    let output = '';
    const collector = createEventCollector();

    // Wire timeout via AbortController
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    if (runOptions.timeout) {
      timeoutId = setTimeout(() => controller.abort(), runOptions.timeout);
    }

    try {
      const executionMetadata = mergeCreationExecutionMetadata(
        session.getExecutionMode() === 'plan' ? createPlanModeCreationMetadata() : undefined,
        preparedInput.executionMetadata,
      );
      for await (const event of session.execute(finalPrompt, {
        workspaceRoot: config.workDir,
        ...(executionMetadata ? { metadata: executionMetadata } : {}),
      })) {
        if (controller.signal.aborted) {
          timedOut = true;
          session.cancel();
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

    if (timedOut) {
      const error = new Error(`Agent execution timed out after ${runOptions.timeout}ms`);
      return createCliFailureResult({
        error,
        output,
        collector,
        startTime,
      });
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

function createCliFailureResult(input: {
  readonly error: Error;
  readonly output: string;
  readonly collector: EventCollector;
  readonly startTime: number;
}): CLIResult {
  const endTime = Date.now();
  return {
    success: false,
    output: input.output,
    error: input.error.message,
    agentResult: {
      success: false,
      response: input.output,
      steps: input.collector.steps,
      iterations: input.collector.iterations,
      error: input.error,
      timing: {
        startTime: input.startTime,
        endTime,
        duration: endTime - input.startTime,
      },
    },
    duration: endTime - input.startTime,
  };
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
      locale: input.slashContext.locale,
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

    case 'assistant_text_replacement':
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
      session.getExecutionMode() === 'plan' ? createPlanModeCreationMetadata() : undefined;

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
  mediaModelRefs: {
    image?: ModelRef<'image'>;
    video?: ModelRef<'video'>;
    audio?: ModelRef<'audio'>;
  };
  /** Terminal session mode for subsequent sends. */
  sessionMode: 'agent' | 'image' | 'video' | 'audio';
  /** Readline mode is prompt-serial, but exposes the same queue command surface. */
  messageQueue: TuiMessageQueue;
  /** TUI-safe capability provider registration snapshot. */
  capabilityLoadResult: TuiCapabilityLoaderResult;
}

interface InteractiveRouterContextInput {
  readonly slashContext: SlashCommandContext;
  readonly getState: () => InteractiveSessionState;
  readonly getSessionConfig: () => CLIConfig;
  readonly setSessionConfig: (config: CLIConfig) => void;
  readonly service?: IService;
}

function createInteractiveRouterContext(
  input: InteractiveRouterContextInput,
): TuiCommandRouterContext {
  return {
    slash: input.slashContext,
    ports: {
      output: {
        info: (message: string) => console.log(message),
        error: (message: string) => console.error(theme.error(`Error: ${message}`)),
      },
      lifecycle: {
        exit: () => {},
      },
      history: {
        clear: () => {
          input.getState().session.clearHistory();
          return 'Conversation history cleared';
        },
      },
      mode: {
        getSessionMode: () => input.getState().sessionMode,
        setSessionMode: (mode) => {
          input.getState().sessionMode = mode;
          return `Session mode set to: ${mode}`;
        },
        setExecutionMode: (mode: ExecutionMode) => {
          const state = input.getState();
          state.promptBuilder.setMode(mode === 'plan' ? 'plan' : 'default');
          state.session.setExecutionMode(mode);
          switch (mode) {
            case 'plan':
              return 'Switched to plan mode';
            case 'auto':
              return 'Switched to auto mode';
            case 'ask':
              return 'Switched to ask mode';
          }
        },
      },
      model: {
        listChatModelOptions: () => listChatModelOptions(input.getSessionConfig().workDir),
        listChatModels: () => {
          const config = input.getSessionConfig();
          return getProviderModels(config.provider, config.workDir);
        },
        selectChatModel: (model) => {
          const currentConfig = input.getSessionConfig();
          const identity =
            typeof model === 'string'
              ? { providerId: currentConfig.provider, modelId: model }
              : model;
          const nextConfig = {
            ...currentConfig,
            provider: identity.providerId,
            model: identity.modelId,
            chatModel: {
              providerId: identity.providerId,
              modelId: identity.modelId,
            },
          };
          input.setSessionConfig(nextConfig);
          input.getState().rebuildService(nextConfig, input.service);
        },
      },
      media: {
        listMediaModelOptions: () =>
          listChatModelOptions(input.getSessionConfig().workDir).filter(
            (option) =>
              option.category === 'image' ||
              option.category === 'video' ||
              option.category === 'audio',
          ),
        getCurrentMediaModels: () => ({
          ...(input.getSessionConfig().defaultMediaModels ?? {}),
          ...input.getState().mediaModelOverrides,
        }),
        setMediaModel: (category, model) => {
          const state = input.getState();
          const nextValue =
            model === 'none' ? 'none' : (model.optionId ?? `${model.providerId}:${model.modelId}`);
          state.mediaModelOverrides = {
            ...state.mediaModelOverrides,
            [category]: nextValue,
          };
          if (model !== 'none') {
            state.mediaModelRefs = {
              ...state.mediaModelRefs,
              [category]: {
                providerId: model.providerId,
                modelId: model.modelId,
                category,
              },
            };
          } else {
            const nextRefs = { ...state.mediaModelRefs };
            delete nextRefs[category];
            state.mediaModelRefs = nextRefs;
          }
          input.slashContext.currentMediaOverrides = state.mediaModelOverrides;
          state.platform?.config.setRuntimeMediaDefaults(state.mediaModelOverrides);
        },
        resetMediaModels: () => {
          const state = input.getState();
          state.mediaModelOverrides = {};
          state.mediaModelRefs = {};
          input.slashContext.currentMediaOverrides = {};
          state.platform?.config.setRuntimeMediaDefaults({});
        },
      },
      parameters: {
        getConfig: () => input.getSessionConfig().llmConfig,
        validate: (llmConfig) => validateInteractiveLlmConfig(input.getSessionConfig(), llmConfig),
        apply: (result) => {
          const currentConfig = input.getSessionConfig();
          const nextConfig = {
            ...currentConfig,
            llmConfig: result.config,
            temperature: result.chatOptions?.temperature ?? currentConfig.temperature,
            maxTokens: result.chatOptions?.maxTokens ?? currentConfig.maxTokens,
            thinkingBudget: result.chatOptions?.thinkingBudget ?? currentConfig.thinkingBudget,
          };
          input.setSessionConfig(nextConfig);
          input.getState().session.configure({
            temperature: nextConfig.temperature,
            topP: result.chatOptions?.topP,
            maxTokens: nextConfig.maxTokens,
            thinkingBudget: nextConfig.thinkingBudget,
            providerOptions: result.providerOptions,
          });
        },
      },
      context: {
        getTokenCount: () => input.getState().session.getTokenCount(),
        compact: () => input.getState().session.compressContext(),
      },
      queue: {
        getSnapshot: () => input.getState().messageQueue.snapshot(),
        promote: (queueItemId) => input.getState().messageQueue.promote(queueItemId),
        cancel: (queueItemId) => input.getState().messageQueue.cancel(queueItemId),
        edit: (queueItemId, content) => input.getState().messageQueue.edit(queueItemId, content),
      },
      mcp: {
        listServers: () =>
          createTuiMcpServerSnapshots(input.getState().mcpManager, input.getState().toolRegistry),
        listTools: (serverId) => listRegisteredTuiMcpTools(input.getState().toolRegistry, serverId),
        connect: (serverId) =>
          connectTuiMcpServer(input.getState().mcpManager, input.getState().toolRegistry, serverId),
        disconnect: (serverId) =>
          disconnectTuiMcpServer(
            input.getState().mcpManager,
            input.getState().toolRegistry,
            serverId,
          ),
        reconnect: (serverId) =>
          reconnectTuiMcpServer(
            input.getState().mcpManager,
            input.getState().toolRegistry,
            serverId,
          ),
      },
      capability: {
        getProviderSummaries: () => input.getState().capabilityLoadResult.providers,
        getDiagnostics: () => input.getState().capabilityLoadResult.diagnostics,
        listTools: (providerId) => {
          const tools = input.getState().toolRegistry.list();
          if (!providerId) {
            return tools.map((tool) => tool.name);
          }
          const summary = input
            .getState()
            .capabilityLoadResult.providers.find((provider) => provider.providerId === providerId);
          if (!summary) {
            return [];
          }
          const providerToolNames = new Set(
            summary.loaded
              .filter((contribution) => contribution.kind === 'tool')
              .map((contribution) => contribution.name),
          );
          return tools
            .map((tool) => tool.name)
            .filter((toolName) => providerToolNames.has(toolName));
        },
      },
      status: {
        getSnapshot: () => ({
          sessionMode: input.getState().sessionMode,
          executionMode: input.getState().session.getExecutionMode(),
          agentStatus: 'interactive',
          chatModelIdentity: formatInteractiveChatModel(input.getSessionConfig()),
          mediaModelSummary: formatInteractiveMediaSummary(
            input.getSessionConfig(),
            input.getState(),
          ),
          llmParameterSummary: formatInteractiveLlmParameterSummary(
            input.getSessionConfig().llmConfig,
          ),
          queueCount: input.getState().messageQueue.snapshot().pendingCount,
        }),
      },
    },
  };
}

function projectInteractiveCommandResult(result: TuiCommandRouterResult): void {
  if (result.output) {
    console.log(result.output);
  }
  if (result.error) {
    console.error(theme.error(`Error: ${result.error}`));
  }
}

function validateInteractiveLlmConfig(
  config: CLIConfig,
  llmConfig: AgentLlmConfig,
): TuiParameterValidationResult {
  const manager = new ConfigManager({
    userConfigManager: new FileUserConfigManager(),
    workspacePath: config.workDir,
  });
  try {
    const providerId = config.chatModel?.providerId ?? config.provider;
    const modelId = config.chatModel?.modelId ?? config.model;
    const provider = manager.getProvider(providerId);
    const model = manager.getModel(modelId);
    if (!provider) {
      throw new Error(`Provider "${providerId}" is not configured.`);
    }
    if (!model) {
      throw new Error(`Model "${modelId}" is not configured.`);
    }
    const projection = projectLlmParameters({ provider, model, llmConfig });
    return {
      config: llmConfig,
      chatOptions: projection.chatOptions,
      providerOptions: projection.providerOptions,
      diagnostics: projection.diagnostics.map((diagnostic) => diagnostic.message),
      summary: formatInteractiveLlmProjectionSummary(projection),
    };
  } finally {
    manager.dispose();
  }
}

function formatInteractiveChatModel(config: CLIConfig): string {
  return `${config.chatModel?.providerId ?? config.provider}:${config.chatModel?.modelId ?? config.model}`;
}

function formatInteractiveMediaSummary(
  config: CLIConfig,
  state: InteractiveSessionState,
): string | undefined {
  const merged = {
    ...(config.defaultMediaModels ?? {}),
    ...state.mediaModelOverrides,
  };
  const entries = (['image', 'video', 'audio'] as const)
    .map((category) => (merged[category] ? `${category}=${merged[category]}` : undefined))
    .filter((entry): entry is string => Boolean(entry));
  return entries.length > 0 ? entries.join(', ') : undefined;
}

function formatInteractiveLlmParameterSummary(
  llmConfig: AgentLlmConfig | undefined,
): string | undefined {
  if (!llmConfig) return undefined;
  const entries = [
    llmConfig.reasoningPreset ? `reasoning=${llmConfig.reasoningPreset}` : undefined,
    llmConfig.verbosityPreset ? `verbosity=${llmConfig.verbosityPreset}` : undefined,
    llmConfig.creativityPreset ? `creativity=${llmConfig.creativityPreset}` : undefined,
    ...(llmConfig.advanced
      ? Object.entries(llmConfig.advanced).map(([key, value]) =>
          value !== undefined ? `${key}=${value}` : undefined,
        )
      : []),
  ].filter((entry): entry is string => Boolean(entry));
  return entries.length > 0 ? entries.join(', ') : undefined;
}

function formatInteractiveLlmProjectionSummary(
  result: ReturnType<typeof projectLlmParameters>,
): string {
  const applied = [
    result.chatOptions.temperature !== undefined
      ? `temperature=${result.chatOptions.temperature}`
      : undefined,
    result.chatOptions.topP !== undefined ? `topP=${result.chatOptions.topP}` : undefined,
    result.chatOptions.maxTokens !== undefined
      ? `maxTokens=${result.chatOptions.maxTokens}`
      : undefined,
    result.chatOptions.thinkingBudget !== undefined
      ? `thinkingBudget=${result.chatOptions.thinkingBudget}`
      : undefined,
    Object.keys(result.providerOptions).length > 0
      ? `providerOptions=${Object.keys(result.providerOptions).join(',')}`
      : undefined,
  ].filter((entry): entry is string => Boolean(entry));
  return applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Applied: provider defaults';
}

function mergeInteractiveMediaModelMetadata(
  metadata: Record<string, unknown> | undefined,
  refs: InteractiveSessionState['mediaModelRefs'],
): Record<string, unknown> | undefined {
  if (Object.keys(refs).length === 0) {
    return metadata;
  }
  return {
    ...(metadata ?? {}),
    mediaModels: refs,
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
  capabilityProviders: readonly AgentCapabilityProvider[] = [],
): Promise<InteractiveSessionState> {
  // Track tools the user has approved with "always"
  const alwaysAllowedTools = new Set<string>();
  const locale = detectTuiLocale();

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
  const toolGroupRegistry = createCliToolGroupRegistry();
  const providerCardRegistry = new ProviderCardRegistry();
  const capabilityLoader = createTuiCapabilityLoader({
    toolRegistry,
    ...(skillService ? { skillRegistry: skillService.registry } : {}),
    toolGroupRegistry,
    providerCardRegistry,
    locale,
  });
  const capabilityLoadResult = capabilityLoader.registerProviders(
    withTuiDefaultCapabilityProviders({
      workDir: config.workDir,
      capabilityProviders,
    }),
  );

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
  const promptBuilder = createSystemPromptBuilder({ locale });
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
    locale,
    executionMode: 'auto',
    maxIterations: 50,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    providerId: config.chatModel?.providerId ?? config.provider,
    modelId: config.model,
    runtime: createCliAgentRuntime({
      workspaceRoot: config.workDir,
      taskManager,
      ...(skillService ? { skillService } : {}),
      ...(skillLifecycleRuntime ? { skillLifecycleRuntime } : {}),
      toolGroupRegistry,
      providerCardRegistry,
      promptFragments: capabilityLoadResult.promptFragments,
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
      providerId: newConfig.chatModel?.providerId ?? newConfig.provider,
      modelId: newConfig.model,
      temperature: newConfig.temperature,
      maxTokens: newConfig.maxTokens,
      thinkingBudget: newConfig.thinkingBudget,
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
    mediaModelRefs: {},
    sessionMode: 'agent',
    messageQueue: createTuiMessageQueue({ conversationId }),
    capabilityLoadResult,
  };
}

/**
 * Run agent in interactive mode
 */
export async function runInteractive(
  config: CLIConfig,
  service?: IService,
  _hooks?: Partial<ExecutorHooks>,
  options?: {
    resumeId?: string;
    initialPrompt?: string;
    taskManager?: IRuntimeTaskManager;
    capabilityProviders?: readonly AgentCapabilityProvider[];
  },
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
      options?.capabilityProviders ?? [],
    );

    // Create slash command context
    const slashContext: SlashCommandContext = {
      locale: detectTuiLocale(),
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

    let readlineClosed = false;
    const closeReadline = (): void => {
      readlineClosed = true;
      rl.close();
    };

    const handleInput = async (input: string, continuePrompt: () => void): Promise<void> => {
      const trimmed = input.trim();
      let executionPrompt = trimmed;
      let executionMetadata: Record<string, unknown> | undefined;

      if (!trimmed) {
        continuePrompt();
        return;
      }

      if (isSkillInvocation(trimmed)) {
        const result = await handleSkillInvocation(trimmed, slashContext);

        if (result.output) {
          console.log(result.output);
        }
        if (result.error) {
          console.error(theme.error(`Error: ${result.error}`));
          continuePrompt();
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
            continuePrompt();
            return;
          }
        } else {
          console.error(theme.error('Error: Skill invocation did not return lifecycle activation'));
          continuePrompt();
          return;
        }

        if (result.agentPrompt) {
          executionPrompt = result.agentPrompt;
          executionMetadata = mergeCreationExecutionMetadata(
            state!.session.getExecutionMode() === 'plan'
              ? createPlanModeCreationMetadata()
              : undefined,
            result.executionOverrides?.metadata,
          );
        } else {
          console.log('');
          continuePrompt();
          return;
        }
      }

      // Handle slash commands
      if (isSlashCommand(trimmed)) {
        const result = await handleTuiControlCommand(
          trimmed,
          createInteractiveRouterContext({
            slashContext,
            getState: () => state!,
            getSessionConfig: () => sessionConfig,
            setSessionConfig: (nextConfig) => {
              sessionConfig = nextConfig;
              slashContext.config = sessionConfig;
            },
            service,
          }),
        );

        projectInteractiveCommandResult(result);

        if (result.lifecycleActivation) {
          const activation = await activateCliLifecycleHint({
            bridge: state!.skillLifecycleBridge,
            conversationId: state!.conversationId,
            hint: result.lifecycleActivation,
          });
          if (!activation.ok) {
            console.error(theme.error(`Error: ${activation.message}`));
            continuePrompt();
            return;
          }
        }

        if (!result.continueExecution) {
          state!.session.dispose();
          await state!.mcpManager.disconnectAll();
          closeReadline();
          return;
        }

        if (result.agentPrompt) {
          executionPrompt = result.agentPrompt;
          executionMetadata = mergeCreationExecutionMetadata(
            state!.session.getExecutionMode() === 'plan'
              ? createPlanModeCreationMetadata()
              : undefined,
            result.executionOverrides?.metadata,
          );
        }

        // If the slash command was handled and doesn't need agent execution
        if (result.handled && !trimmed.startsWith('/run ') && !result.agentPrompt) {
          console.log('');
          continuePrompt();
          return;
        }
      }

      // Run agent for non-slash commands or /run commands
      const agentPrompt = trimmed.startsWith('/run ') ? trimmed.slice(5).trim() : executionPrompt;

      if (!agentPrompt) {
        continuePrompt();
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
              ? createPlanModeCreationMetadata()
              : undefined;
        }
        executionMetadata = mergeInteractiveMediaModelMetadata(
          executionMetadata,
          state!.mediaModelRefs,
        );

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
            subscribeToMediaSave(state!.platform, event, sessionConfig.workDir, (taskId, paths) => {
              console.log(theme.success(`\n${formatCliMediaSaveSummary(taskId, paths.length)}`));
            });
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

      continuePrompt();
    };

    const prompt = (): void => {
      rl.question('> ', (input) => {
        void handleInput(input, prompt);
      });
    };

    const initialPrompt = options?.initialPrompt?.trim();
    if (initialPrompt) {
      console.log(theme.muted(`> ${initialPrompt}`));
      await handleInput(initialPrompt, () => {});
    }

    if (!readlineClosed) {
      prompt();
    }
  } catch (error) {
    console.error('Failed to initialize:', error);
    if (state) {
      state.session.dispose();
      await state.mcpManager.disconnectAll();
    }
    rl.close();
  }
}
