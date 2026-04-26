/**
 * Agent Runner - Lightweight VSCode wrapper for AgentSession
 *
 * This class focuses on VSCode integration while delegating session management
 * to @neko/agent's AgentSession.
 *
 * Key responsibilities:
 * - VSCode EventEmitter integration for UI notifications
 * - Message queue management for concurrent requests
 * - Tool confirmation flow bridging
 *
 * All core agent functionality is delegated to AgentSession from @neko/agent.
 */

import * as vscode from 'vscode';
import { createServiceId, getLogger } from '../base';
import { createDefaultOperationToolAdapterRegistry } from './operationAdapters';

const logger = getLogger('AgentRunner');
import type { Platform } from '@neko/platform';
import { toSharedService } from '@neko/platform';
import type { ToolConfirmationRequest } from '@neko/agent';
import {
  AgentSession,
  createTaskManagerIdcTaskProjection,
  createAgentSessionWithRuntime,
  createNodeArtifactStore,
  createFileProjectMemoryManager,
  createCoreTools,
  SystemPromptBuilder,
  createSystemPromptBuilder,
  getDefaultPersonalPath,
  ToolGroupRegistry,
  ToolCategoryRegistry,
  MemoryWriteTool,
  createProviderExpressionPromptFragments,
  type ExecutionMode,
  type AgentEvent,
  type AgentEventType,
  type IRuntimeTaskManager,
  type PerceptionClassifyClient,
  type PerceptionDetectShotsClient,
  type PerceptionSimilarityClient,
  type PerceptionTranscribeClient,
} from '@neko/agent';
import type {
  IProjectMemoryManager,
  IOperationToolAdapterRegistry,
  ProviderGenerationCapability,
  PromptFragment,
  ChatMessage,
} from '@neko/shared';
import {
  getCapabilityDiscoveryService,
  getCapabilityRuntimeBindings,
} from '../bootstrap/capabilityBootstrap';
import * as nodePath from 'node:path';
import { IAgentContext } from './agentContext';
import type { HookManager } from './hookManager';
import { EngineClient } from '@neko/neko-client';

// =============================================================================
// Service Identifier
// =============================================================================

export const IAgentRunner = createServiceId<IAgentRunner>('agentRunner');

const ENGINE_EXTENSION_ID = 'neko.neko-engine';

// =============================================================================
// Agent Configuration
// =============================================================================

/**
 * Execution mode type (re-exported for convenience)
 */
export type { ExecutionMode };

/**
 * Re-export AgentEvent and AgentEventType from @neko/agent
 * This ensures type consistency across the codebase
 */
export type { AgentEvent, AgentEventType };

/**
 * Agent configuration
 */
export interface ProviderExpressionTargetConfig {
  readonly capability: ProviderGenerationCapability;
  readonly providerId?: string;
  readonly modelId?: string;
}

export interface IAgentConfig {
  /** Platform instance */
  platform: Platform;

  /** System prompt */
  systemPrompt?: string;

  /** Max iterations (prevent infinite loops) */
  maxIterations?: number;

  /** Whether to auto execute tools */
  autoExecuteTools?: boolean;

  /** Temperature */
  temperature?: number;

  /** Max tokens */
  maxTokens?: number;

  /** Model ID */
  modelId?: string;

  /** Selected media generation provider/model targets for ProviderCard expression context. */
  providerExpressionTargets?: readonly ProviderExpressionTargetConfig[];

  /**
   * Optional pre-created EngineClient. When omitted, AgentRunner lazily connects
   * to neko-engine via `neko.engine.ensureFrameServer` and @neko/neko-client.
   */
  engineClient?: EngineClient;

  /**
   * Extended thinking budget tokens (Claude only)
   * Set to enable extended thinking. Recommended: 10000-50000
   */
  thinkingBudget?: number;

  /**
   * Tool execution mode
   * - plan: Only generate plan, don't execute
   * - ask: Require user confirmation for each operation
   * - auto: Auto execute
   */
  executionMode?: ExecutionMode;

  /**
   * Hook manager for custom hooks from .hook/ directory
   * Must be initialized before configure() is called
   */
  hookManager?: HookManager;

  /**
   * Tool category registry for three-layer injection
   * If not provided, a new one will be created
   */
  toolCategoryRegistry?: ToolCategoryRegistry;

  /**
   * Workspace root path for AGENTS.md loading
   */
  workspaceRoot?: string;

