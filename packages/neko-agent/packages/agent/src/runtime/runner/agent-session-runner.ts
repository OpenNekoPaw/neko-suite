import type {
  AgentCapabilityActivationProgressEvent,
  ChatMessage,
  PromptFragment,
  Skill,
  SkillInjection,
  SkillLifecycleProjection,
} from '@neko/shared';
import type { ToolConfirmationRequest } from '../../permission/types';
import type {
  AgentEvent,
  AgentSessionConfig,
  CompressionResult,
  ExecutionContext,
  IAgentSession,
} from '../../session/types';
import type { ISkillProvider } from '../../tools/core/meta-tools';
import {
  AgentPendingMessageQueueError,
  type AgentPendingMessageItem,
  type EnqueuePendingMessageInput,
} from './agent-runner-port';

export interface AgentSessionRunnerTimer {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface AgentSessionRunnerConfirmation {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly action: string;
  readonly description: string;
  readonly details: Record<string, unknown>;
}

export interface AgentSessionRunnerOptions<TContext> {
  readonly buildExecutionContext: (context: TContext) => ExecutionContext;
  readonly onDidStart?: () => void;
  readonly onDidStop?: () => void;
  readonly onDidRequestConfirmation?: (request: AgentSessionRunnerConfirmation) => void;
  readonly onDidActivationProgress?: (event: {
    readonly conversationId: string;
    readonly events: readonly AgentCapabilityActivationProgressEvent[];
  }) => void;
  readonly onMissingConfirmation?: (toolCallId: string) => void;
  readonly onConfirmationTimeout?: (request: AgentSessionRunnerConfirmation) => void;
  readonly confirmationTimeoutMs?: number;
  readonly timer?: AgentSessionRunnerTimer;
}

export type CreateAgentSessionRunnerOptions<TContext> = AgentSessionRunnerOptions<TContext>;

export const DEFAULT_AGENT_SESSION_CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000;
export const AGENT_SESSION_BUSY_MESSAGE =
  'Agent is already responding. Wait for the current answer to finish or cancel it before sending another message.';
export const AGENT_SESSION_CONFIG_LOCKED_MESSAGE =
  'Agent configuration cannot change while a response or task is running. Wait for the current work to finish or cancel it first.';

interface PendingConfirmation extends AgentSessionRunnerConfirmation {
  readonly confirmationToken?: string;
  readonly resolve: (approved: boolean) => void;
}

export function createAgentSessionRunner<TContext>(
  options: CreateAgentSessionRunnerOptions<TContext>,
): AgentSessionRunner<TContext> {
  return new AgentSessionRunner({
    ...options,
    confirmationTimeoutMs:
      options.confirmationTimeoutMs ?? DEFAULT_AGENT_SESSION_CONFIRMATION_TIMEOUT_MS,
  });
}

export class AgentSessionRunner<TContext> {
  private _session?: IAgentSession;
  private _isRunning = false;
  private _pendingMessages: AgentPendingMessageItem[] = [];
  private _pendingMessageSequence = 0;
  private readonly _pendingConfirmations = new Map<string, PendingConfirmation>();
  private readonly _confirmationTimers = new Map<string, unknown>();

  constructor(private readonly _options: AgentSessionRunnerOptions<TContext>) {}

  setSession(session: IAgentSession): void {
    this._session = session;
  }

  getSession(): IAgentSession | undefined {
    return this._session;
  }

  configureSession(config: Partial<AgentSessionConfig>): void {
    if (this._isRunning) {
      throw new Error(AGENT_SESSION_CONFIG_LOCKED_MESSAGE);
    }
    this._session?.configure(config);
  }

  async *execute(input: string, context: TContext): AsyncIterable<AgentEvent> {
    if (!this._session) {
      yield { type: 'error', error: new Error('Agent not configured') };
      return;
    }

    if (this._isRunning) {
      yield {
        type: 'error',
        error: new Error(AGENT_SESSION_BUSY_MESSAGE),
      };
      return;
    }

    this._isRunning = true;
    this._options.onDidStart?.();

    try {
      let currentInput = input;
      while (currentInput) {
        for await (const event of this._session.execute(
          currentInput,
          this._options.buildExecutionContext(context),
        )) {
          yield event;
        }

        currentInput = '';
      }

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
      this._options.onDidStop?.();
    }
  }

