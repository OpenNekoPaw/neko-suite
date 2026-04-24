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
  createSkillService,
  createNodeSkillLoader,
  ToolRegistry,
  AgentSession,
  createAgentSession,
  SystemPromptBuilder,
  createSystemPromptBuilder,
  getDefaultPersonalPath,
  createInputProcessor,
  createCoreTools,
  createFileProjectMemoryManager,
  type InputProcessor,
  type ConversationRecord,
  createFileConversationStorage,
  createNodeJournalStorage,
  createConversationId,
  type FileConversationStorage,
} from '@neko/agent';
import * as os from 'node:os';
import {
  createPlatform,
  FileUserConfigManager,
  toSharedService,
  type Platform,
} from '@neko/platform';
import { TaskManager, createFileTaskStorage } from '@neko/agent';

type ExecutionMode = 'plan' | 'ask' | 'auto';
import type { IService } from '@neko/shared';
import type { SkillService } from '@neko/agent';
import type { CLIConfig, RunOptions, CLIResult } from './types';
import { theme } from './theme';
import { formatToolCall } from './formatter';
import { isSlashCommand, handleSlashCommand, type SlashCommandContext } from './slash-commands';
import { getProviderModels } from './config';

/**
 * Agent runner options
 */
export interface AgentRunnerOptions {
  config: CLIConfig;
  runOptions: RunOptions;
  /** Optional Platform Service for advanced LLM features */
  service?: IService;
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
    if (config.skillsDir) {
      const skillLoader = createNodeSkillLoader(fs, path);
      skillService = createSkillService();
      const loadResult = await skillLoader.loadFromDirectory(config.skillsDir);
      for (const skill of loadResult.skills) {
        skillService.registry.registerSkill(skill);
      }
    }

    // Create LLM service via Platform
    let llmService: IService;
    let platform: Platform | undefined;