  /**
   * Shared task plane owned by the host runtime.
   * Used to project IDC checklist artifacts into the same task surface that
   * powers UI task views and persistence.
   */
  taskManager?: IRuntimeTaskManager;

  /**
   * Stable conversation ID used for journal persistence.
   */
  conversationId?: string;

  /**
   * Optional operation adapter registry override. When omitted, extension
   * runtime installs the default timeline/canvas/model adapters.
   */
  operationToolAdapterRegistry?: IOperationToolAdapterRegistry;

  /**
   * Locale for system prompt (en/zh)
   */
  locale?: 'en' | 'zh';
}

// =============================================================================
// Agent Runner Interface
// =============================================================================

/**
 * Agent Runner interface
 */
export interface IAgentRunner extends vscode.Disposable {
  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Configure Agent
   * @param config Agent configuration
   */
  configure(config: IAgentConfig): Promise<void>;

  /**
   * Get current configuration
   */
  getConfig(): IAgentConfig | undefined;

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  /**
   * Execute user request
   * @param input User input
   * @param context Agent context
   * @returns Agent event stream
   */
  execute(input: string, context: IAgentContext): AsyncIterable<AgentEvent>;

  /**
   * Cancel current execution
   */
  cancel(): void;

  /**
   * Check if running
   */
  isRunning(): boolean;

  /**
   * Append a message to the running agent's context
   * If agent is not running, returns false
   * @param input User input to append
   * @returns true if message was queued, false if agent is not running
   */
  appendMessage(input: string): boolean;

  /**
   * Get pending messages count
   */
  getPendingMessagesCount(): number;

  /**
   * Clear all pending messages (user manual management)
   */
  clearPendingMessages(): void;

  // -------------------------------------------------------------------------
  // Context Management
  // -------------------------------------------------------------------------

  /**
   * Get current context token count
   * @returns Token count estimate
   */
  getContextTokenCount(): number;

  /**
   * Manually trigger context compression
   * @returns Compression result with before/after token counts
   */
  compressContext(): Promise<{
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  }>;

  // -------------------------------------------------------------------------
  // Tool Confirmation
  // -------------------------------------------------------------------------

  /**
   * Confirm tool execution
   * @param toolCallId Tool call ID
   * @param approved Whether approved
   */
  confirmTool(toolCallId: string, approved: boolean): void;

  /**
   * Get pending confirmations
   */
  getPendingConfirmations(): Array<{
    toolCallId: string;
    toolName: string;
    action: string;
    description: string;
    details: Record<string, unknown>;
  }>;

  // -------------------------------------------------------------------------
  // Conversation History
  // -------------------------------------------------------------------------

  /**
   * Get conversation history
   */
  getHistory(): ChatMessage[];

  /**
   * Clear conversation history
   */
  clearHistory(): void;

  /**
   * Add message to history
   */
  addMessage(message: ChatMessage, sourceEventIds?: readonly string[]): void;

  /**
   * Replace history in one shot, optionally carrying journal provenance.
   */
  loadHistory(messages: ChatMessage[], messageEventIds?: readonly (readonly string[])[]): void;

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  /** Agent start event */
  readonly onDidStart: vscode.Event<void>;

  /** Agent stop event */
  readonly onDidStop: vscode.Event<void>;

  /** Tool confirmation event */
  readonly onDidRequestConfirmation: vscode.Event<{
    toolCallId: string;
    toolName: string;
    action: string;
    description: string;
    details: Record<string, unknown>;
  }>;

  // -------------------------------------------------------------------------
  // ToolGroup Management
  // -------------------------------------------------------------------------

  /**
   * Get all registered ToolGroups
   */
  getToolSkills(): import('@neko/shared').ConfiguredToolGroup[];

  // -------------------------------------------------------------------------
  // Skill Injection
  // -------------------------------------------------------------------------

  /**
   * Wire an ISkillProvider into the session's meta tools.
   */
  setSkillProvider(provider: import('@neko/agent').ISkillProvider): void;

  /**
   * Re-sync capability-derived prompt fragments into the active session.
   * Shared registries update by reference; fragments need an explicit push.
   */
  refreshCapabilityRuntime(): void;

  /**
   * Apply a skill injection to the session context.
   * Merges the injection's system prompt into the conversation and
   * grants any specified tool allowances.
   */
  applySkillInjection(
    injection: import('@neko/agent').SkillInjection,
    skill?: import('@neko/shared').Skill,
  ): void;

