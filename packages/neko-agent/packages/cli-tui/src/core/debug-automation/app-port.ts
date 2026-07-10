import type { AgentMessageQueueSnapshot } from '@neko-agent/types';
import type { Task } from '@neko/shared';
import { useAgentStore } from '../../stores/agent-store';
import { useConfigStore } from '../../stores/config-store';
import { useConversationStore } from '../../stores/conversation-store';
import type { Message } from '../../types/state';
import type {
  TuiDebugAutomationAppPort,
  TuiDebugAutomationCanvasFacts,
  TuiDebugAutomationIdleConcern,
  TuiDebugAutomationIdleState,
  TuiDebugAutomationSessionFacts,
  TuiDebugAutomationToolCallSummary,
  TuiDebugAutomationTurnSummary,
} from './types';
import { TuiDebugAutomationProtocolError } from './protocol';

export interface TuiAutomationSessionHandle {
  readonly isReady: boolean;
  readonly submit: (prompt: string) => Promise<void>;
  readonly listTasks: () => Promise<readonly Task[]>;
  readonly getCurrentConversationId: () => string;
  readonly getHistory: () => readonly unknown[];
  readonly getMessageQueueSnapshot: () => AgentMessageQueueSnapshot | null;
}

export interface TuiAutomationAppPortOptions {
  readonly readHandle: () => TuiAutomationSessionHandle;
}

export function createTuiAutomationAppPort(
  options: TuiAutomationAppPortOptions,
): TuiDebugAutomationAppPort {
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
      await handle.submit(input.prompt);
    },

    async waitForIdle(input): Promise<TuiDebugAutomationIdleState> {
      return waitForTuiAutomationIdle({
        readIdle: async () => readTuiAutomationIdleState(options.readHandle()),
        timeoutMs: input.timeoutMs,
        pollIntervalMs: input.pollIntervalMs,
      });
    },

    async readFacts(input): Promise<TuiDebugAutomationSessionFacts> {
      const handle = options.readHandle();
      const idle = await readTuiAutomationIdleState(handle);
      return {
        sessionId: input.sessionId,
        conversationId: handle.getCurrentConversationId(),
        ready: handle.isReady,
        model: readModelIdentity(),
        idle,
        turns: readTurnSummaries(),
        ...(input.includeHistory ? { history: [...handle.getHistory()] } : {}),
        skillActivations: [...useAgentStore.getState().activeSkillLifecycleRecords],
        tasks: (await readTasks(handle)).map((task) => ({
          id: task.id,
          type: task.type,
          status: task.status,
          progress: task.progress,
          ...(task.error ? { error: task.error } : {}),
        })),
        messageQueue: handle.getMessageQueueSnapshot(),
        runtimeErrors: readRuntimeErrors(),
        canvas: readCanvasFacts(),
      };
    },
  };
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
): Promise<TuiDebugAutomationIdleState> {
  const agentState = useAgentStore.getState();
  const tasks = await readTasks(handle);
  const runningTasks = tasks.filter((task) => !isTerminalTaskStatus(String(task.status)));
  const taskDiagnostic =
    runningTasks.length > 0 ? `${runningTasks.length} background task(s) still active.` : undefined;
  const turnIdle =
    agentState.status === 'idle' || agentState.status === 'error'
      ? idleConcern(agentState.status, true)
      : busyConcern(agentState.status);
  const backgroundTasksIdle =
    runningTasks.length === 0
      ? idleConcern('idle', true)
      : busyConcern('running', taskDiagnostic);
  const mediaDeliveryIdle = backgroundTasksIdle;
  const taskResultObservationIdle = backgroundTasksIdle;

  return {
    turnIdle,
    backgroundTasksIdle,
    mediaDeliveryIdle,
    taskResultObservationIdle,
    fullyIdle:
      turnIdle.idle &&
      backgroundTasksIdle.idle &&
      mediaDeliveryIdle.idle &&
      taskResultObservationIdle.idle,
  };
}

async function readTasks(handle: TuiAutomationSessionHandle): Promise<readonly Task[]> {
  if (!handle.isReady) {
    return [];
  }
  try {
    return await handle.listTasks();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useConversationStore.getState().addError(new Error(`Debug task fact read failed: ${message}`));
    return [];
  }
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

function readModelIdentity(): TuiDebugAutomationSessionFacts['model'] {
  const config = useConfigStore.getState().config;
  return {
    providerId: config.chatModel?.providerId ?? config.provider,
    modelId: config.chatModel?.modelId ?? config.model,
    ...(config.chatModel?.providerExpressionProfileId
      ? { providerExpressionProfileId: config.chatModel.providerExpressionProfileId }
      : {}),
  };
}

function readTurnSummaries(): readonly TuiDebugAutomationTurnSummary[] {
  return useConversationStore.getState().messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: readMessageSummaryContent(message),
    ...(message.isError ? { isError: true } : {}),
    toolCalls: readMessageToolCallSummaries(message),
    timestamp: message.timestamp,
  }));
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
    summaries.set(row.toolCallId, {
      id: row.toolCallId,
      name: row.toolName,
      status: row.status,
      ...(existing?.arguments ? { arguments: existing.arguments } : {}),
      ...(existing?.result !== undefined ? { result: existing.result } : {}),
      ...(row.resultSummary ? { result: row.resultSummary } : {}),
      ...(existing?.error ? { error: existing.error } : {}),
      ...(row.diagnosticCode ? { error: row.diagnosticCode } : {}),
    });
  }
  return [...summaries.values()];
}

function readRuntimeErrors(): readonly string[] {
  const agentError = useAgentStore.getState().error;
  const messageErrors = useConversationStore
    .getState()
    .messages.filter((message) => message.isError)
    .map((message) => message.content);
  return [...(agentError ? [agentError.message] : []), ...messageErrors];
}

function readCanvasFacts(): TuiDebugAutomationCanvasFacts {
  const messages = useConversationStore.getState().messages;
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

function projectToolCallSummary(toolCall: Message['toolCalls'][number]): TuiDebugAutomationToolCallSummary {
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
