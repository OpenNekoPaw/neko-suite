import type {
  AgentContinuationMetadata,
  AgentMessageQueueSnapshot,
  AgentQueuedMessageDisplayKind,
  AgentTurnSource,
} from '@neko-agent/types';
import type { Task } from '@neko/shared';
import type { Message } from '../../types/state';
import type { TerminalMarkdownPathEvent } from '../../markdown/path-observer';

export const TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA = 'neko.tui-debug-automation.request.v1';
export const TUI_DEBUG_AUTOMATION_RESPONSE_SCHEMA = 'neko.tui-debug-automation.response.v1';

export type TuiDebugAutomationMethod =
  | 'session.create'
  | 'session.resume'
  | 'message.submit'
  | 'message.cancel'
  | 'terminal.resize'
  | 'session.waitForIdle'
  | 'session.facts'
  | 'session.dispose';

export type TuiDebugAutomationErrorCode =
  | 'invalid-json'
  | 'invalid-schema'
  | 'invalid-request'
  | 'unknown-method'
  | 'invalid-timeout'
  | 'session-not-found'
  | 'session-disposed'
  | 'session-not-ready'
  | 'session-timeout'
  | 'internal-error';

export interface TuiDebugAutomationRequest {
  readonly schema: typeof TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA;
  readonly id: string;
  readonly method: TuiDebugAutomationMethod;
  readonly params?: unknown;
}

export interface TuiDebugAutomationError {
  readonly code: TuiDebugAutomationErrorCode;
  readonly message: string;
  readonly details?: unknown;
}

export type TuiDebugAutomationResponse =
  | {
      readonly schema: typeof TUI_DEBUG_AUTOMATION_RESPONSE_SCHEMA;
      readonly id: string | null;
      readonly ok: true;
      readonly result: unknown;
    }
  | {
      readonly schema: typeof TUI_DEBUG_AUTOMATION_RESPONSE_SCHEMA;
      readonly id: string | null;
      readonly ok: false;
      readonly error: TuiDebugAutomationError;
    };

export interface TuiDebugAutomationSessionCreateParams {
  readonly workDir?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly apiKey?: string;
  readonly initialPrompt?: string;
}

export interface TuiDebugAutomationSessionResumeParams extends TuiDebugAutomationSessionCreateParams {
  readonly conversationId: string;
}

export interface TuiDebugAutomationSessionRefParams {
  readonly sessionId: string;
}

export interface TuiDebugAutomationMessageSubmitParams extends TuiDebugAutomationSessionRefParams {
  readonly prompt: string;
}

export type TuiDebugAutomationMessageCancelParams = TuiDebugAutomationSessionRefParams;

export interface TuiDebugAutomationMessageCancelled {
  readonly sessionId: string;
  readonly conversationId: string;
  readonly accepted: boolean;
}

export interface TuiDebugAutomationTerminalResizeParams extends TuiDebugAutomationSessionRefParams {
  readonly columns: number;
  readonly rows: number;
}

export interface TuiDebugAutomationTerminalResized {
  readonly sessionId: string;
  readonly columns: number;
  readonly rows: number;
}

export interface TuiDebugAutomationWaitForIdleParams extends TuiDebugAutomationSessionRefParams {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}

export interface TuiDebugAutomationFactsParams extends TuiDebugAutomationSessionRefParams {
  readonly includeHistory?: boolean;
}

export type TuiDebugAutomationDisposeParams = TuiDebugAutomationSessionRefParams;

export interface TuiDebugAutomationSessionCreated {
  readonly sessionId: string;
  readonly conversationId: string;
}

export interface TuiDebugAutomationMessageSubmitted {
  readonly sessionId: string;
  readonly conversationId: string;
  readonly queued: boolean;
  readonly idle: TuiDebugAutomationIdleState;
}

export interface TuiDebugAutomationIdleConcern {
  readonly idle: boolean;
  readonly terminal: boolean;
  readonly status?: string;
  readonly diagnostic?: string;
}