  /**
   * Get the currently active skill (if any).
   * Delegates to AgentSession's SkillInjectionCoordinator.
   */
  getActiveSkill(): import('@neko/shared').Skill | undefined;

  /**
   * Clear the active skill — reverses all injection tracks.
   * Delegates to AgentSession's SkillInjectionCoordinator.
   */
  clearActiveSkill(): void;

  /**
   * Check if a tool is allowed by the active skill.
   * Returns true if no skill restrictions are active.
   */
  isToolAllowed(toolName: string): boolean;
}

// =============================================================================
// Agent Runner Implementation
// =============================================================================

/**
 * Agent Runner - Lightweight VSCode wrapper for AgentSession
 *
 * This class focuses on VSCode integration:
 * - VSCode events (onDidStart, onDidStop, onDidRequestConfirmation)
 * - Pending message queue management
 * - Tool confirmation UI bridge
 * - Conversation history management
 *
 * Session management is delegated to @neko/agent's AgentSession.
 */
export class AgentRunner implements IAgentRunner {
  private _config?: IAgentConfig;
  private _session?: AgentSession;
  private _promptBuilder?: SystemPromptBuilder;
  private _toolGroupRegistry?: ToolGroupRegistry;
  private _isRunning = false;
  private _skillProvider?: import('@neko/agent').ISkillProvider;
  private _projectMemoryManager?: IProjectMemoryManager;
  private _engineClient?: EngineClient;

  // Pending messages queue (for messages sent while agent is running)
  private _pendingMessages: string[] = [];

  // Pending tool confirmations
  private _pendingConfirmations = new Map<
    string,
    {
      toolCallId: string;
      toolName: string;
      action: string;
      description: string;
      details: Record<string, unknown>;
      confirmationToken?: string;
      resolve?: (approved: boolean) => void;
    }
  >();

  // Timeout timers for pending confirmations (5 min auto-reject)
  private _confirmationTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // VSCode event emitters
  private readonly _onDidStart = new vscode.EventEmitter<void>();
  private readonly _onDidStop = new vscode.EventEmitter<void>();
  private readonly _onDidRequestConfirmation = new vscode.EventEmitter<{
    toolCallId: string;
    toolName: string;
    action: string;
    description: string;
    details: Record<string, unknown>;
  }>();

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  get onDidStart(): vscode.Event<void> {
    return this._onDidStart.event;
  }

  get onDidStop(): vscode.Event<void> {
    return this._onDidStop.event;
  }

