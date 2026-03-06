/**
 * Agent Runner
 *
 * Core execution logic for running the agent from CLI.
 * Uses AgentSession for unified session management.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  AgentResult,
  AgentStep,
  ExecutorHooks,
  AgentEvent,
} from '@neko/agent';
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
  type ExecutionMode,
  type InputProcessor,
} from '@neko/agent';
import type { IService } from '@neko/shared';
import type { SkillService } from '@neko/agent';
import type { CLIConfig, RunOptions, CLIResult } from './types';
import { PROVIDERS } from './types';
import { createLLMServiceAdapter } from './llm-service-adapter';
import {
  isSlashCommand,
  handleSlashCommand,
  type SlashCommandContext,
} from './slash-commands';

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

    // Register core file/system tools
    const coreTools = createCoreTools({ defaultCwd: config.workDir });
    toolRegistry.registerMany(coreTools);

    // Initialize Skill Service
    if (config.skillsDir) {
      const skillLoader = createNodeSkillLoader(fs, path);
      const skillService = createSkillService();
      const loadResult = await skillLoader.loadFromDirectory(config.skillsDir);
      for (const skill of loadResult.skills) {
        skillService.registry.registerSkill(skill);
      }
      for (const command of loadResult.commands) {
        skillService.registry.registerCommand(command);
      }
    }

    // Create LLM service adapter
    const llmService = createLLMServiceAdapter(config, service);

    // Build system prompt
    const promptBuilder = createSystemPromptBuilder({
      locale: 'en',
      mode: executionMode === 'plan' ? 'plan' : 'default',
    });
    await promptBuilder.loadAgentsFile(config.workDir, getDefaultPersonalPath());
    const systemPrompt = promptBuilder.build();

    // Create agent session
    const session = createAgentSession({
      service: llmService,
      toolRegistry,
      systemPrompt,
      executionMode,
      maxIterations: runOptions.maxIterations,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      hooks: hooks ? [hooks as ExecutorHooks] : undefined,
      onConfirmTool: async (request) => {
        // In non-interactive mode, auto-approve all tools
        if (!runOptions.interactive) {
          return true;
        }
        // In interactive mode, this would be handled by the UI
        // For CLI, we auto-approve for now
        return true;
      },
    });

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
        .map(e => `- ${e.reference}: ${e.error}`)
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
        handleAgentEvent(event, {
          onOutput,
          onToolCall,
          onThinking,
          onText: (text) => { output += text; },
        }, collector);
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
  collector?: EventCollector
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
          toolCalls: [{
            id: event.toolCall.id,
            name: event.toolCall.name,
            arguments: event.toolCall.arguments,
          }],
        });
      }
      break;

    case 'tool_result':
      if (event.toolResult && collector) {
        collector.steps.push({
          type: 'observe',
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
}

/**
 * Run the agent with pre-initialized context
 * Used by interactive mode to reuse resources across prompts
 */
export async function runAgentWithContext(
  options: AgentRunnerWithContextOptions
): Promise<CLIResult> {
  const {
    config,
    runOptions,
    session,
    inputProcessor,
    onOutput,
    onToolCall,
    onThinking,
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
          .map(e => `- ${e.reference}: ${e.error}`)
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
      handleAgentEvent(event, {
        onOutput,
        onToolCall,
        onThinking,
        onText: (text) => { output += text; },
      }, collector);
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
}

/**
 * Initialize interactive session
 *
 * @param rl - Shared readline interface (avoids stdin contention)
 */
async function initializeInteractiveSession(
  config: CLIConfig,
  rl: import('node:readline').Interface,
  service?: IService
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
    for (const command of loadResult.commands) {
      skillService.registry.registerCommand(command);
    }
  }

  // Create LLM service adapter
  let llmService = createLLMServiceAdapter(config, service);

  // Build system prompt
  const promptBuilder = createSystemPromptBuilder({ locale: 'en' });
  await promptBuilder.loadAgentsFile(config.workDir, getDefaultPersonalPath());
  const systemPrompt = promptBuilder.build();

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
    onConfirmTool: async (request) => {
      // Check always-allowed set
      if (alwaysAllowedTools.has(request.toolCall.name)) {
        return true;
      }

      // Prompt user via shared readline (no stdin contention)
      console.log(`\n[Tool] ${request.toolCall.name}`);
      const argsStr = JSON.stringify(request.toolCall.arguments, null, 2);
      if (argsStr.length < 500) {
        console.log(argsStr);
      } else {
        console.log(argsStr.slice(0, 500) + '...');
      }

      const answer = await askToolConfirmation('Approve? (y)es / (n)o / (a)lways: ');
      if (answer === 'a' || answer === 'always') {
        alwaysAllowedTools.add(request.toolCall.name);
        return true;
      }
      return answer === 'y' || answer === 'yes';
    },
  });

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
    llmService = createLLMServiceAdapter(newConfig, svc);
    session.configure({
      service: llmService,
      modelId: newConfig.model,
      temperature: newConfig.temperature,
      maxTokens: newConfig.maxTokens,
    });
  };

  return {
    mcpManager,
    toolRegistry,
    skillService,
    session,
    promptBuilder,
    inputProcessor,
    config,
    rebuildService,
  };
}

