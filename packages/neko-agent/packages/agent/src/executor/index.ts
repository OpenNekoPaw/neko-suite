/**
 * Agent Executor Module
 */

export { AgentExecutor, createAgentExecutor, type AgentExecutorOptions } from './agent-executor';

// ReAct Loop Orchestrator (built-in creation stage activation per round)
export {
  createReActLoopRunner,
  defaultClassifyTaskShape,
  type ReActLoopRunnerDeps,
  type ReActLoopRunnerState,
  type TaskShapeSignals,
} from './react-loop-runner';
export {
  validateStageDispatch,
  assertStageDispatch,
  type StageDispatchValidation,
  type StageDispatchViolation,
  type StageDispatchViolationCode,
} from './stage-dispatcher';
