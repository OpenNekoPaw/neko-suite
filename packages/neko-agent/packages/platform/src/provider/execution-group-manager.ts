/**
 * Execution Group Manager - AI generation task routing
 *
 * Routes AI generation tasks to appropriate execution targets based on
 * configured strategies. Supports API, Workflow, and Local execution types.
 *
 * Uses shared selection strategies from core/selection-strategy.ts
 */

import type {
  ExecutionGroup,
  ExecutionTarget,
  ExecutionRoutingResult,
  ExecutionRoutingOptions,
  ExecutionTargetSpec,
  ExecutionTaskType,
  ExecutionFallbackTrigger,
  ExecutionStrategy,
  ValidationResult,
  ValidationFailure,
  ExecutionRoutingError,
  ExecutionErrorCode,
} from '../types/execution-group';
import type { ConfigManager } from '../config/config-manager';
import type { ProviderRegistry } from './provider-registry';
import type { WorkflowManager } from '../workflow/workflow-manager';
import {
  type ISelectionStrategy,
  type SelectionContext,
  PrioritySelectionStrategy,
  RoundRobinSelectionStrategy,
  WeightedSelectionStrategy,
  CostOptimalSelectionStrategy,
  QualityOptimalSelectionStrategy,
  LatencyOptimalSelectionStrategy,
  CapabilityMatchSelectionStrategy,
} from '../core/selection-strategy';

/**
 * Execution group manager for AI generation task routing
 */
export class ExecutionGroupManager {
  private configManager: ConfigManager;
  private providerRegistry: ProviderRegistry;
  private workflowManager?: WorkflowManager;
  private roundRobinState: Map<string, number> = new Map();
  private strategies: Map<string, ISelectionStrategy<ExecutionTarget>> = new Map();

  constructor(
    configManager: ConfigManager,
    providerRegistry: ProviderRegistry,
    workflowManager?: WorkflowManager
  ) {
    this.configManager = configManager;
    this.providerRegistry = providerRegistry;
    this.workflowManager = workflowManager;
    this.initializeStrategies();
  }

  /**
   * Initialize selection strategies
   */
  private initializeStrategies(): void {
    this.strategies.set('priority', new PrioritySelectionStrategy());
    this.strategies.set('round-robin', new RoundRobinSelectionStrategy());
    this.strategies.set(
      'weighted',
      new WeightedSelectionStrategy((t: ExecutionTarget) => t.id)
    );
    this.strategies.set('cost-optimal', new CostOptimalSelectionStrategy());
    this.strategies.set('quality-optimal', new QualityOptimalSelectionStrategy());
    this.strategies.set('latency-optimal', new LatencyOptimalSelectionStrategy());
    this.strategies.set('capability-match', new CapabilityMatchSelectionStrategy());
  }

  /**
   * Get execution group by ID
   */
  getGroup(id: string): ExecutionGroup | undefined {
    return this.configManager.getExecutionGroup(id);
  }

  /**
   * Get execution group by task type
   */
  getGroupByTaskType(taskType: ExecutionTaskType): ExecutionGroup | undefined {
    const groups = this.configManager.getExecutionGroups();
    return groups.find((g) => g.taskType === taskType && g.enabled);
  }

  /**
   * Get all execution groups
   */
  getGroups(): ExecutionGroup[] {
    return this.configManager.getExecutionGroups();
  }

  /**
   * Get enabled execution groups
   */
  getEnabledGroups(): ExecutionGroup[] {
    return this.configManager.getExecutionGroups().filter((g) => g.enabled);
  }

