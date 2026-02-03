/**
 * Workflow Bootstrap
 * Workflow 引擎健康检查
 *
 * 在插件启动时检查已启用的 Workflow 引擎连接状态
 * 记录状态到 ConnectionStateManager
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import type { Platform } from '@neko/platform';
import type { ConnectionStateManager } from '../services/connectionStateManager';

/**
 * Workflow 检查结果
 */
export interface WorkflowCheckResult {
  workflowId: string;
  workflowName: string;
  success: boolean;
  error?: string;
}

/**
 * HTTP 健康检查配置
 */
interface HealthCheckOptions {
  url: string;
  timeout?: number;
  apiKey?: string;
}

/**
 * 执行 HTTP 健康检查
 */
async function performHealthCheck(options: HealthCheckOptions): Promise<{ success: boolean; error?: string }> {
  const { url: urlString, timeout = 5000, apiKey } = options;

  return new Promise((resolve) => {
    try {
      const url = new URL(urlString);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const req = client.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: 'GET',
          headers,
          timeout,
        },
        (res) => {
          // Any response (even 4xx/5xx) means the server is reachable
          if (res.statusCode && res.statusCode < 500) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: `Server error: ${res.statusCode}` });
          }
        }
      );

      req.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Connection timeout' });
      });

      req.end();
    } catch (error) {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid URL',
      });
    }
  });
}

/**
 * 获取 Workflow 引擎的健康检查 URL
 */
function getHealthCheckUrl(engineType: string, baseUrl: string): string {
  // Normalize base URL
  const normalizedUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  // Different engines have different health check endpoints
  switch (engineType) {
    case 'comfyui':
      return `${normalizedUrl}/system_stats`;
    case 'n8n':
      return `${normalizedUrl}/healthz`;
    case 'dify':
      return `${normalizedUrl}/v1/parameters`;
    case 'langflow':
      return `${normalizedUrl}/health`;
    case 'flowise':
      return `${normalizedUrl}/api/v1/ping`;
    default:
      // For custom engines, try the base URL
      return normalizedUrl;
  }
}

/**
 * 检查所有启用的 Workflow 引擎
 * @returns 检查结果数组
 */
export async function checkWorkflowEngines(
  platform: Platform,
  stateManager?: ConnectionStateManager
): Promise<WorkflowCheckResult[]> {
  const results: WorkflowCheckResult[] = [];

  // 从 ConfigManager 获取 Workflow 配置
  const workflows = platform.config.getWorkflows();

  // 并行检查所有启用的 Workflow
  const checkPromises = workflows.map(async (workflowConfig) => {
    // 跳过禁用的 Workflow
    if (!workflowConfig.enabled) {
      stateManager?.updateState(workflowConfig.id, workflowConfig.name, 'workflow', 'disconnected');
      return {
        workflowId: workflowConfig.id,
        workflowName: workflowConfig.name,
        success: false,
        error: 'Disabled',
      };
    }

    // 检查 URL 配置
    if (!workflowConfig.url) {
      const error = 'Missing URL';
      console.warn(`[Neko Suite] Workflow ${workflowConfig.name} missing URL, skipping`);
      stateManager?.updateState(workflowConfig.id, workflowConfig.name, 'workflow', 'error', error);
      return {
        workflowId: workflowConfig.id,
        workflowName: workflowConfig.name,
        success: false,
        error,
      };
    }

    // Update state to connecting
    stateManager?.updateState(workflowConfig.id, workflowConfig.name, 'workflow', 'connecting');

    // 执行健康检查
    const healthCheckUrl = getHealthCheckUrl(workflowConfig.engineType, workflowConfig.url);
    const checkResult = await performHealthCheck({
      url: healthCheckUrl,
      timeout: 5000,
      apiKey: workflowConfig.apiKey,
    });

    if (checkResult.success) {
      stateManager?.updateState(workflowConfig.id, workflowConfig.name, 'workflow', 'connected');
      return {
        workflowId: workflowConfig.id,
        workflowName: workflowConfig.name,
        success: true,
      };
    } else {
      console.warn(`[Neko Suite] Workflow ${workflowConfig.name} health check failed:`, checkResult.error);
      stateManager?.updateState(workflowConfig.id, workflowConfig.name, 'workflow', 'error', checkResult.error);
      return {
        workflowId: workflowConfig.id,
        workflowName: workflowConfig.name,
        success: false,
        error: checkResult.error,
      };
    }
  });

  const checkResults = await Promise.all(checkPromises);
  results.push(...checkResults);

  return results;
}
