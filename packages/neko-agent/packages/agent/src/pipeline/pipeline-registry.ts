/**
 * Pipeline Registry — Manages stage pool and flow definitions
 *
 * Flows are predefined combinations of stages:
 *   flowA: readDocument → parseStoryboard → generatePrompts → batchGenerate → arrange
 *   flowB: generatePrompts → batchGenerate → arrange
 *   flowC: readDocument → generatePrompts → batchGenerate → arrange
 *   flowD: parseStoryboard → arrange
 *   flowE: parseStoryboard → generatePrompts → batchGenerate → arrange
 *   flowF: parseStoryboard → generatePrompts → batchGenerate → arrange
 */

import type { IPipelineStage, IPipelineRegistry, FlowId } from './types';

/** Flow definitions — stage name arrays for each flow */
const FLOW_DEFINITIONS: Record<FlowId, string[]> = {
  flowA: [
    'readDocument',
    'parseStoryboard',
    'generatePrompts',
    'batchGenerate',
    'arrangeOnTimeline',
  ],
  flowB: ['generatePrompts', 'batchGenerate', 'arrangeOnTimeline'],
  flowC: ['readDocument', 'generatePrompts', 'batchGenerate', 'arrangeOnTimeline'],
  flowD: ['parseStoryboard', 'arrangeOnTimeline'],
  flowE: ['parseStoryboard', 'generatePrompts', 'batchGenerate', 'arrangeOnTimeline'],
  flowF: ['parseStoryboard', 'generatePrompts', 'batchGenerate', 'arrangeOnTimeline'],
};

export class PipelineRegistry implements IPipelineRegistry {
  private readonly stages = new Map<string, IPipelineStage>();

  registerStage(stage: IPipelineStage): void {
    this.stages.set(stage.name, stage);
  }

  getStage(name: string): IPipelineStage | undefined {
    return this.stages.get(name);
  }

  listStages(): string[] {
    return [...this.stages.keys()];
  }

  getFlow(flowId: FlowId): IPipelineStage[] {
    const stageNames = FLOW_DEFINITIONS[flowId];
    if (!stageNames) {
      throw new Error(`Unknown flow: ${flowId}`);
    }

    return stageNames.map((name) => {
      const stage = this.stages.get(name);
      if (!stage) {
        throw new Error(`Stage '${name}' not registered (required by ${flowId})`);
      }
      return stage;
    });
  }

  listFlows(): { id: FlowId; stages: string[] }[] {
    return (Object.entries(FLOW_DEFINITIONS) as [FlowId, string[]][]).map(([id, stages]) => ({
      id,
      stages,
    }));
  }
}

export function createPipelineRegistry(): IPipelineRegistry {
  return new PipelineRegistry();
}