  /**
   * Route to an execution target based on group strategy
   */
  route(
    groupId: string,
    options: ExecutionRoutingOptions = {}
  ): ExecutionRoutingResult | ExecutionRoutingError {
    // Try to get group by ID or task type
    let group = this.getGroup(groupId);
    if (!group) {
      group = this.getGroupByTaskType(groupId as ExecutionTaskType);
    }

    if (!group) {
      return {
        code: 'GROUP_NOT_FOUND',
        message: `Execution group '${groupId}' not found`,
      };
    }

    if (!group.enabled) {
      return {
        code: 'GROUP_DISABLED',
        message: `Execution group '${groupId}' is disabled`,
      };
    }

    const excludeTargets = options.excludeTargets || [];
    const failures: ValidationFailure[] = [];

    // Filter available targets
    const availableTargets = group.targets.filter((target) => {
      // Skip excluded targets
      if (excludeTargets.includes(target.id)) {
        return false;
      }

      // Validate target
      const validation = this.validateTarget(target);
      if (!validation.valid && validation.failure) {
        failures.push(validation.failure);
        return false;
      }

      // Filter by required capabilities
      if (options.requiredCapabilities && options.requiredCapabilities.length > 0) {
        const hasAll = options.requiredCapabilities.every(
          (cap) => target.capabilities?.includes(cap)
        );
        if (!hasAll) {
          failures.push({
            targetId: target.id,
            code: 'CAPABILITY_NOT_SATISFIED',
            message: `Target '${target.id}' does not support required capabilities: ${options.requiredCapabilities.join(', ')}`,
          });
          return false;
        }
      }

      // Filter by preferred type
      if (options.preferredType && target.type !== options.preferredType) {
        return false;
      }

      return true;
    });

    // If preferred type filtering resulted in no targets, try without preference
    let finalTargets = availableTargets;
    if (availableTargets.length === 0 && options.preferredType) {
      finalTargets = group.targets.filter((target) => {
        if (excludeTargets.includes(target.id)) return false;
        const validation = this.validateTarget(target);
        if (!validation.valid) return false;
        if (options.requiredCapabilities && options.requiredCapabilities.length > 0) {
          return options.requiredCapabilities.every(
            (cap) => target.capabilities?.includes(cap)
          );
        }
        return true;
      });
    }

    if (finalTargets.length === 0) {
      return {
        code: 'NO_AVAILABLE_TARGET',
        message: `No execution target available for '${groupId}'`,
        failures,
      };
    }

    // Select target based on strategy
    const selectedTarget = this.selectTarget(group, finalTargets);
    if (!selectedTarget) {
      return {
        code: 'NO_AVAILABLE_TARGET',
        message: `Failed to select target for '${groupId}'`,
        failures,
      };
    }

    return {
      target: selectedTarget,
      attempt: excludeTargets.length + 1,
      reason: `Selected by ${group.strategy.type} strategy`,
    };
  }

  /**
   * Route directly to a specified target
   */
  routeToTarget(
    targetSpec: ExecutionTargetSpec
  ): ExecutionRoutingResult | ExecutionRoutingError {
    // Find target by workflow
    if (targetSpec.workflow) {
      const target = this.findWorkflowTarget(targetSpec.workflow);
      if (!target) {
        return {
          code: 'WORKFLOW_NOT_AVAILABLE',
          message: `Workflow '${targetSpec.workflow}' is not available`,
        };
      }

      const validation = this.validateTarget(target);
      if (!validation.valid && validation.failure) {
        return {
          code: validation.failure.code,
          message: validation.failure.message,
        };
      }

      return {
        target,
        attempt: 1,
        reason: 'Direct workflow specification',
      };
    }

    // Find target by provider/model
    if (targetSpec.provider) {
      const target = this.findApiTarget(targetSpec.provider, targetSpec.model);
      if (!target) {
        return {
          code: 'PROVIDER_NOT_ENABLED',
          message: `Provider '${targetSpec.provider}' is not available`,
        };
      }

      const validation = this.validateTarget(target);
      if (!validation.valid && validation.failure) {
        return {
          code: validation.failure.code,
          message: validation.failure.message,
        };
      }

      return {
        target,
        attempt: 1,
        reason: 'Direct provider/model specification',
      };
    }

    return {
      code: 'NO_AVAILABLE_TARGET',
      message: 'No target specification provided',
    };
  }

  /**
   * Route to next target for fallback
   */
  routeFallback(
    groupId: string,
    errorCategory: ExecutionFallbackTrigger,
    excludeTargets: string[]
  ): ExecutionRoutingResult | ExecutionRoutingError | null {
    const group = this.getGroup(groupId) ||
      this.getGroupByTaskType(groupId as ExecutionTaskType);

    if (!group || !group.enabled) {
      return null;
    }

    // Check if fallback is enabled
    if (!group.fallback.enabled) {
      return null;
    }

    // Check if error triggers fallback
    if (!this.shouldTriggerFallback(errorCategory, group.fallback.triggerOn)) {
      return null;
    }

    // Check max attempts
    if (excludeTargets.length >= group.fallback.maxAttempts) {
      return null;
    }

    return this.route(groupId, { excludeTargets });
  }

  /**
   * Validate a target for availability
   */
  validateTarget(target: ExecutionTarget): ValidationResult {
    // Check if target is explicitly disabled
    if (target.enabled === false) {
      return {
        valid: false,
        failure: {
          targetId: target.id,
          code: 'NO_AVAILABLE_TARGET',
          message: `Target '${target.id}' is disabled`,
        },
      };
    }

    switch (target.type) {
      case 'api':
        return this.validateApiTarget(target);
      case 'workflow':
        return this.validateWorkflowTarget(target);
      case 'local':
        return this.validateLocalTarget(target);
      default:
        return { valid: true };
    }
  }

  /**
   * Reset round-robin index for a group
   */
  resetRoundRobin(groupId: string): void {
    this.roundRobinState.delete(groupId);
  }

  /**
   * Reset all round-robin indices
   */
  resetAllRoundRobin(): void {
    this.roundRobinState.clear();
  }

