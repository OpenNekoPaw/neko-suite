/**
 * Workflow Module - Workflow integration
 */

export { WorkflowManager } from './workflow-manager';
export type { WorkflowExecutor, WorkflowExecutionContext } from './workflow-manager';
export { BuiltinWorkflowExecutor } from './builtin-executor';
export type { BuiltinWorkflowHandler } from './builtin-executor';
export { N8nWorkflowExecutor } from './n8n-executor';
export { ComfyUIWorkflowExecutor } from './comfyui-executor';
export { WorkflowTool, createWorkflowTools } from './workflow-tool';
export {
  WorkflowTestService,
  getWorkflowTestService,
  type WorkflowTestConfig,
  type WorkflowTestResult,
  type WorkflowEngineType,
} from './workflow-test-service';

// Re-export types
export type {
  WorkflowType,
  WorkflowStatus,
  Workflow,
  WorkflowInput,
  WorkflowResult,
  N8nWorkflowConfig,
  ComfyUIWorkflowConfig,
  WorkflowManager as IWorkflowManager,
} from '../types/workflow';
