/**
 * Agent Hooks Module
 */

export {
  RetryHooks,
  MemoryHooks,
  composeHooks,
  createRetryHooks,
  createMemoryHooks,
  type RetryHooksOptions,
  type MemoryHooksOptions,
} from './hooks';

// Recording hooks - execution recording and replay
export {
  RecordingHooks,
  createRecordingHooks,
  DEFAULT_RECORDING_CONFIG,
  type RecordingConfig,
  type RecordedStep,
  type AgentRecording,
  type ReplayOptions,
} from './recording-hooks';

// Checkpoint hooks - execution checkpoint and recovery
export {
  CheckpointHooks,
  createCheckpointHooks,
  InMemoryCheckpointStorage,
  createInMemoryCheckpointStorage,
  DEFAULT_CHECKPOINT_POLICY,
  type CheckpointPolicy,
  type ICheckpointStorage,
  type CheckpointHooksOptions,
} from './checkpoint-hooks';

// Note: ToolSkillHook has been removed - ToolInjectionManager handles
// automatic skill activation in getSkillTools() via skillRegistry.match()
