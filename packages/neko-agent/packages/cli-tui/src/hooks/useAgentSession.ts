/**
 * useAgentSession Hook
 *
 * Manages AgentSession lifecycle: initialization, execution, cleanup.
 * Mirrors the initialization pattern from @neko/cli runner.ts
 * but exposes it as a React hook for Ink components.
 */

import { useRef, useCallback, useEffect } from 'react';
import {
  MCPManager,
  createAllMCPTools,
  createSkillService,
  createNodeSkillLoader,
  ToolRegistry,
  createAgentSession,
  createSystemPromptBuilder,
  getDefaultPersonalPath,
  createInputProcessor,
  createCoreTools,
  type IAgentSession,
  type InputProcessor,
  type SystemPromptBuilder,
} from '@neko/agent';
import {
  createPlatform,
  FileUserConfigManager,
  toSharedService,
  type Platform,
} from '@neko/platform';
import { TaskManager, createFileTaskStorage } from '@neko/agent';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { CLIConfig } from '../core/types';
import type { ExecutionMode } from '../types/state';
import type { IService } from '@neko/shared';
import { getProviderModels, updateDefaultModel } from '../core/config';
import { useConfigStore } from '../stores/config-store';
import { useAgentStore } from '../stores/agent-store';
import { useConversationStore } from '../stores/conversation-store';
import { useUIStore, type SelectionMenuItem } from '../stores/ui-store';
import { createEventAdapter, type IEventAdapter } from '../adapters/event-adapter';

export interface UseAgentSessionOptions {
  readonly config: CLIConfig;
  /** Optional Platform Service (from VSCode extension) */
  readonly service?: IService;
}

export interface AgentSessionHandle {
  /** Submit a prompt to the agent */
  submit: (prompt: string) => Promise<void>;
  /** Cancel current execution */
  cancel: () => void;
  /** Clear conversation history */
  clearHistory: () => void;
  /** Confirm or reject a tool call */
  confirmTool: (toolCallId: string, approved: boolean) => void;
  /** Switch model and rebuild LLM service */
  updateModel: (model: string) => void;
  /** Switch execution mode and rebuild system prompt */
  updateMode: (mode: ExecutionMode) => void;
  /** Whether session is initialized */
  readonly isReady: boolean;
}

/**
 * Hook that manages the full AgentSession lifecycle.
 *
 * Initialization:
 * 1. Create MCPManager + ToolRegistry
 * 2. Load skills
 * 3. Create LLM service adapter
 * 4. Build system prompt
 * 5. Create AgentSession
 *
 * On submit:
 * 1. Process input (file references)
 * 2. Execute session → iterate AgentEvent stream
 * 3. Route events through EventAdapter → stores
 */
