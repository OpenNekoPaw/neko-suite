/**
 * Agent Executor Module
 */

export { AgentExecutor, createAgentExecutor, type AgentExecutorOptions } from './agent-executor';

// P1.6 — ReAct Loop Orchestrator (dual-flow primitive activation)
export {
  createReActLoopRunner,
  defaultClassifyTaskShape,
  type ReActLoopRunnerDeps,
  type ReActLoopRunnerState,
  type TaskShapeSignals,
} from './react-loop-runner';
export {
  createWorkflowRunStore,
  type IWorkflowRunStore,
  type WorkflowRunStoreConfig,
} from './workflow-run-store';
export {
  validateDispatch,
  assertDispatch,
  type DispatchValidation,
  type DispatchViolation,
  type DispatchViolationCode,
} from './primitive-dispatcher';
