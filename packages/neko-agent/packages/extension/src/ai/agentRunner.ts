/**
 * Agent Runner - Lightweight VSCode wrapper for AgentSession
 *
 * This class focuses on VSCode integration while delegating session state
 * management to @neko/agent's AgentSessionRunner.
 *
 * Key responsibilities:
 * - VSCode EventEmitter integration for UI notifications
 * - Host resource assembly for AgentSession creation
 * - Tool confirmation UI event bridging
 *
 * Core execution state is delegated to @neko/agent.
 */

import * as vscode from 'vscode';
import { createServiceId, getLogger } from '../base';
import type { Platform } from '@neko/platform';
import { toSharedService } from '@neko/platform';
import {
  buildAgentSessionExecutionContext,
  createAgentRuntimeSessionController,
  createAgentRunnerEventEmitter,
  createAgentSessionRunner,
  type AgentRunnerEventEmitter,
  type AgentRunnerConfirmationRequest,
  type AgentRunnerPort,
  type AgentRunnerPortEvent,
  type AgentRuntimeSessionController,
  type AgentRuntimeSessionControllerTarget,
  type AgentRuntimeSessionAssemblyInput,
  type ProviderExpressionTargetConfig,
  type SubAgentRuntimeCoordinator,
} from '@neko/agent/runtime';
import type {
  ToolCategoryRegistry,
  ExecutionMode,
  AgentEvent,
  AgentEventType,
  IRuntimeTaskManager,
  SubAgentEvent,
} from '@neko/agent';
import type { IOperationToolAdapterRegistry, ChatMessage } from '@neko/shared';
import {
  getCapabilityDiscoveryService,
  getCapabilityRuntimeBindings,
} from '../bootstrap/capabilityBootstrap';
import { IAgentContext } from './agentContext';
import type { HookManager } from './hookManager';
import type { EngineClient } from '@neko/neko-client/EngineClient';
import {
  getEngineClientProvider,
  type IEngineClientProvider,
} from '../services/engineClientProvider';

const logger = getLogger('AgentRunner');

// =============================================================================
// Service Identifier
// =============================================================================

export const IAgentRunner = createServiceId<IAgentRunner>('agentRunner');

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
export interface IAgentRunner extends AgentRunnerPort<IAgentConfig, IAgentContext> {
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
  readonly onDidRequestConfirmation: vscode.Event<AgentRunnerConfirmationRequest>;

  /** SubAgent lifecycle event */
  readonly onDidSubAgentEvent: vscode.Event<SubAgentEvent>;

  /**
   * Host-agnostic runner event stream.
   *
   * TODO(P1): Move Extension consumers from individual VSCode events to this
   * port event where possible, keeping VSCode Event only as adapter surface.
   */
  readonly onDidRunnerEvent: vscode.Event<AgentRunnerPortEvent>;

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

export interface AgentRunnerDeps {
  engineClientProvider?: IEngineClientProvider;
  subAgentRuntime: SubAgentRuntimeCoordinator;
  createRuntimeController?: (
    target: AgentRuntimeSessionControllerTarget,
  ) => AgentRuntimeSessionController;
}

/**
 * Agent Runner - Lightweight VSCode wrapper for AgentSession
 *
 * This class focuses on VSCode integration:
 * - VSCode events (onDidStart, onDidStop, onDidRequestConfirmation)
 * - Host resource assembly (VSCode, neko-engine, capability bootstrap)
 * - Tool confirmation UI event bridge
 *
 * Session state management is delegated to @neko/agent's AgentSessionRunner.
 */
export class AgentRunner implements IAgentRunner {
  private _config?: IAgentConfig;
  private _skillProvider?: import('@neko/agent').ISkillProvider;
  private readonly _engineClientProvider: IEngineClientProvider;
  private readonly _subAgentRuntime: SubAgentRuntimeCoordinator;
  private _subAgentEventBridge?: () => void;