export interface TuiDebugAutomationIdleState {
  readonly turnIdle: TuiDebugAutomationIdleConcern;
  readonly backgroundTasksIdle: TuiDebugAutomationIdleConcern;
  readonly mediaDeliveryIdle: TuiDebugAutomationIdleConcern;
  readonly taskResultObservationIdle: TuiDebugAutomationIdleConcern;
  readonly continuationQueueIdle?: TuiDebugAutomationIdleConcern;
  readonly fullyIdle: boolean;
}

export interface TuiDebugAutomationModelIdentity {
  readonly providerId: string;
  readonly modelId: string;
  readonly providerExpressionProfileId?: string;
}

export interface TuiDebugAutomationTimelineRowSummary {
  readonly id: string;
  readonly sequence: number;
  readonly kind: import('../../types/state').TerminalTimelineRowKind;
  readonly status: import('../../types/state').TerminalTimelineRowStatus;
  readonly content?: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
}

export interface TuiDebugAutomationTurnSummary {
  readonly id: string;
  readonly role: Message['role'];
  readonly source?: AgentTurnSource;
  readonly displayKind?: Message['displayKind'];
  readonly metadata?: AgentContinuationMetadata;
  readonly content: string;
  readonly isError?: boolean;
  readonly toolCalls: readonly TuiDebugAutomationToolCallSummary[];
  readonly timeline: readonly TuiDebugAutomationTimelineRowSummary[];
  readonly timestamp: number;
}

export interface TuiDebugAutomationContinuationFact {
  readonly id: string;
  readonly source: Exclude<AgentTurnSource, 'user'>;
  readonly displayKind: AgentQueuedMessageDisplayKind;
  readonly promptSummary?: string;
  readonly metadata?: AgentContinuationMetadata;
  readonly status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'discarded';
  readonly timestamp: number;
}

export interface TuiDebugAutomationToolCallSummary {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly arguments?: unknown;
  readonly result?: unknown;
  readonly error?: string;
}

export interface TuiDebugAutomationCanvasFacts {
  readonly messageSummaries: readonly string[];
  readonly toolCallSummaries: readonly TuiDebugAutomationToolCallSummary[];
}

export interface TuiDebugAutomationMarkdownFacts {
  readonly pathEvents: readonly TerminalMarkdownPathEvent[];
  readonly droppedPathEventCount: number;
}

export interface TuiDebugAutomationSessionFacts {
  readonly sessionId: string;
  readonly conversationId: string;
  readonly ready: boolean;
  readonly model: TuiDebugAutomationModelIdentity;
  readonly idle: TuiDebugAutomationIdleState;
  readonly turns: readonly TuiDebugAutomationTurnSummary[];
  readonly history?: readonly unknown[];
  readonly skillActivations: readonly unknown[];
  readonly tasks: readonly Pick<Task, 'id' | 'type' | 'status' | 'progress' | 'error'>[];
  readonly messageQueue: AgentMessageQueueSnapshot | null;
  readonly continuations: readonly TuiDebugAutomationContinuationFact[];
  readonly runtimeErrors: readonly string[];
  readonly canvas: TuiDebugAutomationCanvasFacts;
  readonly markdown: TuiDebugAutomationMarkdownFacts;
}

export interface TuiDebugAutomationAppPort {
  readonly ownerKind: 'tui-app-session-owner';
  isReady(): boolean;
  getConversationId(): string;
  submitMessage(input: { readonly prompt: string }): Promise<void>;
  cancelActiveMessage(): boolean;
  resizeTerminal(input: { readonly columns: number; readonly rows: number }): void;
  waitForIdle(input: {
    readonly timeoutMs: number;
    readonly pollIntervalMs: number;
  }): Promise<TuiDebugAutomationIdleState>;
  readFacts(input: {
    readonly sessionId: string;
    readonly includeHistory: boolean;
  }): Promise<TuiDebugAutomationSessionFacts>;
}

export interface TuiDebugAutomationController {
  bind(port: TuiDebugAutomationAppPort): void;
  unbind(port: TuiDebugAutomationAppPort): void;
  readMarkdownFacts(): TuiDebugAutomationMarkdownFacts;
  dispose(): void;
}
