import type { ChatMessage, Skill, SkillInjection, SkillLifecycleProjection } from '@neko/shared';
import type { ISkillProvider, SkillProviderFactory } from '../../tools/core/meta-tools';
import {
  hydrateAgentHistoryWithToolResults,
  type AgentHistoryWithToolContextMessage,
} from '../../session/history-hydration';
import {
  AgentRuntimePool,
  type AgentRuntimePoolPressureEvent,
  type ManagedAgentRuntime,
} from './agent-runtime-pool';
import { SubAgentRuntimeCoordinator } from '../subagent-runtime';
import type {
  AgentRunnerEventSource,
  AgentPendingMessageItem,
  AgentRunnerPortEvent,
  DisposableLike,
} from '../runner/agent-runner-port';

export type AgentRuntimeManagerDisposable = DisposableLike;
export type AgentRuntimeManagerEvent = AgentRunnerEventSource<void>;

export interface AgentRuntimeCompressionResult {
  readonly originalTokens: number;
  readonly compressedTokens: number;
  readonly ratio: number;
}

export interface AgentRuntimeManagerAgent extends ManagedAgentRuntime {
  confirmTool(toolCallId: string, approved: boolean): void;
  loadHistory(messages: ChatMessage[], messageEventIds?: readonly (readonly string[])[]): void;
  clearHistory(): void;
  getPendingMessageQueue(): readonly AgentPendingMessageItem[];
  removePendingMessage(queueItemId: string): AgentPendingMessageItem;
  updatePendingMessage(queueItemId: string, content: string, now?: number): AgentPendingMessageItem;
  promotePendingMessage(queueItemId: string): AgentPendingMessageItem;
  dequeuePendingMessage(): AgentPendingMessageItem | null;
  clearPendingMessages(): void;
  getContextTokenCount(): number;
  compressContext(): Promise<AgentRuntimeCompressionResult>;
  applySkillLifecycleProjection(projection: SkillLifecycleProjection): void;
  applySkillInjection(injection: SkillInjection, skill?: Skill): void;
  getActiveSkill(): Skill | undefined;
  clearActiveSkill(): void;
  isToolAllowed(toolName: string): boolean;
  setSkillProvider(provider: ISkillProvider): void;
  refreshCapabilityRuntime(): void;
  readonly onDidRunnerEvent?: AgentRunnerEventSource<AgentRunnerPortEvent>;
  readonly onDidStart?: AgentRuntimeManagerEvent;
  readonly onDidStop?: AgentRuntimeManagerEvent;
}

export interface AgentRuntimeManagerCreateAgentInput {
  readonly conversationId: string;
  readonly subAgentRuntime: SubAgentRuntimeCoordinator;
}