    if (service) {
      llmService = service;
    } else {
      const taskStoragePath = path.join(os.homedir(), '.neko', 'tasks.json');
      const taskManager = new TaskManager({ storage: createFileTaskStorage(taskStoragePath) });
      platform = createPlatform({
        userConfigManager: new FileUserConfigManager(),
        workspacePath: config.workDir,
        toolRegistry,
        taskManager,
      });
      llmService = toSharedService(platform.createService());
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
    const session = createAgentSession({
      service: llmService,
      toolRegistry,
      systemPrompt,
      executionMode,
      maxIterations: runOptions.maxIterations,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      modelId: config.model,
      hooks: hooks ? [hooks as ExecutorHooks] : undefined,
      projectMemoryManager,
      journalWriter: createNodeJournalStorage().createWriter(conversationId),
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
    if (skillService) {
      session.setSkillProvider({
        listSkills: () =>
          skillService!.registry
            .listSkills()
            .filter((s) => s.enabled !== false)
            .map((s) => ({ name: s.name, description: s.description || '' })),
        getActiveSkill: () => {
          const skill = session.getActiveSkill();
          return skill ? { name: skill.name, description: skill.description || '' } : null;
        },
        activateSkill: (name: string) => {
          const skill = skillService!.registry.getSkill(name);
          if (!skill) return { success: false, message: `Skill "${name}" not found` };
          void skillService!.apply(skill).then((injection) => {
            session.applySkillInjection(injection, skill);
          });
          return {
            success: true,
            message: `Activated skill "${name}"`,
          };
        },
        deactivateSkill: () => {
          session.clearActiveSkill();
          return { success: true, message: 'Skill deactivated' };
        },
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

    // Process input for file references
    const processedInput = await inputProcessor.process(runOptions.prompt);

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
      for await (const event of session.execute(finalPrompt, {
        workspaceRoot: config.workDir,
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
          subscribeToMediaSave(platform, event, config.workDir, (taskId, localPaths) => {
            onOutput?.(`\n[media] Saved ${localPaths.length} file(s) to .neko/generated/\n`);
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

/**
 * Subscribe to a background media task and save outputs to local disk when complete.
 * Called on every tool_result event that carries { backgroundMode: true, taskId }.
 * No-op if platform or platform.media is unavailable.
 */
function subscribeToMediaSave(
  platform: Platform | undefined,
  event: AgentEvent,
  workDir: string,
  onSaved?: (taskId: string, localPaths: string[]) => void,
): void {
  if (!platform?.media) return;

  const resultData = event.toolResult?.data as Record<string, unknown> | undefined;
  if (resultData?.backgroundMode !== true || typeof resultData?.taskId !== 'string') return;

  const taskId = resultData.taskId;
  const outputDir = path.join(workDir, '.neko', 'generated');

  const unsubscribe = platform.media.onProgress(taskId, async (task) => {
    if (task.status === 'completed' && task.outputs && task.outputs.length > 0) {
      // No transcodeFile needed for TUI (terminal renders paths, not Electron webview)
      const localPaths = await platform.media!.saveOutputs(taskId, outputDir);
      if (localPaths.length > 0) {
        onSaved?.(taskId, localPaths);
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

    for await (const event of session.execute(finalPrompt, {
      workspaceRoot: config.workDir,
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
        subscribeToMediaSave(platform, event, config.workDir, (taskId, localPaths) => {
          onOutput?.(`\n[media] Saved ${localPaths.length} file(s) to .neko/generated/\n`);
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

/**
 * Interactive session state
 */
interface InteractiveSessionState {
  mcpManager: MCPManager;
  toolRegistry: ToolRegistry;
  skillService?: SkillService;
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
    music?: string;
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
): Promise<InteractiveSessionState> {
  // Track tools the user has approved with "always"
  const alwaysAllowedTools = new Set<string>();

  // Initialize MCP Manager
  const mcpManager = new MCPManager();
  const toolRegistry = new ToolRegistry();
  let skillService: SkillService | undefined;

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
    const loadResult = await skillLoader.loadFromDirectory(config.skillsDir);
    for (const skill of loadResult.skills) {
      skillService.registry.registerSkill(skill);
    }
  }

  // Create LLM service via Platform
  let platform: Platform | undefined;
  let llmService: IService;
  if (service) {
    llmService = service;
  } else {
    const taskStoragePath = path.join(os.homedir(), '.neko', 'tasks.json');
    const taskManager = new TaskManager({ storage: createFileTaskStorage(taskStoragePath) });
    platform = createPlatform({
      userConfigManager: new FileUserConfigManager(),
      workspacePath: config.workDir,
      toolRegistry,
      taskManager,
    });
    llmService = toSharedService(platform.createService());
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
  const session = createAgentSession({
    service: llmService,
    toolRegistry,
    systemPrompt,
    executionMode: 'auto',
    maxIterations: 50,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    modelId: config.model,
    journalWriter: createNodeJournalStorage().createWriter(conversationId),
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
  if (skillService) {
    session.setSkillProvider({
      listSkills: () =>
        skillService!.registry
          .listSkills()
          .filter((s) => s.enabled !== false)
          .map((s) => ({ name: s.name, description: s.description || '' })),
      getActiveSkill: () => {
        const skill = session.getActiveSkill();
        return skill ? { name: skill.name, description: skill.description || '' } : null;
      },
      activateSkill: (name: string) => {
        const skill = skillService!.registry.getSkill(name);
        if (!skill) return { success: false, message: `Skill "${name}" not found` };
        void skillService!.apply(skill).then((injection) => {
          session.applySkillInjection(injection, skill);
        });
        return {
          success: true,
          message: `Activated skill "${name}"`,
        };
      },
      deactivateSkill: () => {
        session.clearActiveSkill();
        return { success: true, message: 'Skill deactivated' };
      },
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
  options?: { resumeId?: string },
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
    state = await initializeInteractiveSession(sessionConfig, rl, service, options?.resumeId);

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

        if (!trimmed) {
          prompt();
          return;
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

          if (!result.continueExecution) {
            state!.session.dispose();
            await state!.mcpManager.disconnectAll();
            rl.close();
            return;
          }

          // If the slash command was handled and doesn't need agent execution
          if (result.handled && !trimmed.startsWith('/run ')) {
            console.log('');
            prompt();
            return;
          }
        }

        // Run agent for non-slash commands or /run commands
        const agentPrompt = trimmed.startsWith('/run ') ? trimmed.slice(5).trim() : trimmed;

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
          for await (const event of state!.session.execute(finalPrompt, {
            workspaceRoot: sessionConfig.workDir,
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
              subscribeToMediaSave(state!.platform, event, sessionConfig.workDir, (_id, paths) => {
                console.log(theme.success(`\n[media] Saved ${paths.length} file(s):`));
                for (const p of paths) console.log(theme.muted(`  ${p}`));
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
