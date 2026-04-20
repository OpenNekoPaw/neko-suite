/**
 * Pipeline Resolver — Bridges Skill metadata to Pipeline execution
 *
 * Reads pipeline-* fields from Skill and constructs WorkflowConfig + stages.
 */

import type { Skill } from '@neko/shared';
import type {
  WorkflowConfig,
  WorkflowContext,
  WorkflowHandle,
  FlowId,
  IWorkflowExecutor,
  IWorkflowRegistry,
} from './types';
import { getLogger } from '../utils/logger';

const logger = getLogger('WorkflowResolver');

const VALID_FLOW_IDS = new Set(['flowA', 'flowB', 'flowC', 'flowD', 'flowE', 'flowF']);

export class WorkflowResolver {
  constructor(
    private readonly registry: IWorkflowRegistry,
    private readonly executor: IWorkflowExecutor,
  ) {}

  /**
   * Check if a skill has pipeline configuration
   */
  hasPipeline(skill: Skill): boolean {
    return !!skill.pipelineFlowId;
  }

  /**
   * Resolve pipeline configuration from skill metadata
   */
  resolve(skill: Skill): WorkflowConfig | null {
    if (!skill.pipelineFlowId) {
      return null;
    }

    const flowId = skill.pipelineFlowId;
    if (!VALID_FLOW_IDS.has(flowId)) {
      logger.warn('Invalid pipeline flow ID in skill', { skill: skill.name, flowId });
      return null;
    }

    return {
      flowId: flowId as FlowId,
      skipStages: skill.pipelineSkipStages,
      stageParams: skill.pipelineParams,
      hooks: skill.pipelineHooks,
    };
  }

  /**
   * Create and start a pipeline from skill configuration
   */
  startPipeline(
    skill: Skill,
    initialCtx: WorkflowContext,
    overrides?: Partial<WorkflowConfig>,
  ): WorkflowHandle {
    const config = this.resolve(skill);
    if (!config) {
      throw new Error(`Skill '${skill.name}' has no pipeline configuration`);
    }

    // Apply overrides
    const finalConfig: WorkflowConfig = {
      ...config,
      ...overrides,
      skipStages: [...(config.skipStages ?? []), ...(overrides?.skipStages ?? [])],
      stageParams: {
        ...config.stageParams,
        ...overrides?.stageParams,
      },
    };

    const stages = this.registry.getFlow(finalConfig.flowId);

    logger.info('Starting pipeline', {
      skill: skill.name,
      flow: finalConfig.flowId,
      stages: stages.map((s) => s.name),
      skipStages: finalConfig.skipStages,
    });

    return this.executor.execute(stages, finalConfig, initialCtx);
  }

  /**
   * Start a pipeline by flow ID directly (without Skill)
   */
  startFlow(
    flowId: FlowId,
    initialCtx: WorkflowContext,
    config?: Partial<WorkflowConfig>,
  ): WorkflowHandle {
    const stages = this.registry.getFlow(flowId);
    const finalConfig: WorkflowConfig = {
      flowId,
      ...config,
    };

    logger.info('Starting flow', {
      flow: flowId,
      stages: stages.map((s) => s.name),
    });

    return this.executor.execute(stages, finalConfig, initialCtx);
  }
}

export function createWorkflowResolver(
  registry: IWorkflowRegistry,
  executor: IWorkflowExecutor,
): WorkflowResolver {
  return new WorkflowResolver(registry, executor);
}