  // VSCode event emitters
  private readonly _onDidStart = new vscode.EventEmitter<void>();
  private readonly _onDidStop = new vscode.EventEmitter<void>();
  private readonly _onDidRequestConfirmation =
    new vscode.EventEmitter<AgentRunnerConfirmationRequest>();
  private readonly _onDidSubAgentEvent = new vscode.EventEmitter<SubAgentEvent>();
  private readonly _runnerEvents: AgentRunnerEventEmitter<AgentRunnerPortEvent> =
    createAgentRunnerEventEmitter();
  private readonly _sessionRunner = createAgentSessionRunner<IAgentContext>({
    buildExecutionContext: (context) => this._buildExecutionContext(context),
    onDidStart: () => this._emitStart(),
    onDidStop: () => this._emitStop(),
    onDidRequestConfirmation: (request) => this._emitConfirmation(request),
    onMissingConfirmation: (toolCallId) =>
      logger.warn('No pending confirmation found for toolCallId:', toolCallId),
    onConfirmationTimeout: (request) =>
      logger.warn(`Tool confirmation timed out for ${request.toolName} (${request.toolCallId})`),
    timer: {
      set: (callback, ms) => setTimeout(callback, ms),
      clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  });
  private readonly _runtimeController: AgentRuntimeSessionController;

  constructor(deps: AgentRunnerDeps) {
    this._engineClientProvider = deps.engineClientProvider ?? getEngineClientProvider();
    this._subAgentRuntime = deps.subAgentRuntime;
    this._runtimeController = (deps.createRuntimeController ?? createAgentRuntimeSessionController)(
      this._sessionRunner,
    );
    this._ensureSubAgentEventBridge();
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  get onDidStart(): vscode.Event<void> {
    return this._onDidStart.event;
  }

  get onDidStop(): vscode.Event<void> {
    return this._onDidStop.event;
  }

  get onDidRequestConfirmation(): vscode.Event<AgentRunnerConfirmationRequest> {
    return this._onDidRequestConfirmation.event;
  }

  get onDidSubAgentEvent(): vscode.Event<SubAgentEvent> {
    return this._onDidSubAgentEvent.event;
  }

  get onDidRunnerEvent(): vscode.Event<AgentRunnerPortEvent> {
    return this._runnerEvents.event;
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  async configure(config: IAgentConfig): Promise<void> {
    this._config = config;

    await this._runtimeController.configure(this._createRuntimeSessionAssemblyInput(config));
    if (this._skillProvider) {
      this._sessionRunner.setSkillProvider(this._skillProvider);
    }
  }

  private _createRuntimeSessionAssemblyInput(
    config: IAgentConfig,
  ): AgentRuntimeSessionAssemblyInput {
    return {
      createService: () => toSharedService(config.platform.createService()),
      toolRegistry: config.platform.tools,
      systemPrompt: config.systemPrompt,
      maxIterations: config.maxIterations,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      modelId: config.modelId,
      thinkingBudget: config.thinkingBudget,
      executionMode: config.executionMode,
      hookSource: config.hookManager,
      workspaceRoot: config.workspaceRoot,
      taskManager: config.taskManager,
      conversationId: config.conversationId,
      operationToolAdapterRegistry: config.operationToolAdapterRegistry,
      locale: config.locale,
      providerExpressionTargets: config.providerExpressionTargets,
      capabilityRuntime: getCapabilityRuntimeBindings(),
      getCapabilityPromptFragments: () => getCapabilityDiscoveryService().getAllPromptFragments(),
      toolCategoryRegistry: config.toolCategoryRegistry,
      getPerceptionClients: () =>
        this._engineClientProvider.createPerceptionClients(config.engineClient),
      subAgentRuntime: this._subAgentRuntime,
      syncToolCategories: (registry) => {
        getCapabilityDiscoveryService().syncToolCategories(registry);
      },
      onConfirmTool: async (request) => this._sessionRunner.handleToolConfirmation(request),
      onValidationWarning: (warning) => {
        logger.warn('Validation warning:', warning.message);
      },
      onValidationError: (error) => {
        logger.error('Validation error:', { message: error.message, details: error.details });
      },
      logger: {
        warn: (message, error) => logger.warn(message, error),
        error: (message, details) => logger.error(message, details),
      },
    };
  }

  getConfig(): IAgentConfig | undefined {
    return this._config;
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  execute(input: string, context: IAgentContext): AsyncIterable<AgentEvent> {
    return this._sessionRunner.execute(input, context);
  }

  cancel(): void {
    this._sessionRunner.cancel();
    this._runnerEvents.fire({ type: 'cancel' });
  }

  isRunning(): boolean {
    return this._sessionRunner.isRunning();
  }

  appendMessage(input: string): boolean {
    return this._sessionRunner.appendMessage(input);
  }

  getPendingMessagesCount(): number {
    return this._sessionRunner.getPendingMessagesCount();
  }

  clearPendingMessages(): void {
    this._sessionRunner.clearPendingMessages();
  }

  // -------------------------------------------------------------------------
  // Context Management
  // -------------------------------------------------------------------------

  getContextTokenCount(): number {
    return this._sessionRunner.getContextTokenCount();
  }

  async compressContext(): Promise<{
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  }> {
    const result = await this._sessionRunner.compressContext();
    this._runnerEvents.fire({ type: 'contextCompressed', result });
    return result;
  }

  // -------------------------------------------------------------------------
  // Tool Confirmation
  // -------------------------------------------------------------------------

  confirmTool(toolCallId: string, approved: boolean): void {
    this._sessionRunner.confirmTool(toolCallId, approved);
  }

  getPendingConfirmations(): Array<{
    toolCallId: string;
    toolName: string;
    action: string;
    description: string;
    details: Record<string, unknown>;
  }> {
    return this._sessionRunner.getPendingConfirmations();
  }

  // -------------------------------------------------------------------------
  // Conversation History
  // -------------------------------------------------------------------------

  getHistory(): ChatMessage[] {
    return this._sessionRunner.getHistory();
  }

  clearHistory(): void {
    this._sessionRunner.clearHistory();
  }

  addMessage(message: ChatMessage, sourceEventIds?: readonly string[]): void {
    this._sessionRunner.addMessage(message, sourceEventIds);
  }

  loadHistory(messages: ChatMessage[], messageEventIds?: readonly (readonly string[])[]): void {
    this._sessionRunner.loadHistory(messages, messageEventIds);
    this._runnerEvents.fire({ type: 'historyLoaded', messageCount: messages.length });
  }

  // -------------------------------------------------------------------------
  // ToolGroup Management
  // -------------------------------------------------------------------------

  getToolSkills(): import('@neko/shared').ConfiguredToolGroup[] {
    return this._runtimeController.getToolSkills();
  }

  // -------------------------------------------------------------------------
  // Skill Injection
  // -------------------------------------------------------------------------

  setSkillProvider(provider: import('@neko/agent').ISkillProvider): void {
    this._skillProvider = provider;
    this._sessionRunner.setSkillProvider(provider);
  }

  refreshCapabilityRuntime(): void {
    if (!this._config) {
      return;
    }

    this._runtimeController.refresh(this._createRuntimeSessionAssemblyInput(this._config));
  }

  applySkillInjection(
    injection: import('@neko/agent').SkillInjection,
    skill?: import('@neko/agent').Skill,
  ): void {
    this._sessionRunner.applySkillInjection(injection, skill);
  }

  getActiveSkill(): import('@neko/shared').Skill | undefined {
    return this._sessionRunner.getActiveSkill();
  }

  clearActiveSkill(): void {
    this._sessionRunner.clearActiveSkill();
  }

  isToolAllowed(toolName: string): boolean {
    return this._sessionRunner.isToolAllowed(toolName);
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  private _buildExecutionContext(context: IAgentContext): import('@neko/agent').ExecutionContext {
    return buildAgentSessionExecutionContext({
      context: {
        workspaceRoot: context.workspaceRoot,
        projectType: context.projectType,
        activeFile: context.activeEditor?.uri?.toString(),
        metadata: context.metadata,
        multimodalContextPacket: context.multimodalContextPacket,
      },
      ...(this._config?.conversationId ? { conversationId: this._config.conversationId } : {}),
    });
  }

  private _ensureSubAgentEventBridge(): void {
    if (this._subAgentEventBridge) {
      return;
    }
    this._subAgentEventBridge = this._subAgentRuntime.onEvent((event) => {
      this._onDidSubAgentEvent.fire(event);
      this._runnerEvents.fire({ type: 'subagent', event });
    });
  }

  private _emitStart(): void {
    this._onDidStart.fire();
    this._runnerEvents.fire({ type: 'start' });
  }

  private _emitStop(): void {
    this._onDidStop.fire();
    this._runnerEvents.fire({ type: 'stop' });
  }

  private _emitConfirmation(request: AgentRunnerConfirmationRequest): void {
    const projected = {
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      action: request.action,
      description: request.description,
      details: request.details,
    };
    this._onDidRequestConfirmation.fire(projected);
    this._runnerEvents.fire({ type: 'confirmation', request: projected });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  dispose(): void {
    this._runtimeController.dispose();
    this._sessionRunner.disposeSession();
    this._subAgentEventBridge?.();
    this._subAgentEventBridge = undefined;
    this._onDidStart.dispose();
    this._onDidStop.dispose();
    this._onDidRequestConfirmation.dispose();
    this._onDidSubAgentEvent.dispose();
    this._runnerEvents.dispose();
  }
}
