/**
 * Agent Store
 *
 * Tracks agent session state: execution status, mode,
 * iteration progress, token usage, and timing.
 */

import { create } from 'zustand';
import { createStore, type StateCreator, type StoreApi } from 'zustand/vanilla';
import type {
  AgentStatus,
  ContextTokenState,
  ExecutionMode,
  MessageQueueState,
  SessionMode,
  TaskStatusState,
  TokenUsage,
  IterationProgress,
} from '../types/state';
import type { ActiveSkillLifecycleRecordProjection, Task } from '@neko/shared';

export interface AgentSlice {
  // State
  readonly status: AgentStatus;
  readonly sessionMode: SessionMode;
  readonly executionMode: ExecutionMode;
  readonly iteration: IterationProgress;
  readonly usage: TokenUsage;
  readonly contextTokens: ContextTokenState;
  readonly startTime: number | null;
  readonly error: Error | null;
  readonly messageQueue: MessageQueueState;
  readonly tasks: TaskStatusState;
  /** Currently active skill name (null if none) */
  readonly activeSkill: string | null;
  /** Active Skill lifecycle records projected for CLI/TUI surfaces. */
  readonly activeSkillLifecycleRecords: readonly ActiveSkillLifecycleRecordProjection[];

  // Actions
  setRunning: () => void;
  setIdle: () => void;
  setWaitingConfirmation: () => void;
  setError: (error: Error) => void;
  setIteration: (current: number, max: number) => void;
  updateUsage: (usage: { inputTokens: number; outputTokens: number; totalTokens: number }) => void;
  setContextTokenCount: (count: number | null) => void;
  setMessageQueueSnapshot: (snapshot: MessageQueueState['snapshot']) => void;
  setMessageQueueDiagnostic: (diagnostic: string | null) => void;
  setMessageQueuePausedAfterCancel: (paused: boolean) => void;
  setRunningTasks: (tasks: readonly Task[]) => void;
  setSessionMode: (mode: SessionMode) => void;
  setExecutionMode: (mode: ExecutionMode) => void;
  setActiveSkill: (name: string | null) => void;
  setActiveSkillLifecycleRecords: (
    records: readonly ActiveSkillLifecycleRecordProjection[],
  ) => void;
  reset: () => void;
}

const initialState = {
  status: 'idle' as AgentStatus,
  sessionMode: 'agent' as SessionMode,
  executionMode: 'auto' as ExecutionMode,
  iteration: { current: 0, max: 0 },
  usage: { input: 0, output: 0, total: 0 },
  contextTokens: { count: null } as ContextTokenState,
  startTime: null as number | null,
  error: null as Error | null,
  messageQueue: {
    snapshot: null,
    diagnostic: null,
    pausedAfterCancel: false,
  } as MessageQueueState,
  tasks: {
    running: [],
  } as TaskStatusState,
  activeSkill: null as string | null,
  activeSkillLifecycleRecords: [] as readonly ActiveSkillLifecycleRecordProjection[],
};

export type AgentStore = StoreApi<AgentSlice>;

export function createAgentStore(assertMutable: () => void = () => undefined): AgentStore {
  return createStore<AgentSlice>(createAgentState(assertMutable));
}

function createAgentState(assertMutable: () => void): StateCreator<AgentSlice> {
  return (set) => {
    const update = (
      next:
        | AgentSlice
        | Partial<AgentSlice>
        | ((state: AgentSlice) => AgentSlice | Partial<AgentSlice>),
    ): void => {
      assertMutable();
      set(next);
    };

    return {
      ...initialState,

      setRunning: () => {
        update((state) => ({
          status: 'running',
          startTime: state.startTime ?? Date.now(),
          error: null,
        }));
      },

      setIdle: () => {
        update({ status: 'idle', startTime: null });
      },

      setWaitingConfirmation: () => {
        update({ status: 'waiting_confirmation' });
      },

      setError: (error) => {
        update({ status: 'error', startTime: null, error });
      },

      setIteration: (current, max) => {
        update({ iteration: { current, max } });
      },

      updateUsage: (usage) => {
        update({
          usage: {
            input: usage.inputTokens,
            output: usage.outputTokens,
            total: usage.totalTokens,
          },
        });
      },

      setContextTokenCount: (count) => {
        update({
          contextTokens: {
            count,
          },
        });
      },

      setMessageQueueSnapshot: (snapshot) => {
        update((state) => ({
          messageQueue: {
            ...state.messageQueue,
            snapshot,
            diagnostic: null,
          },
        }));
      },

      setMessageQueueDiagnostic: (diagnostic) => {
        update((state) => ({
          messageQueue: {
            ...state.messageQueue,
            diagnostic,
          },
        }));
      },

      setMessageQueuePausedAfterCancel: (pausedAfterCancel) => {
        update((state) => ({
          messageQueue: {
            ...state.messageQueue,
            pausedAfterCancel,
          },
        }));
      },

      setRunningTasks: (tasks) => {
        update({
          tasks: {
            running: [...tasks],
          },
        });
      },

      setSessionMode: (mode) => {
        update({ sessionMode: mode });
      },

      setExecutionMode: (mode) => {
        update({ executionMode: mode });
      },

      setActiveSkill: (name) => {
        update({ activeSkill: name });
      },

      setActiveSkillLifecycleRecords: (records) => {
        update({
          activeSkillLifecycleRecords: [...records],
          activeSkill: records[0]?.skillName ?? null,
        });
      },

      reset: () => {
        update(initialState);
      },
    };
  };
}

/** @deprecated Use the application-owned store exposed by TuiRuntimeProvider. */
export const useAgentStore = create<AgentSlice>(createAgentState(() => undefined));
