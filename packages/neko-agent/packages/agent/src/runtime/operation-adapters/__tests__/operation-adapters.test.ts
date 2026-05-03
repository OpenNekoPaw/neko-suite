import { describe, expect, it } from 'vitest';
import { isOperationToolPlanTraceable } from '@neko/shared';
import {
  createCanvasNodeUpdateAdapter,
  createDefaultOperationToolAdapterRegistry,
  createModelElementUpdateAdapter,
  createTimelineElementUpdateAdapter,
} from '..';

const rationale = {
  id: 'rat-update',
  decision: 'update-selected-object',
  reason: 'Agent decided the selected object should be adjusted.',
  confidence: 'high' as const,
  observationIds: ['obs-1'],
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
      {
        id: 'video-track-2',
        name: 'B-roll',
        type: 'media',
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
        elements: [],
      },
      {
        id: 'model-track-1',
        name: '3D Models',
        type: 'scene3d',
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
        elements: [
          {
            id: 'model-clip-1',
            type: 'scene3d',
            name: 'Robot scene',
            src: '${PROJECT}/models/robot.glb',
            startTime: 0,
            duration: 5,
            trimStart: 0,
            trimEnd: 0,
            transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 },
            opacity: 1,
            blendMode: 'normal',
            effects: [],
            muted: false,
            hidden: false,
            locked: false,
            animationClip: 'idle',
            animationLoop: true,
            animationSpeed: 1,
            cameraNodeId: 'camera-a',
            backgroundColor: [0, 0, 0, 1] as [number, number, number, number],
            cameraOverride: {
              position: [0, 1, 5] as [number, number, number],
              target: [0, 1, 0] as [number, number, number],
              fovY: 45,
            },
          },
          {
            id: 'puppet-clip-1',
            type: 'puppet',
            name: 'Guide puppet',
            src: '${PROJECT}/puppets/guide.moc3',
            startTime: 5,
            duration: 3,
            trimStart: 0,
            trimEnd: 0,
            transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 },
            opacity: 1,
            blendMode: 'normal',
            effects: [],
            muted: false,
            hidden: false,
            locked: false,
            animationClip: 'talk',
            animationLoop: true,
            animationSpeed: 1,
            expression: 'neutral',
            parameterOverrides: { ParamMouthOpenY: 0.2 },
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
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [
      {
        id: 'node-1',
        type: 'shot',
        position: { x: 10, y: 20 },
        size: { width: 320, height: 180 },
        zIndex: 3,
        locked: false,
        data: { content: 'Original' },
      },
    ],
    connections: [],
  };
}

