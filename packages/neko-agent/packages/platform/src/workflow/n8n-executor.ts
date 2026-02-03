/**
 * N8n Workflow Client - Executes n8n workflows
 *
 * Uses shared HttpClient for HTTP operations.
 */

import type {
  Workflow,
  WorkflowInput,
  WorkflowResult,
  N8nWorkflowConfig,
} from '../types/workflow';
import type { WorkflowExecutor, WorkflowExecutionContext } from './workflow-manager';
import { PlatformError } from '../provider/platform-error';
import { getHttpClient, type HttpClient } from '../core/http-client';

/**
 * N8n execution response
 */
interface N8nExecutionResponse {
  executionId?: string;
  data?: {
    resultData?: {
      runData?: Record<string, unknown>;
    };
  };
  finished?: boolean;
  mode?: string;
  status?: string;
}

/**
 * N8n workflow executor
 */
export class N8nWorkflowExecutor implements WorkflowExecutor {
  private readonly http: HttpClient = getHttpClient();
  private defaultTimeout = 60000;

  /**
   * Execute an n8n workflow
   */
  async execute(
    workflow: Workflow,
    input: WorkflowInput,
    context?: WorkflowExecutionContext
  ): Promise<WorkflowResult> {
    const config = workflow.config as unknown as N8nWorkflowConfig;

    // Resolve credentials: prefer Provider credentials over config
    const instanceUrl = context?.provider?.apiUrl || config.instanceUrl;
    const apiKey = context?.provider?.apiKey || config.apiKey;

    if (!instanceUrl || !apiKey) {
      return {
        executionId: '',
        workflowId: workflow.id,
        status: 'failed',
        error: 'N8n instance URL and API key are required',
      };
    }

    const timeout = input.options?.timeout || this.defaultTimeout;

    try {
      // Determine execution method
      if (config.webhookPath) {
        return await this.executeViaWebhook(workflow, input, instanceUrl, config.webhookPath, timeout);
      } else {
        return await this.executeViaApi(workflow, input, instanceUrl, apiKey, timeout);
      }
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
   * Execute workflow via webhook
   */
  private async executeViaWebhook(
    workflow: Workflow,
    input: WorkflowInput,
    instanceUrl: string,
    webhookPath: string,
    timeout: number
  ): Promise<WorkflowResult> {
    const webhookUrl = `${instanceUrl}${webhookPath}`;

    const result = await this.http.requestSafe<Record<string, unknown>>({
      url: webhookUrl,
      method: 'POST',
      headers: {},
      body: input.data,
      timeout,
    });

    if (!result.success) {
      if (result.error.code === 'TIMEOUT') {
        throw new PlatformError({
          category: 'timeout',
          code: 'N8N_TIMEOUT',
          message: `N8n webhook timed out after ${timeout}ms`,
          retryable: true,
        });
      }

      return {
        executionId: '',
        workflowId: workflow.id,
        status: 'failed',
        error: `Webhook returned: ${result.error.message}`,
      };
    }

    return {
      executionId: '',
      workflowId: workflow.id,
      status: 'completed',
      output: result.data,
    };
  }

  /**
   * Execute workflow via n8n API
   */
  private async executeViaApi(
    workflow: Workflow,
    input: WorkflowInput,
    instanceUrl: string,
    apiKey: string,
    timeout: number
  ): Promise<WorkflowResult> {
    const apiUrl = `${instanceUrl}/api/v1/workflows/${workflow.id}/execute`;

    const result = await this.http.requestSafe<N8nExecutionResponse>({
      url: apiUrl,
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': apiKey,
      },
      body: { data: input.data },
      timeout,
    });

    if (!result.success) {
      if (result.error.code === 'TIMEOUT') {
        throw new PlatformError({
          category: 'timeout',
          code: 'N8N_TIMEOUT',
          message: `N8n API timed out after ${timeout}ms`,
          retryable: true,
        });
      }

      return {
        executionId: '',
        workflowId: workflow.id,
        status: 'failed',
        error: `N8n API returned: ${result.error.message}`,
      };
    }

    return {
      executionId: result.data.executionId || '',
      workflowId: workflow.id,
      status: result.data.finished ? 'completed' : 'running',
      output: result.data.data?.resultData?.runData,
    };
  }

  /**
   * Get execution status
   */
  async getExecution(executionId: string): Promise<WorkflowResult | undefined> {
    // Would need config context to implement
    // This is a placeholder for now
    return undefined;
  }
}
