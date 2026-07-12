import type { AgentMessageQueueSnapshot } from '@neko-agent/types';
import type { Task } from '@neko/shared';
import type { TuiConversationStores } from '../../runtime/tui-application-runtime';
import type { Message } from '../../types/state';
import type {
  TuiDebugAutomationAppPort,
  TuiDebugAutomationCanvasFacts,
  TuiDebugAutomationIdleConcern,
  TuiDebugAutomationIdleState,
  TuiDebugAutomationMarkdownFacts,
  TuiDebugAutomationSessionFacts,
  TuiDebugAutomationToolCallSummary,
  TuiDebugAutomationTurnSummary,
} from './types';
import { TuiDebugAutomationProtocolError } from './protocol';

export interface TuiAutomationSessionHandle {
  readonly isReady: boolean;
  readonly submit: (prompt: string) => Promise<void>;
  readonly cancel: () => void;
  readonly listTasks: () => Promise<readonly Task[]>;
  readonly getCurrentConversationId: () => string;
  readonly getHistory: () => readonly unknown[];
  readonly getMessageQueueSnapshot: () => AgentMessageQueueSnapshot | null;
}

export interface TuiAutomationAppPortOptions {
  readonly stores: TuiConversationStores;
  readonly readHandle: () => TuiAutomationSessionHandle;
  readonly readMarkdownFacts: () => TuiDebugAutomationMarkdownFacts;
}

export function createTuiAutomationAppPort(
  options: TuiAutomationAppPortOptions,
): TuiDebugAutomationAppPort {
  const { stores } = options;
  const inFlightSubmissions = new Set<Promise<void>>();
  let latestSubmission: Promise<void> | null = null;
  return {
    ownerKind: 'tui-app-session-owner',

    isReady(): boolean {
      return options.readHandle().isReady;
    },

    getConversationId(): string {
      return options.readHandle().getCurrentConversationId();
    },

    async submitMessage(input): Promise<void> {
      const handle = options.readHandle();
      if (!handle.isReady) {
        throw new TuiDebugAutomationProtocolError(
          'session-not-ready',
          'TUI session is not ready for message submission.',
        );
      }
      const messageCountBeforeSubmit = stores.conversation.getState().messages.length;
      const execution = handle.submit(input.prompt);
      latestSubmission = execution;
      inFlightSubmissions.add(execution);
      void execution.finally(() => {
        inFlightSubmissions.delete(execution);
      });
      await waitForSubmissionAcceptance(execution, messageCountBeforeSubmit, stores);
    },

    cancelActiveMessage(): boolean {
      const handle = options.readHandle();
      const wasRunning = stores.agent.getState().status === 'running';
      handle.cancel();
      return wasRunning;
    },

    resizeTerminal(input): void {
      stores.ui.getState().setTerminalSize({ columns: input.columns, rows: input.rows });
    },

    async waitForIdle(input): Promise<TuiDebugAutomationIdleState> {
      if (latestSubmission) await latestSubmission;
      await Promise.all([...inFlightSubmissions]);
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      return waitForTuiAutomationIdle({
        readIdle: async () => readTuiAutomationIdleState(options.readHandle(), stores),
        timeoutMs: input.timeoutMs,
        pollIntervalMs: input.pollIntervalMs,
      });
    },

    async readFacts(input): Promise<TuiDebugAutomationSessionFacts> {
      const handle = options.readHandle();
      const idle = await readTuiAutomationIdleState(handle, stores);
      return {
        sessionId: input.sessionId,
        conversationId: handle.getCurrentConversationId(),
        ready: handle.isReady,
        model: readModelIdentity(stores),
        idle,
        turns: readTurnSummaries(stores),
        ...(input.includeHistory ? { history: [...handle.getHistory()] } : {}),
        skillActivations: [...stores.agent.getState().activeSkillLifecycleRecords],
        tasks: (await readTasks(handle)).map((task) => ({
          id: task.id,
          type: task.type,
          status: task.status,
          progress: task.progress,
          ...(task.error ? { error: task.error } : {}),
        })),
        messageQueue: handle.getMessageQueueSnapshot(),
        continuations: readContinuationFacts(handle.getMessageQueueSnapshot(), stores),
        runtimeErrors: readRuntimeErrors(stores),
        canvas: readCanvasFacts(stores),
        markdown: options.readMarkdownFacts(),
      };
    },
  };
}

