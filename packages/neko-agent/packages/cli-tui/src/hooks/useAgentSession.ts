/**
 * useAgentSession Hook
 *
 * Manages AgentSession lifecycle: initialization, execution, cleanup.
 * Mirrors the initialization pattern from @neko/cli runner.ts
 * but exposes it as a React hook for Ink components.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import {
  MCPManager,
  createAllMCPTools,
  createPlanModeIdcMetadata,
  createFileProjectMemoryManager,
  createSkillService,
  createNodeSkillLoader,
  ToolRegistry,
  createSystemPromptBuilder,
  getDefaultPersonalPath,
  createInputProcessor,
  createCoreTools,
  mergeIdcExecutionMetadata,
  type IAgentSession,
  type InputProcessor,
  type SystemPromptBuilder,
  type SkillService,
  type IRuntimeTaskManager,
} from '@neko/agent';
import { createAgentSessionWithRuntime } from '@neko/agent/runtime';
import { type Platform } from '@neko/platform';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CLIConfig } from '../core/types';
import type { ExecutionMode } from '../types/state';
import type { IService } from '@neko/shared';
import { getProviderModels, updateDefaultModel } from '../core/config';
import { createCLIPlatform, createCLITaskManager } from '../core/platform-bootstrap';
import { createCliAgentRuntime } from '../core/runtime-bootstrap';
import { loadSkillArtifactsAsSkills } from '../core/skill-artifacts';
import { useConfigStore } from '../stores/config-store';
import { useAgentStore } from '../stores/agent-store';
import { useConversationStore } from '../stores/conversation-store';
import { useUIStore, type SelectionMenuItem } from '../stores/ui-store';
import { createEventAdapter, type IEventAdapter } from '../adapters/event-adapter';
import {
  createTuiSlashCommandCatalog,
  type TuiSlashCommandOption,
} from '../core/slash-command-catalog';

export interface UseAgentSessionOptions {
  readonly config: CLIConfig;
  /** Optional Platform Service (from VSCode extension) */
  readonly service?: IService;
  /** Optional shared task plane provided by the host bootstrap */
  readonly taskManager?: IRuntimeTaskManager;
}

export interface AgentSessionHandle {
  /** Submit a prompt to the agent */
  submit: (
    prompt: string,
    executionOverrides?: { metadata?: Record<string, unknown> },
  ) => Promise<void>;
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
  /** Activate a skill by name; returns false if skill not found */
  activateSkill: (name: string) => Promise<boolean>;
  /** Deactivate the currently active skill */
  deactivateSkill: () => void;
  /** Skill service (for slash commands) */
  readonly getSkillService: () => SkillService | undefined;
  /** Tool registry (for slash commands) */
  readonly getToolRegistry: () => ToolRegistry | undefined;
  /** Slash command catalog for TUI autocomplete */
  readonly slashCommands: readonly TuiSlashCommandOption[];
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
  const { config, service, taskManager: providedTaskManager } = options;
  const sessionRef = useRef<IAgentSession | null>(null);
  const adapterRef = useRef<IEventAdapter | null>(null);
  const inputProcessorRef = useRef<InputProcessor | null>(null);
  const mcpManagerRef = useRef<MCPManager | null>(null);
  const platformRef = useRef<Platform | null>(null);
  const promptBuilderRef = useRef<SystemPromptBuilder | null>(null);
  const skillServiceRef = useRef<ReturnType<typeof createSkillService> | null>(null);
  const toolRegistryRef = useRef<ToolRegistry | null>(null);
  const isReadyRef = useRef(false);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const [slashCommands, setSlashCommands] = useState<readonly TuiSlashCommandOption[]>(
    createTuiSlashCommandCatalog(),
  );

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
        toolRegistryRef.current = toolRegistry;
        const mcpTools = await createAllMCPTools(mcpManager);
        toolRegistry.registerMany(mcpTools);

        const memoryFilePath = path.join(config.workDir, '.neko', 'memory.md');
        const projectMemoryManager = createFileProjectMemoryManager(memoryFilePath);
        await projectMemoryManager.load();

        const coreTools = createCoreTools({
          defaultCwd: config.workDir,
          projectMemoryManager,
        });
        toolRegistry.registerMany(coreTools);

        // 3. Skills
        let skillService: ReturnType<typeof createSkillService> | undefined;
        if (config.skillsDir) {
          const skillLoader = createNodeSkillLoader(fs, path);
          skillService = createSkillService();
          skillServiceRef.current = skillService;
          const loadedSkills = await loadSkillArtifactsAsSkills(skillLoader, config.skillsDir);
          for (const skill of loadedSkills) {
            skillService.registry.registerSkill(skill);
          }
          setSlashCommands(createTuiSlashCommandCatalog(loadedSkills));
        } else {
          setSlashCommands(createTuiSlashCommandCatalog());
        }

        // 4. LLM Service — use Platform for multi-provider routing
        let llmService: IService;
        const taskManager = providedTaskManager ?? createCLITaskManager();
        if (service) {
          // Extension mode: use injected service directly
          llmService = service;
        } else {
          // Standalone CLI mode: create Platform with media generation support
          const cliPlatform = createCLIPlatform({
            workspacePath: config.workDir,
            toolRegistry,
            taskManager,
          });
          platformRef.current = cliPlatform.platform;
          llmService = cliPlatform.service;
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
        const session = createAgentSessionWithRuntime({
          service: llmService,
          toolRegistry,
          systemPrompt,
          executionMode,
          maxIterations: 50,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          modelId: effectiveModel,
          runtime: createCliAgentRuntime({
            workspaceRoot: config.workDir,
            taskManager,
            ...(skillService ? { skillService } : {}),
            projectMemoryManager,
          }),
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
              // apply() is async (shell execution), fire-and-forget for sync callback
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

  const submit = useCallback(
    async (prompt: string, executionOverrides?: { metadata?: Record<string, unknown> }) => {
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

        const metadata = mergeIdcExecutionMetadata(
          session.getExecutionMode() === 'plan' ? createPlanModeIdcMetadata() : undefined,
          executionOverrides?.metadata,
        );

        // Execute and stream events
        for await (const event of session.execute(finalPrompt, {
          workspaceRoot: useConfigStore_getWorkDir(),
          ...(metadata ? { metadata } : {}),
        })) {
          adapter.handleEvent(event);
        }

        // Trigger plan review after plan-mode execution completes
        if (useAgentStore.getState().executionMode === 'plan') {
          useUIStore.getState().showPlanReview();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        useAgentStore.getState().setError(err);
        useConversationStore.getState().addError(err);
      }
    },
    [],
  );

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

  const activateSkill = useCallback(async (name: string): Promise<boolean> => {
    const skillService = skillServiceRef.current;
    const session = sessionRef.current;
    if (!skillService || !session) return false;

    const skill = skillService.registry.getSkill(name);
    if (!skill) return false;

    const injection = await skillService.apply(skill);
    session.applySkillInjection(injection, skill);
    useAgentStore.getState().setActiveSkill(name);
    return true;
  }, []);

  const deactivateSkill = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.clearActiveSkill();
    useAgentStore.getState().setActiveSkill(null);
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
    activateSkill,
    deactivateSkill,
    getSkillService: () => skillServiceRef.current ?? undefined,
    getToolRegistry: () => toolRegistryRef.current ?? undefined,
    slashCommands,
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
