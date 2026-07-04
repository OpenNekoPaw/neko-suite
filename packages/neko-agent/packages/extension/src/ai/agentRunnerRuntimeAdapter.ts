import { toSharedService } from '@neko/platform';
import type { ChatMessage, ConfiguredToolGroup } from '@neko/shared';
import {
  buildAgentSessionExecutionContext,
  AGENT_SESSION_CONFIG_LOCKED_MESSAGE,
  createAgentRuntimeSessionController,
  createAgentRunnerEventEmitter,
  createAgentSessionRunner,
  type AgentRunnerConfirmationRequest,
  type AgentRunnerEventEmitter,
  type AgentPendingMessageItem,
  type AgentRunnerPort,
  type AgentRunnerPortEvent,
  type AgentRuntimeSessionAssemblyInput,
  type AgentRuntimeSessionController,
  type AgentRuntimeSessionControllerTarget,
  type SubAgentRuntimeCoordinator,
} from '@neko/agent/runtime';
import type { AgentEvent } from '@neko/agent';
import {
  CREATIVE_PRESETS as CREATIVE_SUBAGENT_PRESETS,
  createAutohealChain,
  createDefaultCreativeProcessRecoveryPolicy,
  createValidationCoordinatorFactory,
  createQualityReviewValidationAdapter,
} from '@neko/skills';
import {
  getCapabilityDiscoveryService,
  getCapabilityRuntimeBindings,
} from '../bootstrap/capabilityBootstrap';
import type { IEngineClientProvider } from '../services/engineClientProvider';
import type { IAgentContext } from './agentContext';
import type { IAgentConfig } from './agentRunnerContracts';

export interface AgentRunnerRuntimeAdapterLogger {
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export interface AgentRunnerRuntimeAdapterDeps {
  readonly engineClientProvider: IEngineClientProvider;
  readonly subAgentRuntime: SubAgentRuntimeCoordinator;
  readonly logger: AgentRunnerRuntimeAdapterLogger;
  readonly createRuntimeController?: (
    target: AgentRuntimeSessionControllerTarget,
  ) => AgentRuntimeSessionController;
  readonly perceptionAssetLoader?: import('@neko/ai-sdk').PerceptionAssetLoader;
}

export class AgentRunnerRuntimeAdapter implements AgentRunnerPort<IAgentConfig, IAgentContext> {
  private config?: IAgentConfig;
  private skillProvider?: import('@neko/agent').ISkillProvider;
  private subAgentEventBridge?: () => void;

