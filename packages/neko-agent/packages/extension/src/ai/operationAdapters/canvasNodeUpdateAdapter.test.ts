import { describe, expect, it } from 'vitest';
import { isOperationToolPlanTraceable } from '@neko/shared';
import { createCanvasNodeUpdateAdapter } from './canvasNodeUpdateAdapter';

const rationale = {
  id: 'rat-update-canvas-node',
  decision: 'update-selected-canvas-node',
  reason: 'Agent decided the selected canvas node should be adjusted.',
  confidence: 'high' as const,
  observationIds: ['obs-canvas-node'],
  evidenceIds: [],
  createdAt: 1,
};

function createCanvasData() {
  return {
    version: '1.0',
    name: 'Storyboard canvas',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [
      {
        id: 'node-1',
        type: 'shot',
        position: { x: 10, y: 20 },
        size: { width: 320, height: 180 },
        zIndex: 3,
        locked: false,
        data: {
          shotNumber: 3,
          duration: 2,
          visualDescription: 'Alice enters the room.',
          characters: [],
          shotScale: 'MS',
          characterAction: 'enters',
          emotion: [],
          sceneTags: [],
          generationStatus: 'idle',
          generationHistory: [],
        },
      },
    ],
    connections: [],
  };
}

describe('createCanvasNodeUpdateAdapter', () => {
  it('plans a traceable canvas.node.update EditOperation from an Agent intent', async () => {
    const adapter = createCanvasNodeUpdateAdapter({ now: () => 1_771_718_415_000 });
    const intent = {
      id: 'intent-move-canvas-node',
      domain: 'canvas' as const,
      summary: 'Move and resize selected shot node.',
      rationaleId: rationale.id,
      targetIds: ['node-1'],
      parameters: {
        updates: {
          position: { x: 40, y: 80 },
          size: { width: 400, height: 225 },
          locked: true,
        },
      },
      createdAt: 2,
    };
    const context = { rationale, metadata: { canvasData: createCanvasData() } };

    expect(adapter.canPlan(intent, context)).toBe(true);
    const plan = await adapter.plan(intent, context);
    expect(plan).toEqual({
      id: 'plan:intent-move-canvas-node',
      intentId: 'intent-move-canvas-node',
      rationaleId: 'rat-update-canvas-node',
      requiresUserApproval: false,
      reversible: true,
      createdAt: 1_771_718_415_000,
      operations: [
        {
          type: 'canvas.node.update',
          meta: {
            id: 'canvas-node-update:intent-move-canvas-node',
            timestamp: 1_771_718_415_000,
            source: 'ai',
            description: 'Move and resize selected shot node.',
          },
          payload: {
            nodeId: 'node-1',
            updates: {
              position: { x: 40, y: 80 },
              size: { width: 400, height: 225 },
              locked: true,
            },
          },
          before: {
            updates: {
              position: { x: 10, y: 20 },
              size: { width: 320, height: 180 },
              locked: false,
            },
          },
        },
      ],
    });
    expect(isOperationToolPlanTraceable(plan)).toBe(true);
  });

  it('plans canvas.node.reorder for z-index-only changes', async () => {
    const adapter = createCanvasNodeUpdateAdapter({ now: () => 1_771_718_416_000 });
    const intent = {
      id: 'intent-reorder-canvas-node',
      domain: 'canvas' as const,
      summary: 'Bring selected node forward.',
      rationaleId: rationale.id,
      targetIds: ['node-1'],
      parameters: { newZIndex: 9 },
      createdAt: 2,
    };

    await expect(
      adapter.plan(intent, { rationale, metadata: { canvasData: createCanvasData() } }),
    ).resolves.toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            type: 'canvas.node.reorder',
            payload: { nodeId: 'node-1', newZIndex: 9 },
            before: { oldZIndex: 3 },
          }),
        ],
      }),
    );
  });

  it('refuses to plan without canvas data or supported updates', () => {
    const adapter = createCanvasNodeUpdateAdapter();
    const intent = {
      id: 'intent-unsupported-canvas-node',
      domain: 'canvas' as const,
      summary: 'Adjust selected node.',
      rationaleId: rationale.id,
      targetIds: ['node-1'],
      parameters: { updates: { unsupported: true } },
      createdAt: 2,
    };

    expect(adapter.canPlan(intent, { rationale })).toBe(false);
    expect(
      adapter.canPlan(intent, { rationale, metadata: { canvasData: createCanvasData() } }),
    ).toBe(false);
  });
});
