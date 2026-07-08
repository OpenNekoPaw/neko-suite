/**
 * Agent Runner
 *
 * Core execution logic for headless terminal agent runs.
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
  createSystemPromptBuilder,
  getDefaultPersonalPath,
  createInputProcessor,
  createCoreTools,
  createFileProjectMemoryManager,
  mergeCreationExecutionMetadata,
  type InputProcessor,
  createConversationId,
  resolveSlashCommandCatalogEntry,
} from '@neko/agent';
import { createAgentSessionWithRuntime } from '@neko/agent/runtime';
import type { Platform } from '@neko/platform';

type ExecutionMode = 'plan' | 'ask' | 'auto';
import { resolveStorageLayout, type AgentCapabilityProvider, type IService } from '@neko/shared';
import type { SkillService, IRuntimeTaskManager } from '@neko/agent';
import { ProviderCardRegistry } from '@neko/agent';
import type { CLIConfig, RunOptions, CLIResult } from './types';
import {
  handleSkillInvocation,
  handleSlashCommand,
  isSkillInvocation,
  isSlashCommand,
  parseSlashCommand,
  type SlashCommandContext,
} from './slash-commands';
import { createCLIPlatform, createCLITaskManager } from './platform-bootstrap';
import { formatTuiReferenceDiagnostics } from './reference-diagnostics';
import { createCliAgentRuntime, createCliToolGroupRegistry } from './runtime-bootstrap';
import { createTuiCapabilityLoader } from './tui-capability-loader';
import { detectTuiLocale } from './tui-locale';
import { mergeTuiMediaModelMetadata } from './media-model-metadata';
import { loadTuiSessionSkills } from './tui-session-skills';
import {
  activateCliDomainSkill,
  type CliSkillLifecycleSessionBridge,
  createCliSkillLifecycleRuntime,
  wireCliSkillLifecycleSession,
} from './skill-lifecycle-session';
import { withTuiDefaultCapabilityProviders } from '../host/tui-default-capabilities';
import { createNodeWorkspaceContentPolicy } from '../host/node-workspace-content-host';

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
    const contentPolicy = createNodeWorkspaceContentPolicy({ workDir: config.workDir });

    // Register core file/system tools
    const coreTools = createCoreTools({
      defaultCwd: config.workDir,
      authorizedReadRoots: contentPolicy.authorizedReadRoots,
      projectMemoryManager,
    });
    toolRegistry.registerMany(coreTools);

    // Initialize Skill Service
    const skillLoader = createNodeSkillLoader(fs, path);
    const skillService = createSkillService();
    const loadedSkills = await loadTuiSessionSkills({
      skillLoader,
      config,
      locale,
    });
    for (const skill of loadedSkills) {
      skillService.registry.registerSkill(skill);
    }
    const skillLifecycleRuntime = createCliSkillLifecycleRuntime(skillService);
    const toolGroupRegistry = createCliToolGroupRegistry();
    const providerCardRegistry = new ProviderCardRegistry();
    const capabilityLoader = createTuiCapabilityLoader({
      toolRegistry,
      skillRegistry: skillService.registry,
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
    const taskManager =
      providedTaskManager ?? createCLITaskManager({ workspacePath: config.workDir });

    if (service) {
      llmService = service;
    } else {
      const cliPlatform = createCLIPlatform({
        workspacePath: config.workDir,
        toolRegistry,
        taskManager,
        providerCardRegistry,
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
      modelCapabilities: config.chatModel?.capabilities,
      hooks: hooks ? [hooks as ExecutorHooks] : undefined,
      runtime: createCliAgentRuntime({
        workspaceRoot: config.workDir,
        taskManager,
        skillService,
        skillLifecycleRuntime,
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
        // Headless runs auto-approve for now; interactive approval belongs to the Ink TUI.
        return true;
      },
    });

    // Wire skill provider to meta tools
    let skillLifecycleBridge: CliSkillLifecycleSessionBridge | undefined;
    skillLifecycleBridge = wireCliSkillLifecycleSession({
      session,
      skillService,
      conversationId,
      lifecycleRuntime: skillLifecycleRuntime,
    });

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
      const creationMetadata = mergeCreationExecutionMetadata(
        session.getExecutionMode() === 'plan' ? createPlanModeCreationMetadata() : undefined,
        preparedInput.executionMetadata,
      );
      const executionMetadata = mergeTuiMediaModelMetadata(
        creationMetadata,
        config.defaultMediaModels,
        config.chatModel?.providerId ?? config.provider,
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
      surface: 'tui',
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
        onText?.(event.content);
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