async function waitForSubmissionAcceptance(
  execution: Promise<void>,
  messageCountBeforeSubmit: number,
  stores: TuiConversationStores,
): Promise<void> {
  let settled = false;
  void execution.finally(() => {
    settled = true;
  });
  const startedAt = Date.now();
  for (;;) {
    if (stores.agent.getState().status === 'running') return;
    if (settled && hasProjectedAssistantAfter(messageCountBeforeSubmit, stores)) return;
    if (Date.now() - startedAt >= 5_000) {
      throw new TuiDebugAutomationProtocolError(
        'session-timeout',
        'TUI message submission was not accepted or projected within 5000ms.',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function hasProjectedAssistantAfter(
  messageCountBeforeSubmit: number,
  stores: TuiConversationStores,
): boolean {
  return stores.conversation
    .getState()
    .messages.slice(messageCountBeforeSubmit)
    .some((message) => message.role === 'assistant');
}

async function waitForTuiAutomationIdle(input: {
  readonly readIdle: () => Promise<TuiDebugAutomationIdleState>;
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
}): Promise<TuiDebugAutomationIdleState> {
  const startedAt = Date.now();
  for (;;) {
    const idle = await input.readIdle();
    if (idle.fullyIdle) {
      return idle;
    }
    if (Date.now() - startedAt >= input.timeoutMs) {
      throw new TuiDebugAutomationProtocolError(
        'session-timeout',
        `TUI debug automation idle wait timed out after ${input.timeoutMs}ms.`,
        idle,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
  }
}

async function readTuiAutomationIdleState(
  handle: TuiAutomationSessionHandle,
  stores: TuiConversationStores,
): Promise<TuiDebugAutomationIdleState> {
  const agentState = stores.agent.getState();
  const tasks = await readTasks(handle);
  const runningTasks = tasks.filter((task) => !isTerminalTaskStatus(String(task.status)));
  const taskDiagnostic =
    runningTasks.length > 0 ? `${runningTasks.length} background task(s) still active.` : undefined;
  const turnIdle =
    agentState.status === 'idle' || agentState.status === 'error'
      ? idleConcern(agentState.status, true)
      : busyConcern(agentState.status);
  const backgroundTasksIdle =
    runningTasks.length === 0 ? idleConcern('idle', true) : busyConcern('running', taskDiagnostic);
  const mediaDeliveryIdle = backgroundTasksIdle;
  const taskResultObservationIdle = backgroundTasksIdle;
  const queuedContinuations = (handle.getMessageQueueSnapshot()?.items ?? []).filter((item) =>
    isContinuationSource(item.source),
  );
  const continuationQueueIdle =
    queuedContinuations.length === 0
      ? idleConcern('idle', true)
      : busyConcern('queued', `${queuedContinuations.length} continuation(s) pending.`);

  return {
    turnIdle,
    backgroundTasksIdle,
    mediaDeliveryIdle,
    taskResultObservationIdle,
    continuationQueueIdle,
    fullyIdle:
      turnIdle.idle &&
      backgroundTasksIdle.idle &&
      mediaDeliveryIdle.idle &&
      taskResultObservationIdle.idle &&
      continuationQueueIdle.idle,
  };
}

async function readTasks(handle: TuiAutomationSessionHandle): Promise<readonly Task[]> {
  if (!handle.isReady) {
    return [];
  }
  return handle.listTasks();
}

function idleConcern(status: string, terminal: boolean): TuiDebugAutomationIdleConcern {
  return {
    idle: true,
    terminal,
    status,
  };
}

function busyConcern(status: string, diagnostic?: string): TuiDebugAutomationIdleConcern {
  return {
    idle: false,
    terminal: false,
    status,
    ...(diagnostic ? { diagnostic } : {}),
  };
}

function isTerminalTaskStatus(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function readModelIdentity(stores: TuiConversationStores): TuiDebugAutomationSessionFacts['model'] {
  const config = stores.config.getState().config;
  return {
    providerId: config.chatModel?.providerId ?? config.provider,
    modelId: config.chatModel?.modelId ?? config.model,
    ...(config.chatModel?.providerExpressionProfileId
      ? { providerExpressionProfileId: config.chatModel.providerExpressionProfileId }
      : {}),
  };
}

function readTurnSummaries(
  stores: TuiConversationStores,
): readonly TuiDebugAutomationTurnSummary[] {
  return stores.conversation.getState().messages.map((message) => ({
    id: message.id,
    role: message.role,
    ...(message.source ? { source: message.source } : {}),
    ...(message.displayKind ? { displayKind: message.displayKind } : {}),
    ...(message.metadata ? { metadata: message.metadata } : {}),
    content: readMessageSummaryContent(message),
    ...(message.isError ? { isError: true } : {}),
    toolCalls: readMessageToolCallSummaries(message),
    timeline: (message.timelineRows ?? []).map((row) => ({
      id: row.id,
      sequence: row.sequence,
      kind: row.kind,
      status: row.status,
      ...(row.content !== undefined ? { content: row.content } : {}),
      ...(row.toolCallId !== undefined ? { toolCallId: row.toolCallId } : {}),
      ...(row.toolName !== undefined ? { toolName: row.toolName } : {}),
    })),
    timestamp: message.timestamp,
  }));
}

export function readContinuationFacts(
  queueSnapshot: import('@neko-agent/types').AgentMessageQueueSnapshot | null,
  stores: TuiConversationStores,
): import('./types').TuiDebugAutomationContinuationFact[] {
  const facts: import('./types').TuiDebugAutomationContinuationFact[] = [];
  for (const message of stores.conversation.getState().messages) {
    if (!message.source || !isContinuationSource(message.source)) continue;
    facts.push({
      id: message.id,
      source: message.source,
      displayKind: normalizeContinuationDisplayKind(message.displayKind),
      promptSummary: readMessageSummaryContent(message),
      ...(message.metadata ? { metadata: message.metadata } : {}),
      status: message.metadata?.status ?? 'running',
      timestamp: message.timestamp,
    });
  }
  for (const item of queueSnapshot?.items ?? []) {
    if (!isContinuationSource(item.source)) continue;
    facts.push({
      id: item.id,
      source: normalizeContinuationSource(item.source),
      displayKind: item.displayKind ?? normalizeContinuationDisplayKind(item.displayKind),
      promptSummary: item.content.slice(0, 160),
      ...(item.metadata ? { metadata: item.metadata } : {}),
      status: item.metadata?.status ?? 'queued',
      timestamp: item.createdAt,
    });
  }
  return facts;
}

function isContinuationSource(
  source:
    | import('@neko-agent/types').AgentQueuedMessageSource
    | import('@neko-agent/types').AgentTurnSource,
): source is Exclude<import('@neko-agent/types').AgentTurnSource, 'user'> {
  return (
    source === 'task-result-continuation' ||
    source === 'subagent-result-continuation' ||
    source === 'system-continuation'
  );
}

function normalizeContinuationSource(
  source: import('@neko-agent/types').AgentQueuedMessageSource,
): Exclude<import('@neko-agent/types').AgentTurnSource, 'user'> {
  if (source === 'task-result-continuation') return source;
  if (source === 'subagent-result-continuation') return source;
  return 'system-continuation';
}

function normalizeContinuationDisplayKind(
  displayKind:
    import('@neko-agent/types').AgentQueuedMessageDisplayKind | Message['displayKind'] | undefined,
): import('@neko-agent/types').AgentQueuedMessageDisplayKind {
  if (
    displayKind === 'task-continuation' ||
    displayKind === 'subagent-continuation' ||
    displayKind === 'system-continuation'
  ) {
    return displayKind;
  }
  return 'system-continuation';
}

export function readMessageSummaryContent(message: Message): string {
  if (message.content.trim().length > 0) {
    return message.content;
  }
  const timelineText = (message.timelineRows ?? [])
    .filter((row) => row.kind === 'assistant_text' && row.content)
    .map((row) => row.content)
    .join('');
  return timelineText || message.content;
}

export function readMessageToolCallSummaries(
  message: Message,
): readonly TuiDebugAutomationToolCallSummary[] {
  const summaries = new Map<string, TuiDebugAutomationToolCallSummary>();
  for (const toolCall of message.toolCalls) {
    summaries.set(toolCall.id, projectToolCallSummary(toolCall));
  }
  for (const row of message.timelineRows ?? []) {
    if (row.kind !== 'tool' || !row.toolCallId || !row.toolName) continue;
    const existing = summaries.get(row.toolCallId);
    const result =
      row.toolResult !== undefined
        ? row.toolResult
        : existing?.result !== undefined
          ? existing.result
          : row.resultSummary;
    const error = row.toolError ?? existing?.error ?? row.diagnosticCode;
    summaries.set(row.toolCallId, {
      id: row.toolCallId,
      name: row.toolName,
      status: row.status,
      ...(row.toolArguments
        ? { arguments: row.toolArguments }
        : existing?.arguments
          ? { arguments: existing.arguments }
          : {}),
      ...(result !== undefined ? { result } : {}),
      ...(error ? { error } : {}),
    });
  }
  return [...summaries.values()];
}

function readRuntimeErrors(stores: TuiConversationStores): readonly string[] {
  const agentError = stores.agent.getState().error;
  const messageErrors = stores.conversation
    .getState()
    .messages.filter((message) => message.isError)
    .map((message) => message.content);
  return [...(agentError ? [agentError.message] : []), ...messageErrors];
}

function readCanvasFacts(stores: TuiConversationStores): TuiDebugAutomationCanvasFacts {
  const messages = stores.conversation.getState().messages;
  const canvasMessages = messages.filter((message) => messageContainsCanvasSignal(message));
  return {
    messageSummaries: canvasMessages.map((message) => message.content).filter(Boolean),
    toolCallSummaries: messages
      .flatMap((message) => message.toolCalls)
      .filter((toolCall) => safeJsonIncludesCanvas(toolCall))
      .map(projectToolCallSummary),
  };
}

function messageContainsCanvasSignal(message: Message): boolean {
  return (
    /canvas/i.test(message.content) ||
    message.toolCalls.some((toolCall) => safeJsonIncludesCanvas(toolCall)) ||
    (message.timelineRows ?? []).some((row) => safeJsonIncludesCanvas(row))
  );
}

function projectToolCallSummary(
  toolCall: Message['toolCalls'][number],
): TuiDebugAutomationToolCallSummary {
  return {
    id: toolCall.id,
    name: toolCall.name,
    status: toolCall.status,
    ...(toolCall.arguments ? { arguments: toolCall.arguments } : {}),
    ...(toolCall.result !== undefined ? { result: toolCall.result } : {}),
    ...(toolCall.error ? { error: toolCall.error } : {}),
  };
}

function safeJsonIncludesCanvas(value: unknown): boolean {
  try {
    return /canvas/i.test(JSON.stringify(value));
  } catch {
    return false;
  }
}
