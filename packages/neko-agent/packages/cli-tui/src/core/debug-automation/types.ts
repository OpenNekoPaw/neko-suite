import type { AgentMessageQueueSnapshot } from '@neko-agent/types';
import type { Task } from '@neko/shared';
import type { Message } from '../../types/state';

export const TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA = 'neko.tui-debug-automation.request.v1';
export const TUI_DEBUG_AUTOMATION_RESPONSE_SCHEMA = 'neko.tui-debug-automation.response.v1';

export type TuiDebugAutomationMethod =
  | 'session.create'
  | 'session.resume'
  | 'message.submit'
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

export interface TuiDebugAutomationSessionResumeParams
  extends TuiDebugAutomationSessionCreateParams {
  readonly conversationId: string;
}

export interface TuiDebugAutomationSessionRefParams {
  readonly sessionId: string;
}

export interface TuiDebugAutomationMessageSubmitParams
  extends TuiDebugAutomationSessionRefParams {
  readonly prompt: string;
}

export interface TuiDebugAutomationWaitForIdleParams
  extends TuiDebugAutomationSessionRefParams {
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
  readonly fullyIdle: boolean;
}

export interface TuiDebugAutomationModelIdentity {
  readonly providerId: string;
  readonly modelId: string;
  readonly providerExpressionProfileId?: string;
}

export interface TuiDebugAutomationTurnSummary {
  readonly id: string;
  readonly role: Message['role'];
  readonly content: string;
  readonly isError?: boolean;
  readonly toolCalls: readonly TuiDebugAutomationToolCallSummary[];
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
  readonly runtimeErrors: readonly string[];
  readonly canvas: TuiDebugAutomationCanvasFacts;
}

export interface TuiDebugAutomationAppPort {
  readonly ownerKind: 'tui-app-session-owner';
  isReady(): boolean;
  getConversationId(): string;
  submitMessage(input: { readonly prompt: string }): Promise<void>;
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
}
