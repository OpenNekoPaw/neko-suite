/**
 * Builtin Workflow Executor - Executes builtin workflows
 */

import type { Workflow, WorkflowInput, WorkflowResult } from '../types/workflow';
import type { WorkflowExecutor, WorkflowExecutionContext } from './workflow-manager';

/**
 * Builtin workflow handler type
 */
export type BuiltinWorkflowHandler = (
  data: Record<string, unknown>
) => Promise<Record<string, unknown>>;

/**
 * Builtin workflow executor
 */
export class BuiltinWorkflowExecutor implements WorkflowExecutor {
  private handlers: Map<string, BuiltinWorkflowHandler> = new Map();

  /**
   * Register a handler for a workflow ID
   */
  registerHandler(workflowId: string, handler: BuiltinWorkflowHandler): void {
    this.handlers.set(workflowId, handler);
  }

  /**
   * Unregister a handler
   */
  unregisterHandler(workflowId: string): void {
    this.handlers.delete(workflowId);
  }

  /**
   * Execute a builtin workflow
   */
  async execute(
    workflow: Workflow,
    input: WorkflowInput,
    _context?: WorkflowExecutionContext
  ): Promise<WorkflowResult> {
    const handler = this.handlers.get(workflow.id);

    if (!handler) {
      return {
        executionId: '',
        workflowId: workflow.id,
        status: 'failed',
        error: `No handler registered for workflow: ${workflow.id}`,
      };
    }

    try {
      const output = await handler(input.data);

      return {
        executionId: '',
        workflowId: workflow.id,
        status: 'completed',
        output,
      };
    } catch (error) {
      return {
        executionId: '',
        workflowId: workflow.id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