export function useAgentSession(options: UseAgentSessionOptions): AgentSessionHandle {
  const { config, service } = options;
  const sessionRef = useRef<IAgentSession | null>(null);
  const adapterRef = useRef<IEventAdapter | null>(null);
  const inputProcessorRef = useRef<InputProcessor | null>(null);
  const mcpManagerRef = useRef<MCPManager | null>(null);
  const platformRef = useRef<Platform | null>(null);
  const promptBuilderRef = useRef<SystemPromptBuilder | null>(null);
  const isReadyRef = useRef(false);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  // Initialize session on mount
  useEffect(() => {
    const init = async () => {
      try {
        // Resolve effective model — block on model picker if defaultModel is invalid
        let effectiveModel = config.model;

        if (config.modelNotFound) {
          const chatModels = getProviderModels(config.provider, config.workDir);
          if (chatModels.length > 0) {
            useConversationStore
              .getState()
              .addSystemMessage(
                `Model "${config.modelNotFound}" not found. Please select a model:`,
              );
            const items: SelectionMenuItem[] = chatModels.map((m) => ({
              id: m,
              label: m,
            }));
            const selectedId = await new Promise<string | null>((resolve) => {
              useUIStore.getState().showSelection({
                title: 'Select Model',
                items,
                resolve: (id) => {
                  useUIStore.getState().dismissSelection();
                  resolve(id);
                },
              });
            });
            if (selectedId) {
              effectiveModel = selectedId;
              updateDefaultModel(selectedId);
              useConfigStore.getState().setConfig({ model: selectedId });
              useConversationStore.getState().addSystemMessage(`Model set to: ${selectedId}`);
            } else {
              // User dismissed without selecting — use first available
              effectiveModel = chatModels[0]!;
              useConversationStore
                .getState()
                .addSystemMessage(`No model selected, using: ${effectiveModel}`);
            }
          } else {
            useAgentStore
              .getState()
              .setError(
                new Error(
                  `Model "${config.modelNotFound}" not found and no models available. Configure models first.`,
                ),
              );
            return;
          }
        }

        // 1. MCP Manager
        const mcpManager = new MCPManager();
        mcpManagerRef.current = mcpManager;
        for (const serverConfig of config.mcpServers) {
          mcpManager.register(serverConfig);
        }
        if (config.mcpServers.length > 0) {
          await mcpManager.connectAll();
        }

        // 2. Tool Registry
        const toolRegistry = new ToolRegistry();
        const mcpTools = await createAllMCPTools(mcpManager);
        toolRegistry.registerMany(mcpTools);
        const coreTools = createCoreTools({ defaultCwd: config.workDir });
        toolRegistry.registerMany(coreTools);

        // 3. Skills
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

        // 4. LLM Service — use Platform for multi-provider routing
        let llmService: IService;
        if (service) {
          // Extension mode: use injected service directly
          llmService = service;
        } else {
          // Standalone CLI mode: create Platform with media generation support
          const taskStoragePath = path.join(os.homedir(), '.neko', 'tasks.json');
          const taskManager = new TaskManager({ storage: createFileTaskStorage(taskStoragePath) });
          const platform = createPlatform({
            userConfigManager: new FileUserConfigManager(),
            workspacePath: config.workDir,
            toolRegistry,
            taskManager,
          });
          platformRef.current = platform;
          llmService = toSharedService(platform.createService());
        }

        // 5. System Prompt
        const executionMode = useAgentStore.getState().executionMode;
        const detectedLocale = detectLocale();
        const promptBuilder = createSystemPromptBuilder({
          locale: detectedLocale,
          mode: executionMode === 'plan' ? 'plan' : 'default',
        });
        await promptBuilder.loadAgentsFile(config.workDir, getDefaultPersonalPath());
        promptBuilderRef.current = promptBuilder;
        const systemPrompt = buildSystemPromptWithContext(promptBuilder, {
          ...config,
          model: effectiveModel,
        });

        // 6. Create Session (with validated model)
        const session = createAgentSession({
          service: llmService,
          toolRegistry,
          systemPrompt,
          executionMode,
          maxIterations: 50,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          modelId: effectiveModel,
          onConfirmTool: async (request) => {
            // Show approval UI and wait for user decision
            return new Promise<boolean>((resolve) => {
              useUIStore.getState().showToolApproval({
                toolCallId: request.toolCall.id,
                toolName: request.toolCall.name,
                arguments: request.toolCall.arguments,
                resolve,
              });
            });
          },
        });

        sessionRef.current = session;

        // 7. Input Processor
        inputProcessorRef.current = createInputProcessor({
          workspaceRoot: config.workDir,
          maxFileSize: 1024 * 1024,
          maxFiles: 20,
          includeLineNumbers: true,
          includeLanguageHints: true,
        });

        // 8. Event Adapter
        adapterRef.current = createEventAdapter({
          conversationStore: useConversationStore.getState(),
          agentStore: useAgentStore.getState(),
          uiStore: useUIStore.getState(),
        });

        isReadyRef.current = true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        useAgentStore.getState().setError(err);
      }
    };

    initPromiseRef.current = init();

    return () => {
      sessionRef.current?.dispose();
      platformRef.current?.dispose();
      mcpManagerRef.current?.disconnectAll().catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useCallback(async (prompt: string) => {
    // Wait for initialization if needed
    if (initPromiseRef.current) {
      await initPromiseRef.current;
    }

    const session = sessionRef.current;
    const adapter = adapterRef.current;
    const inputProcessor = inputProcessorRef.current;

    if (!session || !adapter) {
      useAgentStore.getState().setError(new Error('Session not initialized'));
      return;
    }

    // Reset adapter state
    adapter.reset();

    // Add user message to store
    useConversationStore.getState().addUserMessage(prompt);
    useAgentStore.getState().setRunning();

    try {
      // Process file references
      let finalPrompt = prompt;
      if (inputProcessor) {
        const processed = await inputProcessor.process(prompt);
        finalPrompt = processed.message;
        if (processed.hasFiles) {
          finalPrompt = `${processed.message}\n\n## Referenced Files\n\n${processed.fileContents}`;
        }
      }

      // Execute and stream events
      for await (const event of session.execute(finalPrompt, {
        workspaceRoot: useConfigStore_getWorkDir(),
      })) {
        adapter.handleEvent(event);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      useAgentStore.getState().setError(err);
      useConversationStore.getState().addError(err);
    }
  }, []);

  const cancel = useCallback(() => {
    sessionRef.current?.cancel();
    useAgentStore.getState().setIdle();
  }, []);

  const clearHistory = useCallback(() => {
    sessionRef.current?.clearHistory();
    useConversationStore.getState().clearMessages();
  }, []);

  const confirmTool = useCallback((toolCallId: string, approved: boolean) => {
    sessionRef.current?.confirmTool(toolCallId, approved);
    useUIStore.getState().dismissToolApproval();
    if (approved) {
      useAgentStore.getState().setRunning();
    }
  }, []);

  const updateModel = useCallback((model: string) => {
    useConfigStore.getState().setConfig({ model });
    // Platform's Service uses ModelSelector which reads from ConfigManager,
    // so we just need to pass the new modelId to the session
    const session = sessionRef.current;
    if (session) {
      session.configure({ modelId: model });
    }
  }, []);

  const updateMode = useCallback((mode: ExecutionMode) => {
    const session = sessionRef.current;
    if (!session) return;
    const config = useConfigStore.getState().config;
    const locale = detectLocale();
    const builder = createSystemPromptBuilder({
      locale,
      mode: mode === 'plan' ? 'plan' : 'default',
    });
    // Reuse previously loaded AGENTS.md via sync rebuild
    if (promptBuilderRef.current) {
      builder.setAgentsContent(
        promptBuilderRef.current.getAgentsContent(),
        promptBuilderRef.current.getAgentsSource(),
      );
    }
    const systemPrompt = buildSystemPromptWithContext(builder, config);
    session.configure({ systemPrompt });
    session.setExecutionMode(mode);
  }, []);

  return {
    submit,
    cancel,
    clearHistory,
    confirmTool,
    updateModel,
    updateMode,
    isReady: isReadyRef.current,
  };
}

/** Helper to get workDir from config store */
function useConfigStore_getWorkDir(): string {
  return useConfigStore.getState().config.workDir;
}

/** Detect locale from environment */
function detectLocale(): 'en' | 'zh' {
  const lang = process.env.LANG ?? process.env.LANGUAGE ?? process.env.LC_ALL ?? '';
  return lang.startsWith('zh') ? 'zh' : 'en';
}

/** Build system prompt with runtime context appended */
function buildSystemPromptWithContext(builder: SystemPromptBuilder, config: CLIConfig): string {
  const base = builder.build();
  const context = [
    `\n\n---\n\n## Runtime Context`,
    `- Working directory: ${config.workDir}`,
    `- OS: ${process.platform} ${process.arch}`,
    `- Model: ${config.model}`,
    `- Provider: ${config.provider}`,
  ];
  return base + context.join('\n');
}
