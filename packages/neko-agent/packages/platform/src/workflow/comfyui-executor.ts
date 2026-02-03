/**
 * ComfyUI Workflow Client - Executes ComfyUI workflows
 *
 * Uses shared HttpClient for HTTP operations.
 */

import type {
  Workflow,
  WorkflowInput,
  WorkflowResult,
  ComfyUIWorkflowConfig,
} from '../types/workflow';
import type { WorkflowExecutor, WorkflowExecutionContext } from './workflow-manager';
import { PlatformError } from '../provider/platform-error';
import { getHttpClient, type HttpClient } from '../core/http-client';

/**
 * ComfyUI prompt response
 */
interface ComfyUIPromptResponse {
  prompt_id: string;
  number?: number;
  node_errors?: Record<string, unknown>;
}

/**
 * ComfyUI history item
 */
interface ComfyUIHistoryItem {
  status: {
    status_str: string;
    completed: boolean;
  };
  outputs?: Record<string, { images?: Array<{ filename: string }> }>;
}

/**
 * ComfyUI workflow executor
 */
export class ComfyUIWorkflowExecutor implements WorkflowExecutor {
  private readonly http: HttpClient = getHttpClient();
  private defaultTimeout = 300000; // 5 minutes for image generation
  private pollInterval = 1000;

  /**
   * Execute a ComfyUI workflow
   */
  async execute(
    workflow: Workflow,
    input: WorkflowInput,
    context?: WorkflowExecutionContext
  ): Promise<WorkflowResult> {
    const config = workflow.config as unknown as ComfyUIWorkflowConfig;

    // Resolve credentials: prefer Provider URL over config
    const serverUrl = context?.provider?.apiUrl || config.serverUrl;

    if (!serverUrl) {
      return {
        executionId: '',
        workflowId: workflow.id,
        status: 'failed',
        error: 'ComfyUI server URL is required',
      };
    }

    const timeout = input.options?.timeout || this.defaultTimeout;
    const wait = input.options?.wait !== false; // Default to waiting

    try {
      // Prepare prompt with input data
      const prompt = this.preparePrompt(config.workflow, input.data);

      // Queue the prompt
      const promptResponse = await this.queuePrompt(
        serverUrl,
        prompt,
        config.clientId
      );

      if (promptResponse.node_errors && Object.keys(promptResponse.node_errors).length > 0) {
        return {
          executionId: promptResponse.prompt_id,
          workflowId: workflow.id,
          status: 'failed',
          error: `Node errors: ${JSON.stringify(promptResponse.node_errors)}`,
        };
      }

      if (!wait) {
        return {
          executionId: promptResponse.prompt_id,
          workflowId: workflow.id,
          status: 'running',
        };
      }

      // Wait for completion
      const result = await this.waitForCompletion(
        serverUrl,
        promptResponse.prompt_id,
        timeout
      );

      return {
        executionId: promptResponse.prompt_id,
        workflowId: workflow.id,
        status: result.status.completed ? 'completed' : 'failed',
        output: result.outputs,
        error: result.status.completed ? undefined : result.status.status_str,
      };
    } catch (error) {
      if (error instanceof PlatformError) throw error;

      return {
        executionId: '',
        workflowId: workflow.id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get execution status
   */
  async getExecution(executionId: string): Promise<WorkflowResult | undefined> {
    // Would need config context to implement
    return undefined;
  }

  /**
   * Prepare prompt with input data
   */
  private preparePrompt(
    workflowTemplate: Record<string, unknown>,
    inputData: Record<string, unknown>
  ): Record<string, unknown> {
    // Deep clone the workflow template
    const prompt = JSON.parse(JSON.stringify(workflowTemplate));

    // Apply input data to relevant nodes
    for (const [key, value] of Object.entries(inputData)) {
      // Look for nodes that match the input key
      for (const nodeId of Object.keys(prompt)) {
        const node = prompt[nodeId] as Record<string, unknown>;
        const inputs = node.inputs as Record<string, unknown> | undefined;

        if (inputs && key in inputs) {
          inputs[key] = value;
        }
      }
    }

    return prompt;
  }

  /**
   * Queue a prompt for execution
   */
  private async queuePrompt(
    serverUrl: string,
    prompt: Record<string, unknown>,
    clientId?: string
  ): Promise<ComfyUIPromptResponse> {
    const result = await this.http.requestSafe<ComfyUIPromptResponse>({
      url: `${serverUrl}/prompt`,
      method: 'POST',
      headers: {},
      body: {
        prompt,
        client_id: clientId || `neko_${Date.now()}`,
      },
    });

    if (!result.success) {
      throw new PlatformError({
        category: 'server',
        code: 'COMFYUI_ERROR',
        message: `ComfyUI returned: ${result.error.message}`,
        retryable: result.error.retryable,
      });
    }

    return result.data;
  }

  /**
   * Wait for prompt execution to complete
   */
  private async waitForCompletion(
    serverUrl: string,
    promptId: string,
    timeout: number
  ): Promise<ComfyUIHistoryItem> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const history = await this.getHistory(serverUrl, promptId);

      if (history) {
        return history;
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
    }

    throw new PlatformError({
      category: 'timeout',
      code: 'COMFYUI_TIMEOUT',
      message: `ComfyUI execution timed out after ${timeout}ms`,
      retryable: false,
    });
  }

  /**
   * Get execution history
   */
  private async getHistory(
    serverUrl: string,
    promptId: string
  ): Promise<ComfyUIHistoryItem | undefined> {
    const result = await this.http.requestSafe<Record<string, ComfyUIHistoryItem>>({
      url: `${serverUrl}/history/${promptId}`,
      method: 'GET',
      headers: {},
    });

    if (!result.success) {
      return undefined;
    }

    return result.data[promptId];
  }
}
