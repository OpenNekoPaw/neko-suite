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
} from '@neko/agent';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CLIConfig } from '../core/types';
import { createLLMServiceAdapter, LLMServiceAdapter } from '../core/llm-service-adapter';
import type { IService } from '@neko/shared';
import { useConfigStore } from '../stores/config-store';
import { useAgentStore } from '../stores/agent-store';
import { useConversationStore } from '../stores/conversation-store';
import { useUIStore } from '../stores/ui-store';
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
  const serviceAdapterRef = useRef<LLMServiceAdapter | null>(null);
  const isReadyRef = useRef(false);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  // Initialize session on mount
  useEffect(() => {
    const init = async () => {
      try {
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

        // 4. LLM Service
        const llmService = createLLMServiceAdapter(config, service);
        if (llmService instanceof LLMServiceAdapter) {
          serviceAdapterRef.current = llmService;
        }

        // 5. System Prompt
        const executionMode = useAgentStore.getState().executionMode;
        const promptBuilder = createSystemPromptBuilder({
          locale: 'en',
          mode: executionMode === 'plan' ? 'plan' : 'default',
        });
        await promptBuilder.loadAgentsFile(config.workDir, getDefaultPersonalPath());
        const systemPrompt = promptBuilder.build();

        // 6. Create Session
        const session = createAgentSession({
          service: llmService,
          toolRegistry,
          systemPrompt,
          executionMode,
          maxIterations: 50,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
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
    const currentConfig = useConfigStore.getState().config;
    const newConfig = { ...currentConfig, model };
    useConfigStore.getState().setConfig({ model });
    if (serviceAdapterRef.current) {
      serviceAdapterRef.current.rebuild(newConfig);
    }
  }, []);

  return {
    submit,
    cancel,
    clearHistory,
    confirmTool,
    updateModel,
    isReady: isReadyRef.current,
  };
}

/** Helper to get workDir from config store */
function useConfigStore_getWorkDir(): string {
  return useConfigStore.getState().config.workDir;
}
