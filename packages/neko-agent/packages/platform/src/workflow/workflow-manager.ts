/**
 * Workflow Manager - Manages workflow executions
 */

import type {
  WorkflowManager as IWorkflowManager,
  Workflow,
  WorkflowInput,
  WorkflowResult,
  WorkflowStatus,
  WorkflowType,
} from '../types/workflow';
import type { Provider } from '../types/provider';
import type { ProviderRegistry } from '../provider/provider-registry';
import type { ConfigManager } from '../config/config-manager';
import { PlatformError } from '../provider/platform-error';

/**
 * Workflow execution context with optional provider credentials
 */
export interface WorkflowExecutionContext {
  /** Provider credentials resolved from providerId */
  provider?: Provider;
}

/**
 * Workflow executor interface
 */
export interface WorkflowExecutor {
  /** Execute a workflow */
  execute(
    workflow: Workflow,
    input: WorkflowInput,
    context?: WorkflowExecutionContext
  ): Promise<WorkflowResult>;

  /** Get execution status */
  getExecution?(executionId: string): Promise<WorkflowResult | undefined>;

  /** Cancel execution */
  cancelExecution?(executionId: string): Promise<boolean>;
}

/**
 * Internal execution state
 */
interface ExecutionState {
  result: WorkflowResult;
  workflow: Workflow;
  cancelRequested: boolean;
}

/**
 * Workflow manager implementation
 */
export class WorkflowManager implements IWorkflowManager {
  private workflows: Map<string, Workflow> = new Map();
  private executors: Map<WorkflowType, WorkflowExecutor> = new Map();
  private executions: Map<string, ExecutionState> = new Map();
  private executionCounter = 0;
  private providerRegistry?: ProviderRegistry;
  private configManager?: ConfigManager;

  /**
   * Set provider registry for credential resolution
   */
  setProviderRegistry(registry: ProviderRegistry): void {
    this.providerRegistry = registry;
  }

  /**
   * Set config manager for provider/model data access
   */
  setConfigManager(manager: ConfigManager): void {
    this.configManager = manager;
  }

  /**
   * Register a workflow executor
   */
  registerExecutor(type: WorkflowType, executor: WorkflowExecutor): void {
    this.executors.set(type, executor);
  }

  /**
   * List available workflows
   */
  async list(): Promise<Workflow[]> {
    return Array.from(this.workflows.values());
  }

  /**
   * Get workflow by ID
   */
  async get(id: string): Promise<Workflow | undefined> {
    return this.workflows.get(id);
  }

  /**
   * Execute a workflow
   */
  async execute(input: WorkflowInput): Promise<WorkflowResult> {
    const workflow = this.workflows.get(input.workflowId);
    if (!workflow) {
      throw new PlatformError({
        category: 'not_found',
        code: 'WORKFLOW_NOT_FOUND',
        message: `Workflow ${input.workflowId} not found`,
        retryable: false,
      });
    }

    const executor = this.executors.get(workflow.type);
    if (!executor) {
      throw new PlatformError({
        category: 'validation',
        code: 'NO_EXECUTOR',
        message: `No executor registered for workflow type: ${workflow.type}`,
        retryable: false,
      });
    }

    const executionId = this.generateExecutionId();
    const startTime = Date.now();

    // Initialize execution state
    const state: ExecutionState = {
      result: {
        executionId,
        workflowId: input.workflowId,
        status: 'running',
      },
      workflow,
      cancelRequested: false,
    };
    this.executions.set(executionId, state);

    // Build execution context with provider credentials
    const context = this.buildExecutionContext(workflow);

    try {
      // Execute with optional timeout
      const timeoutMs = input.options?.timeout;
      let result: WorkflowResult;

      if (timeoutMs) {
        result = await this.executeWithTimeout(
          executor,
          workflow,
          input,
          executionId,
          timeoutMs,
          context
        );
      } else {
        result = await executor.execute(workflow, {
          ...input,
          workflowId: input.workflowId,
        }, context);
        result.executionId = executionId;
      }

      // Check if cancelled
      if (state.cancelRequested) {
        result.status = 'cancelled';
      }

      const endTime = Date.now();
      result.timing = {
        startTime,
        endTime,
        duration: endTime - startTime,
      };

      // Update execution state
      state.result = result;

      return result;
    } catch (error) {
      const endTime = Date.now();
      const failedResult: WorkflowResult = {
        executionId,
        workflowId: input.workflowId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        timing: {
          startTime,
          endTime,
          duration: endTime - startTime,
        },
      };

      state.result = failedResult;
      return failedResult;
    }
  }

  /**
   * Get execution status
   */
  async getExecution(executionId: string): Promise<WorkflowResult | undefined> {
    const state = this.executions.get(executionId);
    if (!state) return undefined;

    // Check if executor has its own status
    const executor = this.executors.get(state.workflow.type);
    if (executor?.getExecution) {
      const externalResult = await executor.getExecution(executionId);
      if (externalResult) {
        state.result = externalResult;
      }
    }

    return state.result;
  }

  /**
   * Cancel execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const state = this.executions.get(executionId);
    if (!state) return false;

    if (state.result.status !== 'running') {
      return false;
    }

    state.cancelRequested = true;

    // Try executor-level cancellation
    const executor = this.executors.get(state.workflow.type);
    if (executor?.cancelExecution) {
      return executor.cancelExecution(executionId);
    }

    state.result.status = 'cancelled';
    return true;
  }

  /**
   * Register a workflow
   */
  register(workflow: Workflow): void {
    this.workflows.set(workflow.id, workflow);
  }

  /**
   * Unregister a workflow
   */
  unregister(id: string): void {
    this.workflows.delete(id);
  }

  private async executeWithTimeout(
    executor: WorkflowExecutor,
    workflow: Workflow,
    input: WorkflowInput,
    executionId: string,
    timeoutMs: number,
    context?: WorkflowExecutionContext
  ): Promise<WorkflowResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new PlatformError({
            category: 'timeout',
            code: 'WORKFLOW_TIMEOUT',
            message: `Workflow execution timed out after ${timeoutMs}ms`,
            retryable: false,
          })
        );
      }, timeoutMs);

      executor
        .execute(workflow, input, context)
        .then((result) => {
          clearTimeout(timeoutId);
          result.executionId = executionId;
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Build execution context with provider credentials
   */
  private buildExecutionContext(workflow: Workflow): WorkflowExecutionContext {
    const context: WorkflowExecutionContext = {};

    // Check if workflow has providerId in config
    const config = workflow.config as Record<string, unknown>;
    const providerId = config?.providerId as string | undefined;

    if (providerId && this.configManager) {
      const provider = this.configManager.getProvider(providerId);
      if (provider) {
        context.provider = provider;
      }
    }

    return context;
  }

  private generateExecutionId(): string {
    this.executionCounter++;
    return `exec_${Date.now()}_${this.executionCounter}`;
  }
}