  private validateApiTarget(target: ExecutionTarget): ValidationResult {
    if (!target.providerId) {
      return { valid: true }; // No provider to validate
    }

    // Check provider enabled (uses configManager for config data)
    const provider = this.configManager.getProvider(target.providerId);
    if (!provider) {
      return {
        valid: false,
        failure: {
          targetId: target.id,
          code: 'PROVIDER_NOT_ENABLED',
          message: `Provider '${target.providerId}' not found`,
        },
      };
    }

    if (!provider.enabled) {
      return {
        valid: false,
        failure: {
          targetId: target.id,
          code: 'PROVIDER_NOT_ENABLED',
          message: `Provider '${target.providerId}' is not enabled`,
        },
      };
    }

    // Check provider availability
    if (!this.providerRegistry.isProviderAvailable(target.providerId)) {
      return {
        valid: false,
        failure: {
          targetId: target.id,
          code: 'PROVIDER_NOT_ENABLED',
          message: `Provider '${target.providerId}' is not available`,
        },
      };
    }

    // Check model enabled if specified (uses configManager for config data)
    if (target.modelId) {
      const model = this.configManager.getModel(target.modelId);
      if (!model) {
        return {
          valid: false,
          failure: {
            targetId: target.id,
            code: 'MODEL_NOT_ENABLED',
            message: `Model '${target.modelId}' not found`,
          },
        };
      }

      if (!model.enabled) {
        return {
          valid: false,
          failure: {
            targetId: target.id,
            code: 'MODEL_NOT_ENABLED',
            message: `Model '${target.modelId}' is not enabled for provider '${target.providerId}'`,
          },
        };
      }
    }

    return { valid: true };
  }

  private validateWorkflowTarget(target: ExecutionTarget): ValidationResult {
    if (!target.workflowId) {
      return { valid: true }; // No workflow to validate
    }

    // Check workflow exists
    if (this.workflowManager) {
      // WorkflowManager.get is async, so we assume it's registered
      // The actual check will happen at execution time
      // For now, we just check if workflowManager is available
    }

    // TODO(P2): Check workflow engine health via ConnectionStateManager
    // This would require injecting ConnectionStateManager

    return { valid: true };
  }

  private validateLocalTarget(target: ExecutionTarget): ValidationResult {
    // For local targets, we assume they're available
    // Actual availability check happens at execution time
    return { valid: true };
  }

  private selectTarget(
    group: ExecutionGroup,
    targets: ExecutionTarget[]
  ): ExecutionTarget | null {
    if (targets.length === 0) {
      return null;
    }

    const strategy = this.strategies.get(group.strategy.type);
    if (!strategy) {
      // Fallback to priority if unknown strategy
      return targets[0];
    }

    // Build selection context from group strategy
    const context: SelectionContext = {
      groupId: group.id,
      roundRobinState: this.roundRobinState,
      weights: 'weights' in group.strategy ? group.strategy.weights : undefined,
      maxCost: 'maxCost' in group.strategy ? group.strategy.maxCost : undefined,
      maxLatency: 'maxLatency' in group.strategy ? group.strategy.maxLatency : undefined,
      requiredCapabilities:
        'requiredCapabilities' in group.strategy
          ? group.strategy.requiredCapabilities
          : undefined,
    };

    return strategy.select(targets, context);
  }

  private findWorkflowTarget(workflowId: string): ExecutionTarget | null {
    const groups = this.configManager.getExecutionGroups();
    for (const group of groups) {
      const target = group.targets.find(
        (t) => t.type === 'workflow' && t.workflowId === workflowId
      );
      if (target) return target;
    }

    // Create dynamic target if not found in groups
    return {
      id: `workflow-${workflowId}`,
      type: 'workflow',
      workflowId,
      displayName: workflowId,
    };
  }

  private findApiTarget(
    providerId: string,
    modelId?: string
  ): ExecutionTarget | null {
    const groups = this.configManager.getExecutionGroups();
    for (const group of groups) {
      const target = group.targets.find((t) => {
        if (t.type !== 'api') return false;
        if (t.providerId !== providerId) return false;
        if (modelId && t.modelId !== modelId) return false;
        return true;
      });
      if (target) return target;
    }

    // Create dynamic target if not found in groups (uses configManager for config data)
    const provider = this.configManager.getProvider(providerId);
    if (provider) {
      return {
        id: modelId ? `${providerId}-${modelId}` : providerId,
        type: 'api',
        providerId,
        modelId,
        displayName: provider.displayName,
      };
    }

    return null;
  }

  private shouldTriggerFallback(
    errorCategory: ExecutionFallbackTrigger,
    triggerOn: ExecutionFallbackTrigger[]
  ): boolean {
    return triggerOn.includes(errorCategory);
  }
}

/**
 * Check if result is an error
 */
export function isRoutingError(
  result: ExecutionRoutingResult | ExecutionRoutingError
): result is ExecutionRoutingError {
  return 'code' in result && !('target' in result);
}
