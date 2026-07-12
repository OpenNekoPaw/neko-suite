/**
 * Agent Store
 *
 * Tracks agent session state: execution status, mode,
 * iteration progress, token usage, and timing.
 */

import { create } from 'zustand';
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

export const useAgentStore = create<AgentSlice>((set) => ({
  ...initialState,

  setRunning: () => {
    set((state) => ({
      status: 'running',
      startTime: state.startTime ?? Date.now(),
      error: null,
    }));
  },

  setIdle: () => {
    set({ status: 'idle', startTime: null });
  },

  setWaitingConfirmation: () => {
    set({ status: 'waiting_confirmation' });
  },

  setError: (error) => {
    set({ status: 'error', startTime: null, error });
  },

  setIteration: (current, max) => {
    set({ iteration: { current, max } });
  },

  updateUsage: (usage) => {
    set({
      usage: {
        input: usage.inputTokens,
        output: usage.outputTokens,
        total: usage.totalTokens,
      },
    });
  },

  setContextTokenCount: (count) => {
    set({
      contextTokens: {
        count,
      },
    });
  },

  setMessageQueueSnapshot: (snapshot) => {
    set((state) => ({
      messageQueue: {
        ...state.messageQueue,
        snapshot,
        diagnostic: null,
      },
    }));
  },

  setMessageQueueDiagnostic: (diagnostic) => {
    set((state) => ({
      messageQueue: {
        ...state.messageQueue,
        diagnostic,
      },
    }));
  },

  setMessageQueuePausedAfterCancel: (pausedAfterCancel) => {
    set((state) => ({
      messageQueue: {
        ...state.messageQueue,
        pausedAfterCancel,
      },
    }));
  },

  setRunningTasks: (tasks) => {
    set({
      tasks: {
        running: [...tasks],
      },
    });
  },

  setSessionMode: (mode) => {
    set({ sessionMode: mode });
  },

  setExecutionMode: (mode) => {
    set({ executionMode: mode });
  },

  setActiveSkill: (name) => {
    set({ activeSkill: name });
  },

  setActiveSkillLifecycleRecords: (records) => {
    set({
      activeSkillLifecycleRecords: [...records],
      activeSkill: records[0]?.skillName ?? null,
    });
  },

  reset: () => {
    set(initialState);
  },
}));