  buildActivationProgressCallback(): NonNullable<AgentSessionConfig['onActivationProgress']> {
    return (conversationId, events) => {
      if (events.length === 0) return;
      this._options.onDidActivationProgress?.({ conversationId, events });
    };
  }

  cancel(): void {
    this._session?.cancel();
    this._pendingMessages = [];
    this._clearConfirmationTimers();
    for (const pending of this._pendingConfirmations.values()) {
      pending.resolve(false);
    }
    this._pendingConfirmations.clear();
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  enqueuePendingMessage(input: EnqueuePendingMessageInput): AgentPendingMessageItem | null {
    if (!this._isRunning) {
      return null;
    }
    const content = normalizePendingMessageContent(input.content);
    const item: AgentPendingMessageItem = {
      id: this._createPendingMessageId(input.conversationId),
      conversationId: input.conversationId,
      content,
      createdAt: input.now ?? Date.now(),
      source: input.source ?? 'composer',
    };
    this._pendingMessages.push(item);
    return item;
  }

  getPendingMessageQueue(): readonly AgentPendingMessageItem[] {
    return this._pendingMessages.map((item) => ({ ...item }));
  }

  removePendingMessage(queueItemId: string): AgentPendingMessageItem {
    const index = this._findPendingMessageIndex(queueItemId);
    const item = this._pendingMessages[index];
    if (!item) {
      throw new Error(`Pending message queue index invariant violated: ${queueItemId}`);
    }
    this._pendingMessages.splice(index, 1);
    return clonePendingMessageItem(item);
  }

  updatePendingMessage(
    queueItemId: string,
    content: string,
    now: number = Date.now(),
  ): AgentPendingMessageItem {
    const index = this._findPendingMessageIndex(queueItemId);
    const item = this._pendingMessages[index];
    if (!item) {
      throw new Error(`Pending message queue index invariant violated: ${queueItemId}`);
    }
    const updated: AgentPendingMessageItem = {
      ...item,
      content: normalizePendingMessageContent(content),
      updatedAt: now,
    };
    this._pendingMessages[index] = updated;
    return clonePendingMessageItem(updated);
  }

  promotePendingMessage(queueItemId: string): AgentPendingMessageItem {
    const index = this._findPendingMessageIndex(queueItemId);
    const item = this._pendingMessages[index];
    if (!item) {
      throw new Error(`Pending message queue index invariant violated: ${queueItemId}`);
    }
    this._pendingMessages.splice(index, 1);
    this._pendingMessages.unshift(item);
    return clonePendingMessageItem(item);
  }

  dequeuePendingMessage(): AgentPendingMessageItem | null {
    const item = this._pendingMessages.shift();
    return item ? clonePendingMessageItem(item) : null;
  }

  drainPendingMessageQueue(): readonly AgentPendingMessageItem[] {
    const pendingMessages = this._pendingMessages;
    this._pendingMessages = [];
    return pendingMessages.map(clonePendingMessageItem);
  }

  getPendingMessagesCount(): number {
    return this._pendingMessages.length;
  }

  clearPendingMessages(): void {
    this._pendingMessages = [];
  }

  getContextTokenCount(): number {
    return this._session?.getTokenCount() ?? 0;
  }

  compressContext(): Promise<CompressionResult> {
    return (
      this._session?.compressContext() ??
      Promise.resolve({ originalTokens: 0, compressedTokens: 0, ratio: 1 })
    );
  }

  handleToolConfirmation(request: ToolConfirmationRequest): Promise<boolean> {
    return new Promise((resolve) => {
      const pending: PendingConfirmation = {
        toolCallId: request.toolCall.id,
        toolName: request.toolCall.name,
        action: request.action,
        description: request.description,
        details: request.details,
        confirmationToken: request.confirmationToken,
        resolve,
      };
      this._pendingConfirmations.set(pending.toolCallId, pending);
      this._scheduleConfirmationTimeout(pending);
      this._options.onDidRequestConfirmation?.(pending);
    });
  }

  confirmTool(toolCallId: string, approved: boolean): void {
    const pending = this._pendingConfirmations.get(toolCallId);
    if (!pending) {
      this._options.onMissingConfirmation?.(toolCallId);
      return;
    }

    this._clearConfirmationTimer(toolCallId);
    pending.resolve(approved);
    this._pendingConfirmations.delete(toolCallId);
  }

  getPendingConfirmations(): AgentSessionRunnerConfirmation[] {
    return Array.from(this._pendingConfirmations.values()).map((pending) => ({
      toolCallId: pending.toolCallId,
      toolName: pending.toolName,
      action: pending.action,
      description: pending.description,
      details: pending.details,
    }));
  }

  getHistory(): ChatMessage[] {
    return this._session?.getHistory() ?? [];
  }

  clearHistory(): void {
    this._session?.clearHistory();
  }

  addMessage(message: ChatMessage, sourceEventIds?: readonly string[]): void {
    this._session?.addMessage(message, sourceEventIds);
  }

  recordTaskResultObservation(
    input: import('../../session/types').RecordSessionTaskResultObservationInput,
  ): Promise<
    import('../../session/task-result-observation-recorder').RecordAgentTaskResultObservationResult
  > {
    if (!this._session) {
      throw new Error('Agent not configured');
    }
    return this._session.recordTaskResultObservation(input);
  }

  loadHistory(messages: ChatMessage[], messageEventIds?: readonly (readonly string[])[]): void {
    this._session?.loadHistory(messages, messageEventIds);
  }

  setSkillProvider(provider: ISkillProvider): void {
    this._session?.setSkillProvider(provider);
  }

  setPromptFragments(fragments: readonly PromptFragment[] | undefined): void {
    this._session?.setPromptFragments(fragments);
  }

  applySkillInjection(injection: SkillInjection, skill?: Skill): void {
    this._session?.applySkillInjection(injection, skill);
  }

  applySkillLifecycleProjection(projection: SkillLifecycleProjection): void {
    this._session?.applySkillLifecycleProjection(projection);
  }

  activateToolSetsForTools(toolNames: readonly string[]): readonly string[] {
    return this._session?.activateToolSetsForTools(toolNames) ?? [];
  }

  deactivateToolSet(toolSetName: string): void {
    this._session?.deactivateToolSet(toolSetName);
  }

  getActiveSkill(): Skill | undefined {
    return this._session?.getActiveSkill();
  }

  clearActiveSkill(): void {
    this._session?.clearActiveSkill();
  }

  isToolAllowed(toolName: string): boolean {
    return this._session?.isToolAllowed(toolName) ?? true;
  }

  disposeSession(): void {
    this.cancel();
    this._session?.dispose();
    this._session = undefined;
    this._isRunning = false;
  }

  private _findPendingMessageIndex(queueItemId: string): number {
    const index = this._pendingMessages.findIndex((item) => item.id === queueItemId);
    if (index < 0) {
      throw new AgentPendingMessageQueueError(
        'stale-item',
        `Queued message is no longer pending: ${queueItemId}`,
        queueItemId,
      );
    }
    return index;
  }

  private _createPendingMessageId(conversationId: string): string {
    this._pendingMessageSequence += 1;
    return `${conversationId}:queue:${Date.now().toString(36)}:${this._pendingMessageSequence.toString(36)}`;
  }

  private _scheduleConfirmationTimeout(pending: PendingConfirmation): void {
    const timer = this._options.timer;
    const timeoutMs = this._options.confirmationTimeoutMs;
    if (!timer || timeoutMs === undefined) {
      return;
    }

    const handle = timer.set(() => {
      if (!this._pendingConfirmations.has(pending.toolCallId)) {
        return;
      }
      this._pendingConfirmations.delete(pending.toolCallId);
      this._confirmationTimers.delete(pending.toolCallId);
      this._options.onConfirmationTimeout?.(pending);
      pending.resolve(false);
    }, timeoutMs);
    this._confirmationTimers.set(pending.toolCallId, handle);
  }

  private _clearConfirmationTimer(toolCallId: string): void {
    const handle = this._confirmationTimers.get(toolCallId);
    if (handle === undefined) {
      return;
    }
    this._options.timer?.clear(handle);
    this._confirmationTimers.delete(toolCallId);
  }

  private _clearConfirmationTimers(): void {
    for (const handle of this._confirmationTimers.values()) {
      this._options.timer?.clear(handle);
    }
    this._confirmationTimers.clear();
  }
}

function normalizePendingMessageContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new AgentPendingMessageQueueError(
      'invalid-queue-operation',
      'Queued message content cannot be empty.',
    );
  }
  return trimmed;
}

function clonePendingMessageItem(item: AgentPendingMessageItem): AgentPendingMessageItem {
  return { ...item };
}