  private readonly runnerEvents: AgentRunnerEventEmitter<AgentRunnerPortEvent> =
    createAgentRunnerEventEmitter();
  private readonly sessionRunner = createAgentSessionRunner<IAgentContext>({
    buildExecutionContext: (context) => this.buildExecutionContext(context),
    onDidStart: () => this.runnerEvents.fire({ type: 'start' }),
    onDidStop: () => this.runnerEvents.fire({ type: 'stop' }),
    onDidRequestConfirmation: (request) =>
      this.runnerEvents.fire({ type: 'confirmation', request: projectConfirmation(request) }),
    onDidActivationProgress: ({ conversationId, events }) =>
      this.runnerEvents.fire({ type: 'activationProgress', conversationId, events }),
    onMissingConfirmation: (toolCallId) =>
      this.deps.logger.warn('No pending confirmation found for toolCallId:', toolCallId),
    onConfirmationTimeout: (request) =>
      this.deps.logger.warn(
        `Tool confirmation timed out for ${request.toolName} (${request.toolCallId})`,
      ),
    timer: {
      set: (callback, ms) => setTimeout(callback, ms),
      clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  });
  private readonly runtimeController: AgentRuntimeSessionController;

  constructor(private readonly deps: AgentRunnerRuntimeAdapterDeps) {
    this.runtimeController = (deps.createRuntimeController ?? createAgentRuntimeSessionController)(
      this.sessionRunner,
    );
    this.ensureSubAgentEventBridge();
  }

  get onDidStart(): AgentRunnerPort<IAgentConfig, IAgentContext>['onDidStart'] {
    return (listener) => this.runnerEvents.event((event) => event.type === 'start' && listener());
  }

  get onDidStop(): AgentRunnerPort<IAgentConfig, IAgentContext>['onDidStop'] {
    return (listener) => this.runnerEvents.event((event) => event.type === 'stop' && listener());
  }

  get onDidRequestConfirmation(): AgentRunnerPort<
    IAgentConfig,
    IAgentContext
  >['onDidRequestConfirmation'] {
    return (listener) =>
      this.runnerEvents.event((event) => {
        if (event.type === 'confirmation') {
          listener(event.request);
        }
      });
  }

  get onDidSubAgentEvent(): AgentRunnerPort<IAgentConfig, IAgentContext>['onDidSubAgentEvent'] {
    return (listener) =>
      this.runnerEvents.event((event) => {
        if (event.type === 'subagent') {
          listener(event.event);
        }
      });
  }

  get onDidRunnerEvent(): AgentRunnerPort<IAgentConfig, IAgentContext>['onDidRunnerEvent'] {
    return this.runnerEvents.event;
  }

  async configure(config: IAgentConfig): Promise<void> {
    if (this.sessionRunner.isRunning()) {
      throw new Error(AGENT_SESSION_CONFIG_LOCKED_MESSAGE);
    }
    this.config = config;

    await this.runtimeController.configure(this.createRuntimeSessionAssemblyInput(config));
    if (this.skillProvider) {
      this.sessionRunner.setSkillProvider(this.skillProvider);
    }
  }

  getConfig(): IAgentConfig | undefined {
    return this.config;
  }

  execute(input: string, context: IAgentContext): AsyncIterable<AgentEvent> {
    return this.sessionRunner.execute(input, context);
  }

  cancel(): void {
    this.sessionRunner.cancel();
    this.runnerEvents.fire({ type: 'cancel' });
  }

  isRunning(): boolean {
    return this.sessionRunner.isRunning();
  }

  enqueuePendingMessage(input: {
    readonly conversationId: string;
    readonly content: string;
    readonly now?: number;
  }): AgentPendingMessageItem | null {
    return this.sessionRunner.enqueuePendingMessage(input);
  }

  getPendingMessageQueue(): readonly AgentPendingMessageItem[] {
    return this.sessionRunner.getPendingMessageQueue();
  }

  removePendingMessage(queueItemId: string): AgentPendingMessageItem {
    return this.sessionRunner.removePendingMessage(queueItemId);
  }

  updatePendingMessage(
    queueItemId: string,
    content: string,
    now?: number,
  ): AgentPendingMessageItem {
    return this.sessionRunner.updatePendingMessage(queueItemId, content, now);
  }

  promotePendingMessage(queueItemId: string): AgentPendingMessageItem {
    return this.sessionRunner.promotePendingMessage(queueItemId);
  }

  dequeuePendingMessage(): AgentPendingMessageItem | null {
    return this.sessionRunner.dequeuePendingMessage();
  }

  drainPendingMessageQueue(): readonly AgentPendingMessageItem[] {
    return this.sessionRunner.drainPendingMessageQueue();
  }

  getPendingMessagesCount(): number {
    return this.sessionRunner.getPendingMessagesCount();
  }

  clearPendingMessages(): void {
    this.sessionRunner.clearPendingMessages();
  }

  getContextTokenCount(): number {
    return this.sessionRunner.getContextTokenCount();
  }

  async compressContext(): Promise<{
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  }> {
    const result = await this.sessionRunner.compressContext();
    this.runnerEvents.fire({ type: 'contextCompressed', result });
    return result;
  }

  confirmTool(toolCallId: string, approved: boolean): void {
    this.sessionRunner.confirmTool(toolCallId, approved);
  }

  getPendingConfirmations(): AgentRunnerConfirmationRequest[] {
    return this.sessionRunner.getPendingConfirmations();
  }

  getHistory(): ChatMessage[] {
    return this.sessionRunner.getHistory();
  }

  clearHistory(): void {
    this.sessionRunner.clearHistory();
  }

  addMessage(message: ChatMessage, sourceEventIds?: readonly string[]): void {
    this.sessionRunner.addMessage(message, sourceEventIds);
  }

  loadHistory(messages: ChatMessage[], messageEventIds?: readonly (readonly string[])[]): void {
    this.sessionRunner.loadHistory(messages, messageEventIds);
    this.runnerEvents.fire({ type: 'historyLoaded', messageCount: messages.length });
  }

  getToolSkills(): ConfiguredToolGroup[] {
    return this.runtimeController.getToolSkills();
  }

  setSkillProvider(provider: import('@neko/agent').ISkillProvider): void {
    this.skillProvider = provider;
    this.sessionRunner.setSkillProvider(provider);
  }

  refreshCapabilityRuntime(): void {
    if (!this.config) {
      return;
    }

    this.runtimeController.refresh(this.createRuntimeSessionAssemblyInput(this.config));
  }

  applySkillInjection(
    injection: import('@neko/agent').SkillInjection,
    skill?: import('@neko/agent').Skill,
  ): void {
    this.sessionRunner.applySkillInjection(injection, skill);
  }

  activateToolSetsForTools(toolNames: readonly string[]): readonly string[] {
    return this.sessionRunner.activateToolSetsForTools(toolNames);
  }

  deactivateToolSet(toolSetName: string): void {
    this.sessionRunner.deactivateToolSet(toolSetName);
  }

  getActiveSkill(): import('@neko/shared').Skill | undefined {
    return this.sessionRunner.getActiveSkill();
  }

  clearActiveSkill(): void {
    this.sessionRunner.clearActiveSkill();
  }

  isToolAllowed(toolName: string): boolean {
    return this.sessionRunner.isToolAllowed(toolName);
  }

  dispose(): void {
    this.runtimeController.dispose();
    this.sessionRunner.disposeSession();
    this.subAgentEventBridge?.();
    this.subAgentEventBridge = undefined;
    this.runnerEvents.dispose();
  }

  private createRuntimeSessionAssemblyInput(
    config: IAgentConfig,
  ): AgentRuntimeSessionAssemblyInput {
    return {
      createService: () =>
        toSharedService(config.platform.createService(), {
          providerCardRegistry: getCapabilityRuntimeBindings().providerCardRegistry,
          ...(this.deps.perceptionAssetLoader
            ? { assetLoader: this.deps.perceptionAssetLoader }
            : {}),
        }),
      toolRegistry: config.platform.tools,
      systemPrompt: config.systemPrompt,
      maxIterations: config.maxIterations,
      temperature: config.temperature,
      topP: config.topP,
      maxTokens: config.maxTokens,
      providerId: config.providerId,
      modelId: config.modelId,
      modelCapabilities: config.modelCapabilities,
      thinkingBudget: config.thinkingBudget,
      executionMode: config.executionMode,
      workspaceRoot: config.workspaceRoot,
      authorizedReadRoots: config.authorizedReadRoots,
      workspaceIgnoreRules: config.workspaceIgnoreRules,
      taskManager: config.taskManager,
      conversationId: config.conversationId,
      operationToolAdapterRegistry: config.operationToolAdapterRegistry,
      locale: config.locale,
      providerExpressionTargets: config.providerExpressionTargets,
      creationGuidance: {
        autohealChainFactory: createAutohealChain,
        creativeProcessRecoveryPolicy: createDefaultCreativeProcessRecoveryPolicy(),
      },
      capabilityRuntime: getCapabilityRuntimeBindings(),
      validationLoop: {
        validationCoordinatorFactory: createValidationCoordinatorFactory(),
        toolResultValidationAdapters: [createQualityReviewValidationAdapter()],
      },
      getCapabilityPromptFragments: () => getCapabilityDiscoveryService().getAllPromptFragments(),
      toolCategoryRegistry: config.toolCategoryRegistry,
      getPerceptionClients: () =>
        this.deps.engineClientProvider.createPerceptionClients(config.engineClient),
      subAgentRuntime: this.deps.subAgentRuntime,
      specializedSubAgentPresets: CREATIVE_SUBAGENT_PRESETS,
      syncToolCategories: (registry) => {
        getCapabilityDiscoveryService().syncToolCategories(registry);
      },
      onConfirmTool: async (request) => this.sessionRunner.handleToolConfirmation(request),
      onValidationWarning: (warning) => {
        this.deps.logger.warn('Validation warning:', warning.message);
      },
      onValidationError: (error) => {
        this.deps.logger.error('Validation error:', {
          message: error.message,
          details: error.details,
        });
      },
      onActivationProgress: this.sessionRunner.buildActivationProgressCallback(),
      logger: {
        warn: (message, error) => this.deps.logger.warn(message, error),
        error: (message, details) => this.deps.logger.error(message, details),
      },
    };
  }

  private buildExecutionContext(context: IAgentContext): import('@neko/agent').ExecutionContext {
    return buildAgentSessionExecutionContext({
      context: {
        workspaceRoot: context.workspaceRoot,
        projectType: context.projectType,
        activeFile: context.activeEditor?.uri?.toString(),
        metadata: context.metadata,
        multimodalContextPacket: context.multimodalContextPacket,
      },
      ...(this.config?.conversationId ? { conversationId: this.config.conversationId } : {}),
    });
  }

  private ensureSubAgentEventBridge(): void {
    if (this.subAgentEventBridge) {
      return;
    }
    this.subAgentEventBridge = this.deps.subAgentRuntime.onEvent((event) => {
      this.runnerEvents.fire({ type: 'subagent', event });
    });
  }
}

function projectConfirmation(
  request: AgentRunnerConfirmationRequest,
): AgentRunnerConfirmationRequest {
  return {
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    action: request.action,
    description: request.description,
    details: request.details,
  };
}
