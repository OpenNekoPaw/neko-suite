/**
 * Workflow Tool - Wraps workflows as platform tools
 */

import type { Tool, ToolResult, ToolCategory } from '../types/tool';
import type { Workflow, WorkflowInput } from '../types/workflow';
import { WorkflowManager } from './workflow-manager';

/**
 * Tool definition for LLM
 */
interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Workflow tool wrapper - wraps a workflow as a platform tool
 */
export class WorkflowTool implements Tool {
  readonly name: string;
  readonly description: string;
  readonly category: ToolCategory = 'workflow';
  readonly parameters: Record<string, unknown>;

  private workflowId: string;
  private workflowManager: WorkflowManager;

  constructor(workflowManager: WorkflowManager, workflow: Workflow) {
    this.workflowManager = workflowManager;
    this.workflowId = workflow.id;

    // Prefix tool name with workflow type
    this.name = `workflow_${workflow.type}_${workflow.id}`;
    this.description = workflow.description || `Workflow: ${workflow.name}`;
    this.parameters = workflow.inputSchema || {};
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const input: WorkflowInput = {
        workflowId: this.workflowId,
        data: args,
        options: {
          wait: true,
          timeout: 300000, // 5 minutes default
        },
      };

      const result = await this.workflowManager.execute(input);

      if (result.status === 'completed') {
        return {
          success: true,
          data: result.output,
        };
      } else {
        return {
          success: false,
          error: result.error || `Workflow ${result.status}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  toDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

/**
 * Create workflow tools from all registered workflows
 */
export async function createWorkflowTools(
  workflowManager: WorkflowManager
): Promise<WorkflowTool[]> {
  const workflows = await workflowManager.list();
  return workflows.map((workflow) => new WorkflowTool(workflowManager, workflow));
}
