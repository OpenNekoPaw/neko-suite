/**
 * Agent Executor Module
 */

export { AgentExecutor, createAgentExecutor, type AgentExecutorOptions } from './agent-executor';

// ReAct Loop Orchestrator (IDC stage activation per round)
export {
  createReActLoopRunner,
  defaultClassifyTaskShape,
  type ReActLoopRunnerDeps,
  type ReActLoopRunnerState,
  type TaskShapeSignals,
} from './react-loop-runner';
export { createIdcRunStore, type IIdcRunStore, type IdcRunStoreConfig } from './idc-run-store';
export {
  validateStageDispatch,
  assertStageDispatch,
  type StageDispatchValidation,
  type StageDispatchViolation,
  type StageDispatchViolationCode,
} from './stage-dispatcher';
