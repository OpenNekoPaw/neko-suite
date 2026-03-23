/**
 * Pipeline Resolver — Bridges Skill metadata to Pipeline execution
 *
 * Reads pipeline-* fields from Skill and constructs PipelineConfig + stages.
 */

import type { Skill } from '@neko/shared';
import type {
  PipelineConfig,
  PipelineContext,
  PipelineHandle,
  FlowId,
  IPipelineExecutor,
  IPipelineRegistry,
} from './types';
import { getLogger } from '../utils/logger';

const logger = getLogger('PipelineResolver');

const VALID_FLOW_IDS = new Set(['flowA', 'flowB', 'flowC', 'flowD', 'flowE', 'flowF']);

export class PipelineResolver {
  constructor(
    private readonly registry: IPipelineRegistry,
    private readonly executor: IPipelineExecutor,
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
  resolve(skill: Skill): PipelineConfig | null {
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
    initialCtx: PipelineContext,
    overrides?: Partial<PipelineConfig>,
  ): PipelineHandle {
    const config = this.resolve(skill);
    if (!config) {
      throw new Error(`Skill '${skill.name}' has no pipeline configuration`);
    }

    // Apply overrides
    const finalConfig: PipelineConfig = {
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
    initialCtx: PipelineContext,
    config?: Partial<PipelineConfig>,
  ): PipelineHandle {
    const stages = this.registry.getFlow(flowId);
    const finalConfig: PipelineConfig = {
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

export function createPipelineResolver(
  registry: IPipelineRegistry,
  executor: IPipelineExecutor,
): PipelineResolver {
  return new PipelineResolver(registry, executor);
}