  get onDidRequestConfirmation(): vscode.Event<{
    toolCallId: string;
    toolName: string;
    action: string;
    description: string;
    details: Record<string, unknown>;
  }> {
    return this._onDidRequestConfirmation.event;
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  async configure(config: IAgentConfig): Promise<void> {
    this._config = config;

    // Split into initialization (heavy, once) and reconfiguration (lightweight, per turn)
    const needsInit = !this._session;
    if (needsInit) {
      await this._initializeSession(config);
    } else {
      this._reconfigureSession(config);
    }
  }

  /**
   * Heavy one-time initialization: load AGENTS.md, register core tools,
   * init project memory, and create the AgentSession.
   */
  private async _initializeSession(config: IAgentConfig): Promise<void> {
    // Create system prompt builder
    this._promptBuilder = createSystemPromptBuilder({
      locale: config.locale ?? 'en',
      mode: config.executionMode === 'plan' ? 'plan' : 'default',
    });

    // Load AGENTS.md if workspace root is provided
    if (config.workspaceRoot) {
      try {
        await this._promptBuilder.loadAgentsFile(config.workspaceRoot, getDefaultPersonalPath());
      } catch (err) {
        logger.warn('Failed to load AGENTS.md:', err);
      }
    }

    // Register core file/system tools (Read, Write, Bash, Grep, ListDirectory)
    const coreTools = createCoreTools({ defaultCwd: config.workspaceRoot });
    for (const tool of coreTools) {
      if (!config.platform.tools.has?.(tool.name)) {
        config.platform.tools.register(tool);
      }
    }

    // Initialize project memory manager (cross-session fact persistence)
    if (config.workspaceRoot) {
      try {
        const memoryFilePath = nodePath.join(config.workspaceRoot, '.neko', 'memory.md');
        const memoryManager = createFileProjectMemoryManager(memoryFilePath);
        await memoryManager.load();
        this._projectMemoryManager = memoryManager;
        config.platform.tools.register(new MemoryWriteTool(memoryManager));
      } catch (err) {
        logger.warn('Failed to initialize project memory:', err);
        this._projectMemoryManager = undefined;
      }
    } else {
      this._projectMemoryManager = undefined;
    }

    // Resolve system prompt + AGENTS.md overlay (PR3b: AGENTS.md is now
    // layered into the environment layer rather than replacing the base).
    const effectiveSystemPrompt = this._resolveSystemPrompt(config);
    const agentsOverride = this._resolveAgentsOverride();
    // PR3e: aggregate sub-package prompt fragments from every registered
    // AgentCapabilityProvider and pass them through as a session config
    // field so the SubpackageFragmentsModule can project them into the
    // environment layer.
    const promptFragments = this._resolvePromptFragments();
    const capabilityRuntime = getCapabilityRuntimeBindings();
    const operationToolAdapterRegistry =
      config.operationToolAdapterRegistry ?? createDefaultOperationToolAdapterRegistry();
    const toolCategoryRegistry =
      config.toolCategoryRegistry ?? capabilityRuntime.toolCategoryRegistry;
    this._syncCapabilityToolCategories(toolCategoryRegistry);
    this._toolGroupRegistry = capabilityRuntime.toolGroupRegistry;

    // Get custom hooks from HookManager (if available)
    const customHooks = config.hookManager?.getHooks() ?? [];
    // Create service from platform, adapted to @neko/shared IService
    const service = toSharedService(config.platform.createService());

    // Create agent session
    this._session = createAgentSessionWithRuntime({
      service,
      toolRegistry: config.platform.tools,
      systemPrompt: effectiveSystemPrompt,
      ...(agentsOverride !== undefined && { agentsOverride }),
      executionMode: config.executionMode ?? 'auto',
      maxIterations: config.maxIterations,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      thinkingBudget: config.thinkingBudget,
      modelId: config.modelId,
      hooks: customHooks.length > 0 ? customHooks : undefined,
      runtime: {
        workflowRuntime: {
          ...(capabilityRuntime.skillRegistry || capabilityRuntime.skillService
            ? {
                stageTracking: {
                  ...(capabilityRuntime.skillRegistry
                    ? { skillRegistry: capabilityRuntime.skillRegistry }
                    : {}),
                  ...(capabilityRuntime.skillService
                    ? { skillService: capabilityRuntime.skillService }
                    : {}),
                },
              }
            : {}),
          ...(config.taskManager
            ? {
                idcTaskProjection: createTaskManagerIdcTaskProjection({
                  store: config.taskManager,
                }),
              }
            : {}),
        },
        capabilityRuntime: {
          ...(capabilityRuntime.skillService
            ? { skillService: capabilityRuntime.skillService }
            : {}),
          ...(capabilityRuntime.skillRegistry
            ? { skillRegistry: capabilityRuntime.skillRegistry }
            : {}),
          ...(capabilityRuntime.toolGroupRegistry
            ? { toolGroupRegistry: capabilityRuntime.toolGroupRegistry }
            : {}),
          ...(promptFragments !== undefined ? { promptFragments } : {}),
          ...(toolCategoryRegistry ? { toolCategoryRegistry } : {}),
          ...(capabilityRuntime.providerCardRegistry
            ? { providerCardRegistry: capabilityRuntime.providerCardRegistry }
            : {}),
          operationToolAdapterRegistry,
        },
        artifactStore: createNodeArtifactStore({
          ...(config.workspaceRoot ? { workspaceRoot: config.workspaceRoot } : {}),
        }),
        feedbackLoop: {
          ...(this._projectMemoryManager
            ? { projectMemoryManager: this._projectMemoryManager }
            : {}),
        },
      },
      ...(config.conversationId && { conversationId: config.conversationId }),
      perceptionClients: {
        transcribe: this._createEnginePerceptionClient(config),
        similarity: this._createEnginePerceptionClient(config),
        classify: this._createEnginePerceptionClient(config),
        detectShots: this._createEnginePerceptionClient(config),
      },
      onConfirmTool: async (request) => {
        return this._handleToolConfirmation(request);
      },
      onValidationWarning: (warning) => {
        logger.warn('Validation warning:', warning.message);
      },
      onValidationError: (error) => {
        logger.error('Validation error:', { message: error.message, details: error.details });
      },
    });

    // Wire skill provider into meta tools if available
    if (this._skillProvider) {
      this._session.setSkillProvider(this._skillProvider);
    }
  }

  private _createEnginePerceptionClient(
    config: IAgentConfig,
  ): PerceptionTranscribeClient &
    PerceptionSimilarityClient &
    PerceptionClassifyClient &
    PerceptionDetectShotsClient {
    if (config.engineClient) {
      return config.engineClient;
    }

    return {
      perception: {
        transcribe: async (request) => {
          const client = await this._getEngineClient();
          return client.perception.transcribe(request);
        },
        similarity: async (request) => {
          const client = await this._getEngineClient();
          return client.perception.similarity(request);
        },
        classify: async (request) => {
          const client = await this._getEngineClient();
          return client.perception.classify(request);
        },
        detectShots: async (request) => {
          const client = await this._getEngineClient();
          return client.perception.detectShots(request);
        },
      },
    };
  }

  private async _getEngineClient(): Promise<EngineClient> {
    if (this._engineClient) {
      return this._engineClient;
    }

    const extension = vscode.extensions.getExtension(ENGINE_EXTENSION_ID);
    if (!extension) {
      throw new Error(`Extension ${ENGINE_EXTENSION_ID} not installed`);
    }

    if (!extension.isActive) {
      await extension.activate();
    }

    const result = await vscode.commands.executeCommand<{ port: number } | null>(
      'neko.engine.ensureFrameServer',
    );
    if (!result) {
      throw new Error('Failed to start neko-engine Frame Server');
    }

    this._engineClient = new EngineClient(result.port, { timeout: 300_000 });
    return this._engineClient;
  }

  /**
   * Lightweight per-turn reconfiguration: update system prompt, model, and
   * temperature without rebuilding the session or reloading resources.
   */
  private _reconfigureSession(config: IAgentConfig): void {
    if (!this._session) return;

    // Rebuild system prompt with latest config (canvas context etc.)
    const effectiveSystemPrompt = this._resolveSystemPrompt(config);

    // Use AgentSession.configure() for partial updates
    this._session.configure({
      systemPrompt: effectiveSystemPrompt,
      modelId: config.modelId,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      thinkingBudget: config.thinkingBudget,
      maxIterations: config.maxIterations,
      executionMode: config.executionMode ?? 'auto',
    });
  }

  getConfig(): IAgentConfig | undefined {
    return this._config;
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  async *execute(input: string, context: IAgentContext): AsyncIterable<AgentEvent> {
    if (!this._config || !this._session) {
      yield { type: 'error', error: new Error('Agent not configured') };
      return;
    }

    // If already running, queue the message
    if (this._isRunning) {
      this._pendingMessages.push(input);
      yield {
        type: 'messageQueued',
        content: `Message queued (${this._pendingMessages.length} pending)`,
      };
      return;
    }

    this._isRunning = true;
    this._onDidStart.fire();

    try {
      let currentInput = input;

      while (currentInput) {
        // Execute via AgentSession - directly yield events (types are now unified)
        for await (const event of this._session.execute(currentInput, {
          workspaceRoot: context.workspaceRoot,
          projectType: context.projectType,
          activeFile: context.activeEditor?.uri?.toString(),
          metadata: buildExecutionMetadata(context),
        })) {
          yield event;
        }

        // Process pending messages
        if (this._pendingMessages.length > 0) {
          currentInput = this._pendingMessages.shift()!;

          yield {
            type: 'text',
            content: `\n\n---\n**Processing queued message...**\n\n`,
          };
        } else {
          currentInput = '';
        }
      }

      // Emit done event
      const totalTokens = this.getContextTokenCount();
      yield {
        type: 'done',
        usage: {
          inputTokens: totalTokens,
          outputTokens: 0,
          totalTokens,
        },
      };
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      this._isRunning = false;
      this._onDidStop.fire();
    }
  }

  cancel(): void {
    this._session?.cancel();
    this._pendingMessages = [];
    // Clear all confirmation timers
    for (const timer of this._confirmationTimers.values()) {
      clearTimeout(timer);
    }
    this._confirmationTimers.clear();
    // Reject all pending tool confirmations so Promises don't hang
    for (const pending of this._pendingConfirmations.values()) {
      pending.resolve?.(false);
    }
    this._pendingConfirmations.clear();
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  appendMessage(input: string): boolean {
    if (!this._isRunning) {
      return false;
    }
    this._pendingMessages.push(input);
    return true;
  }

  getPendingMessagesCount(): number {
    return this._pendingMessages.length;
  }

  clearPendingMessages(): void {
    this._pendingMessages = [];
  }

  // -------------------------------------------------------------------------
  // Context Management
  // -------------------------------------------------------------------------

  getContextTokenCount(): number {
    if (this._session) {
      return this._session.getTokenCount();
    }
    return 0;
  }

  async compressContext(): Promise<{
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  }> {
    if (!this._session) {
      return { originalTokens: 0, compressedTokens: 0, ratio: 1 };
    }

    const result = await this._session.compressContext();
    return result;
  }

  // -------------------------------------------------------------------------
  // Tool Confirmation
  // -------------------------------------------------------------------------

  confirmTool(toolCallId: string, approved: boolean): void {
    const pending = this._pendingConfirmations.get(toolCallId);
    if (pending) {
      // Clear the timeout timer
      const timer = this._confirmationTimers.get(toolCallId);
      if (timer) {
        clearTimeout(timer);
        this._confirmationTimers.delete(toolCallId);
      }
      // Resolve the Promise — this triggers AgentSession._handleToolConfirmation.then
      // which calls AgentSession.confirmTool internally. No need to call it directly.
      pending.resolve?.(approved);
      this._pendingConfirmations.delete(toolCallId);
    } else {
      logger.warn('No pending confirmation found for toolCallId:', toolCallId);
    }
  }

  getPendingConfirmations(): Array<{
    toolCallId: string;
    toolName: string;
    action: string;
    description: string;
    details: Record<string, unknown>;
  }> {
    return Array.from(this._pendingConfirmations.values()).map((p) => ({
      toolCallId: p.toolCallId,
      toolName: p.toolName,
      action: p.action,
      description: p.description,
      details: p.details,
    }));
  }

  // -------------------------------------------------------------------------
  // Conversation History
  // -------------------------------------------------------------------------

  getHistory(): ChatMessage[] {
    return this._session?.getHistory() ?? [];
  }

  clearHistory(): void {
    this._session?.clearHistory();
  }

  addMessage(message: ChatMessage, sourceEventIds?: readonly string[]): void {
    this._session?.addMessage(message, sourceEventIds);
  }

  loadHistory(messages: ChatMessage[], messageEventIds?: readonly (readonly string[])[]): void {
    this._session?.loadHistory(messages, messageEventIds);
  }

  // -------------------------------------------------------------------------
  // ToolGroup Management
  // -------------------------------------------------------------------------

  getToolSkills(): import('@neko/shared').ConfiguredToolGroup[] {
    if (!this._toolGroupRegistry) {
      return [];
    }
    return this._toolGroupRegistry.list().map((ts) => ({ ...ts }));
  }

  // -------------------------------------------------------------------------
  // Skill Injection
  // -------------------------------------------------------------------------

  setSkillProvider(provider: import('@neko/agent').ISkillProvider): void {
    this._skillProvider = provider;
    this._session?.setSkillProvider(provider);
  }

  refreshCapabilityRuntime(): void {
    if (!this._session) {
      return;
    }

    const capabilityRuntime = getCapabilityRuntimeBindings();
    const toolCategoryRegistry =
      this._config?.toolCategoryRegistry ?? capabilityRuntime.toolCategoryRegistry;
    this._syncCapabilityToolCategories(toolCategoryRegistry);
    this._session.setPromptFragments(this._resolvePromptFragments());
  }

  applySkillInjection(
    injection: import('@neko/agent').SkillInjection,
    skill?: import('@neko/agent').Skill,
  ): void {
    this._session?.applySkillInjection(injection, skill);
  }

  getActiveSkill(): import('@neko/shared').Skill | undefined {
    return this._session?.getActiveSkill();
  }

  clearActiveSkill(): void {
    this._session?.clearActiveSkill();
  }

  isToolAllowed(toolName: string): boolean {
    return this._session?.isToolAllowed(toolName) ?? true;
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  private _resolveSystemPrompt(config: IAgentConfig): string {
    // Custom override takes precedence
    if (config.systemPrompt) {
      return config.systemPrompt;
    }

    // PR3b: use the base-only path so AGENTS.md doesn't get merged into
    // the base prompt. AGENTS.md content is routed via agentsOverride on
    // the session config and layered in as an environment section so the
    // builtin protocol stays visible alongside user overrides.
    if (this._promptBuilder) {
      return this._promptBuilder.buildBaseOnly();
    }

    // Should not reach here — fallback
    return '';
  }

  /**
   * AGENTS.md overlay content for the current session, or undefined when
   * no AGENTS.md file has been loaded. Consumed by the session initializer
   * as an environment-layer overlay on top of the base prompt.
   */
  private _resolveAgentsOverride(): string | undefined {
    return this._promptBuilder?.buildAgentsOverlay() ?? undefined;
  }

  /**
   * PR3e: aggregate sub-package prompt fragments from every registered
   * capability provider. Returns undefined (not empty array) when no
   * fragment is available so `createAgentSession` receives the field
   * only when there's something to set.
   *
   * Uses the best-effort `getCapabilityDiscoveryService` — if bootstrap
   * hasn't run yet (CLI context, tests) the function throws; we swallow
   * to keep the session bring-up resilient.
   */
  private _resolvePromptFragments(): readonly PromptFragment[] | undefined {
    try {
      const discovery = getCapabilityDiscoveryService();
      const capabilityFragments = discovery.getAllPromptFragments();
      const providerCards = getCapabilityRuntimeBindings().providerCardRegistry?.list() ?? [];
      const providerFragments = this._resolveProviderExpressionFragments(providerCards);
      const fragments = [...capabilityFragments, ...providerFragments];
      return fragments.length > 0 ? fragments : undefined;
    } catch {
      return undefined;
    }
  }

  private _resolveProviderExpressionFragments(
    providerCards: readonly import('@neko/shared').ProviderCard[],
  ): readonly PromptFragment[] {
    const targets =
      this._config?.providerExpressionTargets?.filter(
        (target) => target.providerId || target.modelId,
      ) ?? [];
    if (targets.length === 0) {
      return createProviderExpressionPromptFragments({ cards: providerCards, mode: 'candidates' });
    }

    return targets.flatMap((target) =>
      createProviderExpressionPromptFragments({
        cards: providerCards,
        mode: 'selected',
        capability: target.capability,
        ...(target.providerId ? { providerId: target.providerId } : {}),
        ...(target.modelId ? { modelId: target.modelId } : {}),
        fragmentId: `provider:expression-context:${target.capability}`,
      }),
    );
  }

  private _syncCapabilityToolCategories(toolCategoryRegistry?: ToolCategoryRegistry): void {
    if (!toolCategoryRegistry) {
      return;
    }

    try {
      getCapabilityDiscoveryService().syncToolCategories(toolCategoryRegistry);
    } catch {
      // Capability bootstrap is optional in CLI/tests. When absent, the
      // session falls back to its own registry initialization semantics.
    }
  }

  private _handleToolConfirmation(request: ToolConfirmationRequest): Promise<boolean> {
    return new Promise((resolve) => {
      const toolCallId = request.toolCall.id;

      this._pendingConfirmations.set(toolCallId, {
        toolCallId,
        toolName: request.toolCall.name,
        action: request.action,
        description: request.description,
        details: request.details,
        confirmationToken: request.confirmationToken,
        resolve, // Store resolve so confirmTool() can call it
      });

      // Auto-reject after 5 minutes to prevent hanging Promises
      const CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000;
      const timer = setTimeout(() => {
        if (this._pendingConfirmations.has(toolCallId)) {
          logger.warn(`Tool confirmation timed out for ${request.toolCall.name} (${toolCallId})`);
          this._pendingConfirmations.delete(toolCallId);
          this._confirmationTimers.delete(toolCallId);
          resolve(false);
        }
      }, CONFIRMATION_TIMEOUT_MS);
      this._confirmationTimers.set(toolCallId, timer);

      this._onDidRequestConfirmation.fire({
        toolCallId,
        toolName: request.toolCall.name,
        action: request.action,
        description: request.description,
        details: request.details,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  dispose(): void {
    this.cancel(); // Also rejects pending confirmations
    this._session?.dispose();
    this._isRunning = false;
    this._onDidStart.dispose();
    this._onDidStop.dispose();
    this._onDidRequestConfirmation.dispose();
  }
}
function buildExecutionMetadata(context: IAgentContext): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = { ...(context.metadata ?? {}) };

  if (context.multimodalContextPacket) {
    metadata['multimodalContextPacket'] = context.multimodalContextPacket;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}
