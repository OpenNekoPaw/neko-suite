/**
 * TUI State Types
 *
 * Core state types for Zustand stores.
 * Aligned with AgentEvent from @neko/agent session types.
 */

import type { AgentResult } from '@neko/agent';
import type { AgentMessageQueueSnapshot } from '@neko-agent/types';

export type TerminalTimelineRowKind =
  'assistant_text' | 'thinking' | 'tool' | 'task' | 'media' | 'error' | 'diagnostic';

export type TerminalTimelineRowStatus =
  | 'streaming'
  | 'pending'
  | 'running'
  | 'waiting'
  | 'success'
  | 'error'
  | 'complete'
  | 'queued'
  | 'processing'
  | 'cancelled';

export interface TerminalTimelineParentAnchor {
  readonly kind: 'turn' | 'tool' | 'item';
  readonly id?: string;
}

export interface TerminalTimelineRow {
  readonly id: string;
  readonly sequence: number;
  readonly kind: TerminalTimelineRowKind;
  readonly status: TerminalTimelineRowStatus;
  readonly parent?: TerminalTimelineParentAnchor;
  readonly content?: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly argsSummary?: string;
  readonly resultSummary?: string;
  readonly backfillSummary?: string;
  readonly confirmationSummary?: string;
  readonly taskId?: string;
  readonly taskTitle?: string;
  readonly taskKind?: string;
  readonly progress?: number;
  readonly details?: string;
  readonly diagnosticCode?: string;
  readonly timestamp: number;
}

/**
 * Message in conversation history
 */
export interface Message {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  toolCalls: ToolCallState[];
  todos: TodoItem[];
  timelineRows?: TerminalTimelineRow[];
  readonly timestamp: number;
  /** True for error messages, false for informational system messages */
  readonly isError?: boolean;
}

/**
 * Tool call lifecycle state
 */
export interface ToolCallState {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: unknown;
  error?: string;
}

/**
 * Todo item rendered in assistant messages
 */
export interface TodoItem {
  readonly content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Agent execution status
 */
export type AgentStatus = 'idle' | 'running' | 'waiting_confirmation' | 'error';

/**
 * Execution mode (aligned with @neko/agent ExecutionMode)
 */
export type ExecutionMode = 'plan' | 'ask' | 'auto';

/**
 * Session mode (aligned with @neko-agent/types SessionMode)
 */
export type SessionMode = 'agent' | 'image' | 'video' | 'audio';

/**
 * Token usage stats
 */
export interface TokenUsage {
  readonly input: number;
  readonly output: number;
  readonly total: number;
}

/**
 * Iteration progress
 */
export interface IterationProgress {
  readonly current: number;
  readonly max: number;
}

export interface MessageQueueState {
  readonly snapshot: AgentMessageQueueSnapshot | null;
  readonly diagnostic: string | null;
}

export interface TaskStatusState {
  readonly runningSummary: string | null;
}

/**
 * Terminal dimensions
 */
export interface TerminalSize {
  readonly rows: number;
  readonly columns: number;
}

/**
 * TUI run result (extends CLIResult pattern)
 */
export interface TUIResult {
  readonly success: boolean;
  readonly output?: string;
  readonly error?: string;
  readonly agentResult?: AgentResult;
  readonly duration: number;
}
