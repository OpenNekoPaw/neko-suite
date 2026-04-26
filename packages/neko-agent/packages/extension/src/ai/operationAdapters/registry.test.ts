import { describe, expect, it } from 'vitest';
import { createDefaultOperationToolAdapterRegistry } from './registry';

const rationale = {
  id: 'rat-update-shot-3',
  decision: 'update-selected-timeline-clip',
  reason: 'Agent decided the selected clip should be renamed.',
  confidence: 'high' as const,
  observationIds: ['obs-shot-3'],
  evidenceIds: [],
  createdAt: 1,
};

function createProjectData() {
  return {
    version: '2.0',
    name: 'Timeline project',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
      {
        id: 'video-track-1',
        name: 'Video',
        type: 'media',
        muted: false,
        locked: false,
        hidden: false,
        isMain: true,
        elements: [
          {
            id: 'clip-3',
            type: 'media',
            name: 'Shot 3',
            src: '${PROJECT}/shots/shot-3.mp4',
            mediaType: 'video',
            startTime: 1,
            duration: 2,
            trimStart: 0,
            trimEnd: 0,
            transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 },
            opacity: 1,
            blendMode: 'normal',
            effects: [],
            muted: false,
            hidden: false,
            locked: false,
          },
        ],
      },
    ],
  };
}

function createCanvasData() {
  return {
    version: '1.0',
    name: 'Storyboard canvas',
    nodes: [
      {
        id: 'node-1',
        type: 'text',
        position: { x: 10, y: 20 },
        size: { width: 240, height: 80 },
        zIndex: 1,
        data: { content: 'Original', format: 'plain' },
      },
    ],
    connections: [],
  };
}

describe('createDefaultOperationToolAdapterRegistry', () => {
  it('registers the timeline element.update adapter by default', async () => {
    const registry = createDefaultOperationToolAdapterRegistry({ now: () => 1_771_718_410_000 });
    const planner = registry.findPlanner(
      {
        id: 'intent-rename-shot-3',
        domain: 'timeline',
        summary: 'Rename shot 3.',
        rationaleId: rationale.id,
        targetIds: ['clip-3'],
        parameters: { updates: { name: 'Shot 3 — adjusted' } },
        createdAt: 2,
      },
      {
        rationale,
        metadata: { projectData: createProjectData() },
      },
    );

    expect(planner).toBeDefined();
    await expect(
      planner?.plan(
        {
          id: 'intent-rename-shot-3',
          domain: 'timeline',
          summary: 'Rename shot 3.',
          rationaleId: rationale.id,
          targetIds: ['clip-3'],
          parameters: { updates: { name: 'Shot 3 — adjusted' } },
          createdAt: 2,
        },
        {
          rationale,
          metadata: { projectData: createProjectData() },
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'plan:intent-rename-shot-3',
        operations: [expect.objectContaining({ type: 'element.update' })],
      }),
    );
  });

  it('registers the canvas node adapter by default', async () => {
    const registry = createDefaultOperationToolAdapterRegistry({ now: () => 1_771_718_417_000 });
    const intent = {
      id: 'intent-move-node-1',
      domain: 'canvas' as const,
      summary: 'Move canvas node.',
      rationaleId: rationale.id,
      targetIds: ['node-1'],
      parameters: { updates: { position: { x: 100, y: 200 } } },
      createdAt: 2,
    };
    const context = { rationale, metadata: { canvasData: createCanvasData() } };
    const planner = registry.findPlanner(intent, context);

    expect(planner).toBeDefined();
    await expect(planner?.plan(intent, context)).resolves.toEqual(
      expect.objectContaining({
        id: 'plan:intent-move-node-1',
        operations: [expect.objectContaining({ type: 'canvas.node.update' })],
      }),
    );
  });
});
