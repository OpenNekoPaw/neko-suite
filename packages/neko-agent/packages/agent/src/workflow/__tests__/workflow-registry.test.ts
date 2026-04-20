import { describe, it, expect } from 'vitest';
import { WorkflowRegistry } from '../workflow-registry';
import type { IWorkflowStage, WorkflowContext } from '../types';

function mockStage(name: string): IWorkflowStage {
  return {
    name,
    type: 'linear',
    gate: 'auto',
    execute: async (ctx: WorkflowContext) => ctx,
  };
}

describe('WorkflowRegistry', () => {
  it('should register and retrieve stages', () => {
    const registry = new WorkflowRegistry();
    const stage = mockStage('readDocument');
    registry.registerStage(stage);

    expect(registry.getStage('readDocument')).toBe(stage);
    expect(registry.listStages()).toContain('readDocument');
  });

  it('should return undefined for unregistered stage', () => {
    const registry = new WorkflowRegistry();
    expect(registry.getStage('nonexistent')).toBeUndefined();
  });

  it('should list all available flows', () => {
    const registry = new WorkflowRegistry();
    const flows = registry.listFlows();

    expect(flows.length).toBe(6);
    expect(flows.map((f) => f.id)).toContain('flowA');
    expect(flows.map((f) => f.id)).toContain('flowF');
  });

  it('should return stages for a flow', () => {
    const registry = new WorkflowRegistry();

    // Register all stages needed by flowD (simplest)
    registry.registerStage(mockStage('parseStoryboard'));
    registry.registerStage(mockStage('arrangeOnTimeline'));

    const stages = registry.getFlow('flowD');
    expect(stages).toHaveLength(2);
    expect(stages[0]?.name).toBe('parseStoryboard');
    expect(stages[1]?.name).toBe('arrangeOnTimeline');
  });

  it('should throw for unknown flow', () => {
    const registry = new WorkflowRegistry();
    expect(() => registry.getFlow('flowZ' as never)).toThrow('Unknown flow');
  });

  it('should throw when flow references unregistered stage', () => {
    const registry = new WorkflowRegistry();
    // flowD needs parseStoryboard + arrangeOnTimeline but neither registered
    expect(() => registry.getFlow('flowD')).toThrow('not registered');
  });

  it('should correctly define flowF stages', () => {
    const registry = new WorkflowRegistry();
    const flows = registry.listFlows();
    const flowF = flows.find((f) => f.id === 'flowF');

    expect(flowF?.stages).toEqual([
      'parseStoryboard',
      'importStoryboardToCanvas',
      'generatePrompts',
      'generatePilot',
      'batchGenerate',
      'qualityGate',
      'arrangeOnTimeline',
    ]);
  });

  it('should correctly define flowA stages (full pipeline)', () => {
    const registry = new WorkflowRegistry();
    const flows = registry.listFlows();
    const flowA = flows.find((f) => f.id === 'flowA');

    expect(flowA?.stages).toEqual([
      'readDocument',
      'parseStoryboard',
      'importStoryboardToCanvas',
      'generatePrompts',
      'generatePilot',
      'batchGenerate',
      'qualityGate',
      'arrangeOnTimeline',
    ]);
  });
});
