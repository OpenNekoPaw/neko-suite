import { describe, expect, it } from 'vitest';
import { isOperationToolPlanTraceable } from '@neko/shared';
import { createModelElementUpdateAdapter } from './modelElementUpdateAdapter';

const rationale = {
  id: 'rat-update-model-element',
  decision: 'update-selected-model-element',
  reason: 'Agent decided the selected model element should change animation state.',
  confidence: 'high' as const,
  observationIds: ['obs-model-element'],
  evidenceIds: [],
  createdAt: 1,
};

function createProjectData() {
  return {
    version: '2.0',
    name: 'Model timeline project',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
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

describe('createModelElementUpdateAdapter', () => {
  it('plans scene3d animation and camera updates as element.update', async () => {
    const adapter = createModelElementUpdateAdapter({ now: () => 1_771_718_418_000 });
    const intent = {
      id: 'intent-update-model-clip',
      domain: 'model' as const,
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
          cameraOverride: {
            position: [1, 2, 6],
            target: [0, 1, 0],
            up: [0, 1, 0],
            fovY: 50,
          },
        },
      },
      createdAt: 2,
    };
    const context = { rationale, metadata: { projectData: createProjectData() } };

    expect(adapter.canPlan(intent, context)).toBe(true);
    const plan = await adapter.plan(intent, context);
    expect(plan).toEqual({
      id: 'plan:intent-update-model-clip',
      intentId: 'intent-update-model-clip',
      rationaleId: 'rat-update-model-element',
      requiresUserApproval: false,
      reversible: true,
      createdAt: 1_771_718_418_000,
      operations: [
        {
          type: 'element.update',
          meta: {
            id: 'model-element-update:intent-update-model-clip',
            timestamp: 1_771_718_418_000,
            source: 'ai',
            description: 'Switch model animation and camera.',
          },
          payload: {
            trackId: 'model-track-1',
            elementId: 'model-clip-1',
            updates: {
              animationClip: 'walk',
              animationLoop: false,
              animationSpeed: 1.25,
              cameraNodeId: 'camera-b',
              backgroundColor: [0.1, 0.2, 0.3, 1],
              cameraOverride: {
                position: [1, 2, 6],
                target: [0, 1, 0],
                up: [0, 1, 0],
                fovY: 50,
              },
            },
          },
          before: {
            updates: {
              animationClip: 'idle',
              animationLoop: true,
              animationSpeed: 1,
              cameraNodeId: 'camera-a',
              backgroundColor: [0, 0, 0, 1],
              cameraOverride: {
                position: [0, 1, 5],
                target: [0, 1, 0],
                fovY: 45,
              },
            },
          },
        },
      ],
    });
    expect(isOperationToolPlanTraceable(plan)).toBe(true);
  });

  it('plans puppet expression and parameter overrides as element.update', async () => {
    const adapter = createModelElementUpdateAdapter({ now: () => 1_771_718_419_000 });
    const intent = {
      id: 'intent-update-puppet-clip',
      domain: 'model' as const,
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
    };

    await expect(
      adapter.plan(intent, { rationale, metadata: { projectData: createProjectData() } }),
    ).resolves.toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            type: 'element.update',
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

  it('refuses non-model elements and unsupported updates', () => {
    const adapter = createModelElementUpdateAdapter();
    const intent = {
      id: 'intent-unsupported-model-clip',
      domain: 'model' as const,
      summary: 'Unsupported model update.',
      rationaleId: rationale.id,
      targetIds: ['model-clip-1'],
      parameters: { updates: { unsupported: true } },
      createdAt: 2,
    };

    expect(adapter.canPlan(intent, { rationale })).toBe(false);
    expect(
      adapter.canPlan(intent, { rationale, metadata: { projectData: createProjectData() } }),
    ).toBe(false);
  });
});