export interface AgentRuntimeManagerLogger {
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export interface AgentRuntimeManagerOptions<TAgent extends AgentRuntimeManagerAgent> {
  readonly createAgent: (input: AgentRuntimeManagerCreateAgentInput) => TAgent;
  readonly subAgentRuntime?: SubAgentRuntimeCoordinator;
  readonly disposeSubAgentRuntime?: boolean;
  readonly logger?: AgentRuntimeManagerLogger;
  readonly onAgentStart?: (event: { readonly conversationId: string }) => void;
  readonly onAgentStop?: (event: { readonly conversationId: string }) => void;
  readonly onPoolPressure?: (event: AgentRuntimePoolPressureEvent) => void;
}

export interface AgentRuntimeManager<TAgent extends AgentRuntimeManagerAgent> {
  getOrCreate(conversationId: string): TAgent;
  get(conversationId: string): TAgent | undefined;
  isRunning(conversationId: string): boolean;
  hasRunningAgents(): boolean;
  getRunningConversations(): string[];
  getAllConversations(): string[];
  remove(conversationId: string): void;
  cancel(conversationId: string): void;
  cancelAll(): void;
  confirmTool(conversationId: string, toolCallId: string, approved: boolean): void;
  loadHistory(
    conversationId: string,
    messages: ChatMessage[],
    messageEventIds?: readonly (readonly string[])[],
  ): void;
  loadHistoryWithContext(
    conversationId: string,
    messages: readonly AgentHistoryWithToolContextMessage[],
  ): void;
  clearHistory(conversationId: string): void;
  getPendingMessageQueue(conversationId: string): readonly AgentPendingMessageItem[];
  removePendingMessage(conversationId: string, queueItemId: string): AgentPendingMessageItem;
  updatePendingMessage(
    conversationId: string,
    queueItemId: string,
    content: string,
    now?: number,
  ): AgentPendingMessageItem;
  promotePendingMessage(conversationId: string, queueItemId: string): AgentPendingMessageItem;
  dequeuePendingMessage(conversationId: string): AgentPendingMessageItem | null;
  clearPendingMessages(conversationId: string): void;
  nextMessageQueueSnapshotVersion(conversationId: string): number;
  getContextTokenCount(conversationId: string): number;
  compressContext(conversationId: string): Promise<AgentRuntimeCompressionResult>;
  applySkillLifecycleProjection(
    conversationId: string,
    projection: SkillLifecycleProjection,
  ): void;
  applySkillInjection(conversationId: string, injection: SkillInjection, skill?: Skill): void;
  getActiveSkill(conversationId: string): Skill | undefined;
  clearActiveSkill(conversationId: string): void;
  isToolAllowed(conversationId: string, toolName: string): boolean;
  setSkillProviderFactory(factory: SkillProviderFactory): void;
  refreshCapabilityRuntime(): void;
  dispose(): void;
}

export function createAgentRuntimeManager<TAgent extends AgentRuntimeManagerAgent>(
  options: AgentRuntimeManagerOptions<TAgent>,
): AgentRuntimeManager<TAgent> {
  return new DefaultAgentRuntimeManager(options);
}

class DefaultAgentRuntimeManager<
  TAgent extends AgentRuntimeManagerAgent,
> implements AgentRuntimeManager<TAgent> {
  private readonly subAgentRuntime: SubAgentRuntimeCoordinator;
  private readonly disposeSubAgentRuntime: boolean;
  private readonly agentDisposables = new Map<string, AgentRuntimeManagerDisposable[]>();
  private readonly messageQueueSnapshotVersions = new Map<string, number>();
  private readonly pool: AgentRuntimePool<TAgent>;
  private skillProviderFactory?: SkillProviderFactory;

  constructor(private readonly options: AgentRuntimeManagerOptions<TAgent>) {
    this.subAgentRuntime = options.subAgentRuntime ?? new SubAgentRuntimeCoordinator();
    this.disposeSubAgentRuntime =
      options.disposeSubAgentRuntime ?? options.subAgentRuntime === undefined;
    this.pool = new AgentRuntimePool<TAgent>({
      createAgent: (conversationId) => this.createAgent(conversationId),
      onRemove: (conversationId) => this.disposeAgentDisposables(conversationId),
      onPressure: (event) => this.handlePoolPressure(event),
    });
  }

  getOrCreate(conversationId: string): TAgent {
    return this.pool.getOrCreate(conversationId);
  }

  get(conversationId: string): TAgent | undefined {
    return this.pool.get(conversationId);
  }

  isRunning(conversationId: string): boolean {
    return this.pool.isRunning(conversationId);
  }

  hasRunningAgents(): boolean {
    return this.pool.hasRunningAgents();
  }

  getRunningConversations(): string[] {
    return this.pool.getRunningConversations();
  }

  getAllConversations(): string[] {
    return this.pool.getAllConversations();
  }

  remove(conversationId: string): void {
    this.pool.remove(conversationId);
  }

  cancel(conversationId: string): void {
    this.pool.cancel(conversationId);
  }

  cancelAll(): void {
    this.pool.cancelAll();
  }

  confirmTool(conversationId: string, toolCallId: string, approved: boolean): void {
    this.pool.get(conversationId)?.confirmTool(toolCallId, approved);
  }

  loadHistory(
    conversationId: string,
    messages: ChatMessage[],
    messageEventIds?: readonly (readonly string[])[],
  ): void {
    this.getOrCreate(conversationId).loadHistory(messages, messageEventIds);
  }

  loadHistoryWithContext(
    conversationId: string,
    messages: readonly AgentHistoryWithToolContextMessage[],
  ): void {
    this.getOrCreate(conversationId).loadHistory(hydrateAgentHistoryWithToolResults(messages));
    this.options.logger?.info(
      `Loaded ${messages.length} messages with context for: ${conversationId}`,
    );
  }

  clearHistory(conversationId: string): void {
    this.pool.get(conversationId)?.clearHistory();
  }

  getPendingMessageQueue(conversationId: string): readonly AgentPendingMessageItem[] {
    return this.pool.get(conversationId)?.getPendingMessageQueue() ?? [];
  }

  removePendingMessage(conversationId: string, queueItemId: string): AgentPendingMessageItem {
    return this.requireAgent(conversationId).removePendingMessage(queueItemId);
  }

  updatePendingMessage(
    conversationId: string,
    queueItemId: string,
    content: string,
    now?: number,
  ): AgentPendingMessageItem {
    return this.requireAgent(conversationId).updatePendingMessage(queueItemId, content, now);
  }

  promotePendingMessage(conversationId: string, queueItemId: string): AgentPendingMessageItem {
    return this.requireAgent(conversationId).promotePendingMessage(queueItemId);
  }

  dequeuePendingMessage(conversationId: string): AgentPendingMessageItem | null {
    return this.pool.get(conversationId)?.dequeuePendingMessage() ?? null;
  }

  clearPendingMessages(conversationId: string): void {
    this.pool.get(conversationId)?.clearPendingMessages();
  }

  nextMessageQueueSnapshotVersion(conversationId: string): number {
    const nextVersion = (this.messageQueueSnapshotVersions.get(conversationId) ?? 0) + 1;
    this.messageQueueSnapshotVersions.set(conversationId, nextVersion);
    return nextVersion;
  }

  getContextTokenCount(conversationId: string): number {
    return this.pool.get(conversationId)?.getContextTokenCount() ?? 0;
  }

  async compressContext(conversationId: string): Promise<AgentRuntimeCompressionResult> {
    return (
      (await this.pool.get(conversationId)?.compressContext()) ?? {
        originalTokens: 0,
        compressedTokens: 0,
        ratio: 1,
      }
    );
  }

  applySkillInjection(conversationId: string, injection: SkillInjection, skill?: Skill): void {
    this.pool.get(conversationId)?.applySkillInjection(injection, skill);
  }

  applySkillLifecycleProjection(
    conversationId: string,
    projection: SkillLifecycleProjection,
  ): void {
    this.pool.get(conversationId)?.applySkillLifecycleProjection(projection);
  }

  getActiveSkill(conversationId: string): Skill | undefined {
    return this.pool.get(conversationId)?.getActiveSkill();
  }

  clearActiveSkill(conversationId: string): void {
    this.pool.get(conversationId)?.clearActiveSkill();
  }

  isToolAllowed(conversationId: string, toolName: string): boolean {
    return this.pool.get(conversationId)?.isToolAllowed(toolName) ?? true;
  }

  setSkillProviderFactory(factory: SkillProviderFactory): void {
    this.skillProviderFactory = factory;
    for (const conversationId of this.pool.getAllConversations()) {
      this.pool.get(conversationId)?.setSkillProvider(factory(conversationId));
    }
  }

  refreshCapabilityRuntime(): void {
    for (const agent of this.pool.values()) {
      agent.refreshCapabilityRuntime();
    }
  }

  dispose(): void {
    this.pool.dispose();
    this.agentDisposables.clear();
    if (this.disposeSubAgentRuntime) {
      this.subAgentRuntime.dispose();
    }
  }

  private createAgent(conversationId: string): TAgent {
    const agent = this.options.createAgent({
      conversationId,
      subAgentRuntime: this.subAgentRuntime,
    });

    if (this.skillProviderFactory) {
      agent.setSkillProvider(this.skillProviderFactory(conversationId));
    }

    this.agentDisposables.set(
      conversationId,
      this.createAgentEventDisposables(conversationId, agent),
    );
    return agent;
  }

  private requireAgent(conversationId: string): TAgent {
    const agent = this.pool.get(conversationId);
    if (!agent) {
      throw new Error(`Agent runtime not found for conversation: ${conversationId}`);
    }
    return agent;
  }

  private createAgentEventDisposables(
    conversationId: string,
    agent: TAgent,
  ): AgentRuntimeManagerDisposable[] {
    const disposables: AgentRuntimeManagerDisposable[] = [];
    if (agent.onDidRunnerEvent) {
      disposables.push(
        agent.onDidRunnerEvent((event) => {
          if (event.type === 'start') {
            this.options.onAgentStart?.({ conversationId });
            return;
          }
          if (event.type === 'stop') {
            this.options.onAgentStop?.({ conversationId });
          }
        }),
      );
      return disposables;
    }

    // TODO(P1): Remove individual event fallback after all hosts expose AgentRunnerPort.
    if (agent.onDidStart && this.options.onAgentStart) {
      disposables.push(agent.onDidStart(() => this.options.onAgentStart?.({ conversationId })));
    }
    if (agent.onDidStop && this.options.onAgentStop) {
      disposables.push(agent.onDidStop(() => this.options.onAgentStop?.({ conversationId })));
    }
    return disposables;
  }

  private disposeAgentDisposables(conversationId: string): void {
    const disposables = this.agentDisposables.get(conversationId);
    if (!disposables) {
      return;
    }

    for (const disposable of disposables) {
      disposable.dispose();
    }
    this.agentDisposables.delete(conversationId);
  }

  private handlePoolPressure(event: AgentRuntimePoolPressureEvent): void {
    this.options.onPoolPressure?.(event);
    if (event.type === 'expanded') {
      this.options.logger?.warn(
        `All agents running, temporarily increased maxAgents to ${event.maxAgents}`,
      );
      return;
    }

    this.options.logger?.error(
      `Cannot evict: reached absolute max (${event.absoluteMaxAgents}) agents, all running`,
    );
  }
}
