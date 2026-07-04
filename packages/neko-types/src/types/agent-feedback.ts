import type { PerceptionEvidence } from './agent-observation';

export interface AgentObservedToolResult {
  readonly callId?: string;
  readonly name?: string;
  readonly success: boolean;
  readonly data?: unknown;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentToolReviewFeedbackSignal {
  readonly kind: 'tool-review';
  readonly observedAt: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: 'passed' | 'failed';
  readonly summary: string;
  readonly repairGuidance?: string;
  readonly escalationMessage?: string;
  readonly repeatKey?: string;
  readonly runId?: string;
  readonly evidence?: PerceptionEvidence;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentToolResultFeedbackAdapterInput {
  readonly result: AgentObservedToolResult;
  readonly toolArguments?: Record<string, unknown>;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly observedAt: number;
  readonly runId?: string;
}

export interface AgentToolResultFeedbackAdapter {
  readonly id: string;
  createSignal(input: AgentToolResultFeedbackAdapterInput): AgentToolReviewFeedbackSignal | null;
}
