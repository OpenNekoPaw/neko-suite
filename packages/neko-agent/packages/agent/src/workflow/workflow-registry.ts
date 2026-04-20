/**
 * Pipeline Registry — Manages stage pool and flow definitions
 *
 * Flows are predefined combinations of stages:
 *   flowA: readDocument → parseStoryboard → importStoryboardToCanvas → generatePrompts → batchGenerate → arrange
 *   flowB: generatePrompts → batchGenerate → arrange
 *   flowC: readDocument → generatePrompts → batchGenerate → arrange
 *   flowD: parseStoryboard → arrange
 *   flowE: parseStoryboard → importStoryboardToCanvas → generatePrompts → batchGenerate → arrange
 *   flowF: parseStoryboard → importStoryboardToCanvas → generatePrompts → batchGenerate → arrange
 */

import type { IWorkflowStage, IWorkflowRegistry, FlowId } from './types';

/** Flow definitions — stage name arrays for each flow */
const FLOW_DEFINITIONS: Record<FlowId, string[]> = {
  flowA: [
    'readDocument',
    'parseStoryboard',
    'importStoryboardToCanvas',
    'generatePrompts',
    'generatePilot',
    'batchGenerate',
    'qualityGate',
    'arrangeOnTimeline',
  ],
  flowB: ['generatePrompts', 'generatePilot', 'batchGenerate', 'qualityGate', 'arrangeOnTimeline'],
  flowC: [
    'readDocument',
    'generatePrompts',
    'generatePilot',
    'batchGenerate',
    'qualityGate',
    'arrangeOnTimeline',
  ],
  flowD: ['parseStoryboard', 'arrangeOnTimeline'],
  flowE: [
    'parseStoryboard',
    'importStoryboardToCanvas',
    'generatePrompts',
    'generatePilot',
    'batchGenerate',
    'qualityGate',
    'arrangeOnTimeline',
  ],
  flowF: [
    'parseStoryboard',
    'importStoryboardToCanvas',
    'generatePrompts',
    'generatePilot',
    'batchGenerate',
    'qualityGate',
    'arrangeOnTimeline',
  ],
};

export class WorkflowRegistry implements IWorkflowRegistry {
  private readonly stages = new Map<string, IWorkflowStage>();

  registerStage(stage: IWorkflowStage): void {
    this.stages.set(stage.name, stage);
  }

  getStage(name: string): IWorkflowStage | undefined {
    return this.stages.get(name);
  }

  listStages(): string[] {
    return [...this.stages.keys()];
  }

  getFlow(flowId: FlowId): IWorkflowStage[] {
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

export function createWorkflowRegistry(): IWorkflowRegistry {
  return new WorkflowRegistry();
}
