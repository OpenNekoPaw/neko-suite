/**
 * Agent Store
 *
 * Tracks agent session state: execution status, mode,
 * iteration progress, token usage, and timing.
 */

import { create } from 'zustand';
import type { AgentStatus, ExecutionMode, TokenUsage, IterationProgress } from '../types/state';
import type { ActiveSkillLifecycleRecordProjection } from '@neko/shared';

export interface AgentSlice {
  // State
  readonly status: AgentStatus;
  readonly executionMode: ExecutionMode;
  readonly iteration: IterationProgress;
  readonly usage: TokenUsage;
  readonly startTime: number | null;
  readonly error: Error | null;
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
  setExecutionMode: (mode: ExecutionMode) => void;
  setActiveSkill: (name: string | null) => void;
  setActiveSkillLifecycleRecords: (
    records: readonly ActiveSkillLifecycleRecordProjection[],
  ) => void;
  reset: () => void;
}

const initialState = {
  status: 'idle' as AgentStatus,
  executionMode: 'auto' as ExecutionMode,
  iteration: { current: 0, max: 0 },
  usage: { input: 0, output: 0, total: 0 },
  startTime: null as number | null,
  error: null as Error | null,
  activeSkill: null as string | null,
  activeSkillLifecycleRecords: [] as readonly ActiveSkillLifecycleRecordProjection[],
};

export const useAgentStore = create<AgentSlice>((set) => ({
  ...initialState,

  setRunning: () => {
    set({ status: 'running', startTime: Date.now(), error: null });
  },

  setIdle: () => {
    set({ status: 'idle' });
  },

  setWaitingConfirmation: () => {
    set({ status: 'waiting_confirmation' });
  },

  setError: (error) => {
    set({ status: 'error', error });
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