/**
 * Run agent in interactive mode
 */
export async function runInteractive(
  config: CLIConfig,
  service?: IService,
  _hooks?: Partial<ExecutorHooks>
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
    state = await initializeInteractiveSession(sessionConfig, rl, service);

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
    };

    console.log('NekoAgent CLI - Interactive Mode');
    console.log(`Provider: ${sessionConfig.provider}, Model: ${sessionConfig.model}`);
    console.log('Type /help for commands, /exit to quit.\n');

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
            console.log('Switched to plan mode');
            prompt();
            return;
          }

          if (trimmed === '/auto') {
            state!.promptBuilder.setMode('default');
            state!.session.setExecutionMode('auto');
            console.log('Switched to auto mode');
            prompt();
            return;
          }

          if (trimmed === '/ask') {
            state!.promptBuilder.setMode('default');
            state!.session.setExecutionMode('ask');
            console.log('Switched to ask mode');
            prompt();
            return;
          }

          // Handle /model command
          if (trimmed.startsWith('/model')) {
            const newModel = trimmed.slice(6).trim();
            if (!newModel) {
              // List available models
              const provider = PROVIDERS[sessionConfig.provider];
              if (provider) {
                console.log(`\nCurrent: ${sessionConfig.model}`);
                console.log(`Available (${provider.name}):`);
                for (const m of provider.models) {
                  console.log(`  ${m === sessionConfig.model ? '* ' : '  '}${m}`);
                }
              } else {
                console.log(`Current model: ${sessionConfig.model}`);
              }
            } else {
              sessionConfig = { ...sessionConfig, model: newModel };
              slashContext.config = sessionConfig;
              // Rebuild LLM service so the model change takes effect
              state!.rebuildService(sessionConfig, service);
              console.log(`Model switched to: ${newModel}`);
            }
            prompt();
            return;
          }

          if (trimmed === '/clear') {
            state!.session.clearHistory();
            console.log('Conversation history cleared');
            prompt();
            return;
          }

          if (trimmed === '/compact') {
            const result = await state!.session.compressContext();
            console.log(`Context compressed: ${result.originalTokens} -> ${result.compressedTokens} tokens (${(result.ratio * 100).toFixed(1)}%)`);
            prompt();
            return;
          }

          const result = await handleSlashCommand(trimmed, slashContext);

          if (result.output) {
            console.log(result.output);
          }
          if (result.error) {
            console.error('Error:', result.error);
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
        const agentPrompt = trimmed.startsWith('/run ')
          ? trimmed.slice(5).trim()
          : trimmed;

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
            .map(e => `- ${e.reference}: ${e.error}`)
            .join('\n');
          console.log(`\n[Warning] Some files could not be loaded:\n${errorMessages}\n`);
        }

        // Execute via session
        try {
          for await (const event of state!.session.execute(finalPrompt, {
            workspaceRoot: sessionConfig.workDir,
          })) {
            handleAgentEvent(event, {
              onOutput: (text) => process.stdout.write(text),
              onToolCall: (name, args) => console.log(`\n[Tool] ${name}:`, args),
              onThinking: (thought) => console.log(`\n[Thinking] ${thought}`),
            });
          }
          console.log('\n');
        } catch (error) {
          console.error('Error:', error instanceof Error ? error.message : String(error));
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