describe('operation tool adapters', () => {
  it('registers timeline, canvas and model planners by default', () => {
    const registry = createDefaultOperationToolAdapterRegistry({ now: () => 1 });

    expect(
      registry.findPlanner(
        {
          id: 'intent-timeline',
          domain: 'timeline',
          summary: 'Rename timeline clip.',
          rationaleId: rationale.id,
          targetIds: ['clip-3'],
          parameters: { updates: { name: 'Shot 3 adjusted' } },
          createdAt: 2,
        },
        { rationale, metadata: { projectData: createProjectData() } },
      ),
    ).toBeDefined();
    expect(
      registry.findPlanner(
        {
          id: 'intent-canvas',
          domain: 'canvas',
          summary: 'Move canvas node.',
          rationaleId: rationale.id,
          targetIds: ['node-1'],
          parameters: { updates: { position: { x: 100, y: 200 } } },
          createdAt: 2,
        },
        { rationale, metadata: { canvasData: createCanvasData() } },
      ),
    ).toBeDefined();
    expect(
      registry.findPlanner(
        {
          id: 'intent-model',
          domain: 'model',
          summary: 'Switch model animation.',
          rationaleId: rationale.id,
          targetIds: ['model-clip-1'],
          parameters: { updates: { animationClip: 'walk' } },
          createdAt: 2,
        },
        { rationale, metadata: { projectData: createProjectData() } },
      ),
    ).toBeDefined();
  });

  it('plans timeline update, split and move operations', async () => {
    const adapter = createTimelineElementUpdateAdapter({ now: () => 1_771_718_409_000 });
    const context = { rationale, metadata: { projectData: createProjectData() } };

    const update = await adapter.plan(
      {
        id: 'intent-rename-shot-3',
        domain: 'timeline',
        summary: 'Rename shot 3.',
        rationaleId: rationale.id,
        targetIds: ['clip-3'],
        parameters: { trackId: 'video-track-1', updates: { name: 'Shot 3 adjusted' } },
        createdAt: 2,
      },
      context,
    );
    expect(update.operations[0]).toEqual(
      expect.objectContaining({
        type: 'element.update',
        payload: {
          trackId: 'video-track-1',
          elementId: 'clip-3',
          updates: { name: 'Shot 3 adjusted' },
        },
        before: { updates: { name: 'Shot 3' } },
      }),
    );
    expect(isOperationToolPlanTraceable(update)).toBe(true);

    await expect(
      adapter.plan(
        {
          id: 'intent-split-shot-3',
          domain: 'timeline',
          summary: 'Split shot 3.',
          rationaleId: rationale.id,
          targetIds: ['clip-3'],
          parameters: { trackId: 'video-track-1', splitPoint: 0.8 },
          createdAt: 2,
        },
        context,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        operations: [expect.objectContaining({ type: 'element.splitAt' })],
      }),
    );

    await expect(
      adapter.plan(
        {
          id: 'intent-move-shot-3',
          domain: 'timeline',
          summary: 'Move shot 3.',
          rationaleId: rationale.id,
          targetIds: ['clip-3'],
          parameters: { trackId: 'video-track-1', toTrackId: 'video-track-2' },
          createdAt: 2,
        },
        context,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            type: 'element.move',
            payload: {
              fromTrackId: 'video-track-1',
              toTrackId: 'video-track-2',
              elementId: 'clip-3',
            },
          }),
        ],
      }),
    );
  });

  it('plans canvas node update and reorder operations', async () => {
    const adapter = createCanvasNodeUpdateAdapter({ now: () => 1_771_718_415_000 });
    const context = { rationale, metadata: { canvasData: createCanvasData() } };

    const update = await adapter.plan(
      {
        id: 'intent-move-canvas-node',
        domain: 'canvas',
        summary: 'Move selected shot node.',
        rationaleId: rationale.id,
        targetIds: ['node-1'],
        parameters: { updates: { position: { x: 40, y: 80 }, locked: true } },
        createdAt: 2,
      },
      context,
    );
    expect(update.operations[0]).toEqual(
      expect.objectContaining({
        type: 'canvas.node.update',
        payload: {
          nodeId: 'node-1',
          updates: { position: { x: 40, y: 80 }, locked: true },
        },
        before: { updates: { position: { x: 10, y: 20 }, locked: false } },
      }),
    );

    await expect(
      adapter.plan(
        {
          id: 'intent-reorder-canvas-node',
          domain: 'canvas',
          summary: 'Bring selected node forward.',
          rationaleId: rationale.id,
          targetIds: ['node-1'],
          parameters: { newZIndex: 9 },
          createdAt: 2,
        },
        context,
      ),
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

  it('plans scene3d and puppet model element updates', async () => {
    const adapter = createModelElementUpdateAdapter({ now: () => 1_771_718_418_000 });
    const context = { rationale, metadata: { projectData: createProjectData() } };

    await expect(
      adapter.plan(
        {
          id: 'intent-update-model-clip',
          domain: 'model',
          summary: 'Switch model animation and camera.',
          rationaleId: rationale.id,
          targetIds: ['model-clip-1'],
          parameters: {
            trackId: 'model-track-1',
            updates: {
              animationClip: 'walk',
              animationLoop: false,
              animationSpeed: 1.25,
              cameraNodeId: 'camera-b',
              backgroundColor: [0.1, 0.2, 0.3, 1],
            },
          },
          createdAt: 2,
        },
        context,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            type: 'element.update',
            payload: expect.objectContaining({
              elementId: 'model-clip-1',
              updates: expect.objectContaining({
                animationClip: 'walk',
                cameraNodeId: 'camera-b',
              }),
            }),
          }),
        ],
      }),
    );

    await expect(
      adapter.plan(
        {
          id: 'intent-update-puppet-clip',
          domain: 'model',
          summary: 'Set puppet expression.',
          rationaleId: rationale.id,
          targetIds: ['puppet-clip-1'],
          parameters: {
            updates: {
              expression: 'smile',
              parameterOverrides: { ParamMouthOpenY: 0.8, ParamEyeLOpen: 1 },
            },
          },
          createdAt: 2,
        },
        context,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            payload: expect.objectContaining({
              elementId: 'puppet-clip-1',
              updates: {
                expression: 'smile',
                parameterOverrides: { ParamMouthOpenY: 0.8, ParamEyeLOpen: 1 },
              },
            }),
            before: {
              updates: {
                expression: 'neutral',
                parameterOverrides: { ParamMouthOpenY: 0.2 },
              },
            },
          }),
        ],
      }),
    );
  });

  it('refuses unsupported intents without required context or supported updates', () => {
    expect(
      createTimelineElementUpdateAdapter().canPlan(
        {
          id: 'intent-missing-project',
          domain: 'timeline',
          summary: 'Rename shot 3.',
          rationaleId: rationale.id,
          targetIds: ['clip-3'],
          parameters: { updates: { unsupported: true } },
          createdAt: 2,
        },
        { rationale },
      ),
    ).toBe(false);
    expect(
      createCanvasNodeUpdateAdapter().canPlan(
        {
          id: 'intent-unsupported-canvas-node',
          domain: 'canvas',
          summary: 'Adjust selected node.',
          rationaleId: rationale.id,
          targetIds: ['node-1'],
          parameters: { updates: { unsupported: true } },
          createdAt: 2,
        },
        { rationale, metadata: { canvasData: createCanvasData() } },
      ),
    ).toBe(false);
    expect(
      createModelElementUpdateAdapter().canPlan(
        {
          id: 'intent-unsupported-model-clip',
          domain: 'model',
          summary: 'Unsupported model update.',
          rationaleId: rationale.id,
          targetIds: ['model-clip-1'],
          parameters: { updates: { unsupported: true } },
          createdAt: 2,
        },
        { rationale, metadata: { projectData: createProjectData() } },
      ),
    ).toBe(false);
  });
});
