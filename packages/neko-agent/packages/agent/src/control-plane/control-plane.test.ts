import { describe, expect, it } from 'vitest';
import { FeedbackStageController, createControlPlane, createStageRegistry } from './index';

describe('StageRegistry', () => {
  it('registers read-only stage descriptors in insertion order', () => {
    const registry = createStageRegistry([
      { id: 'specify', label: 'Specify', enabled: true },
      { id: 'apply', label: 'Apply', enabled: true, riskLevel: 'medium' },
    ]);

    expect(registry.has('specify')).toBe(true);
    expect(registry.get('apply')).toEqual({
      id: 'apply',
      label: 'Apply',
      enabled: true,
      riskLevel: 'medium',
    });
    expect(registry.list().map((stage) => stage.id)).toEqual(['specify', 'apply']);
  });

  it('rejects empty stage ids', () => {
    const registry = createStageRegistry();
    expect(() => registry.register({ id: ' ', label: 'Invalid', enabled: true })).toThrow(
      'StageRegistry: descriptor id must not be empty',
    );
  });
});

describe('ControlPlane', () => {
  it('turns repair feedback decisions into non-executing stage guidance', () => {
    const registry = createStageRegistry([{ id: 'apply', label: 'Apply', enabled: true }]);
    const controlPlane = createControlPlane({
      stageRegistry: registry,
      stageController: new FeedbackStageController(),
      now: () => 1_771_718_420_000,
    });

    const decision = controlPlane.advise({
      currentStageId: 'apply',
      decision: {
        action: 'repair',
        signalKind: 'tool-failure',
        toolCallId: 'tool-1',
        toolName: 'QualityCheck',
        error: 'failed',
      },
    });

    expect(decision).toEqual({
      input: expect.objectContaining({ currentStageId: 'apply' }),
      guidance: {
        decisionAction: 'repair',
        fromStageId: 'apply',
        toStageId: 'apply',
        reason: 'Repair recommended for tool-failure.',
        requiresUserApproval: false,
      },
      createdAt: 1_771_718_420_000,
    });
    expect(controlPlane.getDecisionHistory()).toHaveLength(1);
  });

  it('accumulates every advise call in decision history', () => {
    const controlPlane = createControlPlane({
      stageRegistry: createStageRegistry([{ id: 'apply', label: 'Apply', enabled: true }]),
      stageController: new FeedbackStageController(),
      now: (() => {
        let tick = 10;
        return () => tick++;
      })(),
    });

    controlPlane.advise({
      currentStageId: 'apply',
      decision: {
        action: 'repair',
        signalKind: 'tool-failure',
        toolCallId: 'tool-1',
        toolName: 'QualityCheck',
        error: 'failed',
      },
    });
    controlPlane.advise({
      decision: { action: 'continue', reason: 'no-actionable-signal' },
    });
    controlPlane.advise({
      currentStageId: 'apply',
      decision: {
        action: 'self-evaluate',
        signalKind: 'artifact-invalid',
        stage: 'apply',
        reason: 'review before apply',
      },
    });

    expect(controlPlane.getDecisionHistory()).toEqual([
      expect.objectContaining({
        createdAt: 10,
        guidance: expect.objectContaining({ decisionAction: 'repair' }),
      }),
      expect.objectContaining({ createdAt: 11, guidance: null }),
      expect.objectContaining({
        createdAt: 12,
        guidance: expect.objectContaining({ decisionAction: 'self-evaluate' }),
      }),
    ]);
  });

  it('does not produce guidance for continue decisions', () => {
    const controlPlane = createControlPlane({
      stageRegistry: createStageRegistry(),
      stageController: new FeedbackStageController(),
      now: () => 1,
    });

    expect(
      controlPlane.advise({
        decision: { action: 'continue', reason: 'no-actionable-signal' },
      }).guidance,
    ).toBeNull();
  });
});
