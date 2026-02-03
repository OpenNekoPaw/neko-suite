/**
 * Workflow Test Service - Tests workflow engine connectivity
 *
 * Moved from Extension layer to maintain proper separation of concerns.
 * Extension should only handle UI interactions, not HTTP requests.
 */

import { getHttpClient, type HttpClient } from '../core/http-client';

/**
 * Supported workflow engine types
 */
export type WorkflowEngineType =
  | 'comfyui'
  | 'dify'
  | 'n8n'
  | 'langflow'
  | 'flowise'
  | 'custom';

/**
 * Workflow test configuration
 */
export interface WorkflowTestConfig {
  /** Workflow ID */
  id: string;
  /** Workflow name */
  name: string;
  /** Engine type */
  engineType: WorkflowEngineType | string;
  /** Base URL of the workflow engine */
  url: string;
  /** API key for authentication */
  apiKey?: string;
  /** Test timeout in ms (default: 10000) */
  timeout?: number;
}

/**
 * Workflow test result
 */
export interface WorkflowTestResult {
  /** Whether the test succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Workflow ID that was tested */
  workflowId: string;
  /** HTTP status code (if applicable) */
  statusCode?: number;
}

/**
 * Engine-specific test endpoints
 */
const ENGINE_TEST_ENDPOINTS: Record<string, string> = {
  comfyui: '/system_stats',
  dify: '/v1/workflows',
  n8n: '/healthz',
  langflow: '/health',
  flowise: '/api/v1/ping',
};

/**
 * Workflow Test Service
 *
 * Tests workflow engine connectivity by making HTTP requests
 * to engine-specific health/status endpoints.
 */
export class WorkflowTestService {
  private readonly http: HttpClient = getHttpClient();
  private defaultTimeout = 10000;

  /**
   * Test a workflow engine connection
   *
   * Makes an HTTP GET request to the appropriate health endpoint
   * based on the engine type. Any response < 500 is considered success.
   */
  async test(config: WorkflowTestConfig): Promise<WorkflowTestResult> {
    const timeout = config.timeout ?? this.defaultTimeout;

    try {
      // Normalize URL (remove trailing slash)
      const baseUrl = config.url.replace(/\/$/, '');

      // Get test endpoint based on engine type
      const testPath = this.getTestPath(config.engineType);
      const testUrl = `${baseUrl}${testPath}`;

      // Build headers
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      // Make test request
      const result = await this.http.requestSafe<unknown>({
        url: testUrl,
        method: 'GET',
        headers,
        timeout,
      });

      if (result.success) {
        return {
          success: true,
          workflowId: config.id,
          statusCode: 200,
        };
      }

      // Network errors (statusCode = 0) are always failures
      // Server errors (5xx) are failures
      // Client errors (4xx) might just mean auth needed (still consider reachable)
      const statusCode = result.error.statusCode;
      const isNetworkError = statusCode === 0;
      const isServerError = statusCode >= 500;

      if (isNetworkError) {
        return {
          success: false,
          error: result.error.message || 'Connection failed',
          workflowId: config.id,
          statusCode: 0,
        };
      }

      return {
        success: !isServerError,
        error: isServerError
          ? `Server returned status ${statusCode}`
          : undefined,
        workflowId: config.id,
        statusCode,
      };
    } catch (error) {
      return {
        success: false,
        error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        workflowId: config.id,
      };
    }
  }

  /**
   * Test multiple workflow engines
   */
  async testAll(configs: WorkflowTestConfig[]): Promise<WorkflowTestResult[]> {
    return Promise.all(configs.map((config) => this.test(config)));
  }

  /**
   * Get test endpoint path for engine type
   */
  private getTestPath(engineType: string): string {
    const normalizedType = engineType.toLowerCase();
    return ENGINE_TEST_ENDPOINTS[normalizedType] || '/';
  }
}

/**
 * Singleton instance
 */
let workflowTestServiceInstance: WorkflowTestService | null = null;

/**
 * Get shared workflow test service instance
 */
export function getWorkflowTestService(): WorkflowTestService {
  if (!workflowTestServiceInstance) {
    workflowTestServiceInstance = new WorkflowTestService();
  }
  return workflowTestServiceInstance;
}
