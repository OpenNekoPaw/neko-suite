import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityContext, ModelSceneGraphSnapshot, NekoModelAPI } from '@neko/shared';
import { TOOL_NAMES_MODEL } from '@neko/shared';
import { createNekoModelCapabilityProvider } from './agentCapabilityProvider';

describe('createNekoModelCapabilityProvider', () => {
  it('registers scene query, node manipulation, and animation tools with safety metadata', () => {
    const provider = createNekoModelCapabilityProvider(createModelApi());
    const tools = provider.getTools(createContext());
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect([...byName.keys()]).toEqual([
      TOOL_NAMES_MODEL.MODEL_SCENE_QUERY,
      TOOL_NAMES_MODEL.MODEL_NODE_MANIPULATE,
      TOOL_NAMES_MODEL.MODEL_ANIMATION_CONTROL,
    ]);
    expect(byName.get(TOOL_NAMES_MODEL.MODEL_SCENE_QUERY)).toMatchObject({
      isReadOnly: true,
      isConcurrencySafe: true,
      safetyKind: 'read-only-query',
    });
    expect(byName.get(TOOL_NAMES_MODEL.MODEL_NODE_MANIPULATE)).toMatchObject({
      safetyKind: 'non-destructive-mutation',
      targetRequirements: { required: ['operation', 'nodeId'] },
      queryBeforeMutate: {
        preferredQueryTools: [TOOL_NAMES_MODEL.MODEL_SCENE_QUERY],
      },
    });
    expect(byName.get(TOOL_NAMES_MODEL.MODEL_ANIMATION_CONTROL)).toMatchObject({
      safetyKind: 'non-destructive-mutation',
      targetRequirements: { required: ['operation'] },
      queryBeforeMutate: {
        preferredQueryTools: [TOOL_NAMES_MODEL.MODEL_SCENE_QUERY],
      },
    });
    expect(byName.get(TOOL_NAMES_MODEL.MODEL_SCENE_QUERY)?.description).toContain(
      '2D, 3D, or Live Stage profiles',
    );
    expect(byName.get(TOOL_NAMES_MODEL.MODEL_NODE_MANIPULATE)?.description).toContain(
      'Generic 2D Scene creation targets neko-model',
    );
  });

  it('queries scene graph and reports unavailable host diagnostics', async () => {
    const scene: ModelSceneGraphSnapshot = {
      sceneId: 'scene-main',
      nodes: [{ id: 'node-body', name: 'Body', parentId: null, visible: true, kind: 'mesh' }],
      materials: [],
      animations: [],
      activeModelPath: './hero.glb',
    };
    const api = createModelApi({
      getSceneGraph: vi.fn(async () => scene),
    });
    const queryTool = toolByName(
      createNekoModelCapabilityProvider(api),
      TOOL_NAMES_MODEL.MODEL_SCENE_QUERY,
    );

    await expect(queryTool.execute({ query: 'scene' })).resolves.toMatchObject({
      success: true,
      data: { scene: { sceneId: 'scene-main', activeModelPath: './hero.glb' } },
    });

    const unavailableTool = toolByName(
      createNekoModelCapabilityProvider(
        createModelApi({ getSceneGraph: vi.fn(async () => undefined) }),
      ),
      TOOL_NAMES_MODEL.MODEL_SCENE_QUERY,
    );
    await expect(unavailableTool.execute({ query: 'scene' })).resolves.toMatchObject({
      success: false,
      error: 'No active model editor is available.',
    });
  });

  it('executes node transform, visibility, and material operations through NekoModelAPI', async () => {
    const setNodeTransform = vi.fn(async () => ({ ok: true, revision: 11 }));
    const setNodeVisible = vi.fn(async () => ({ ok: true, revision: 12 }));
    const updateMaterial = vi.fn(async () => ({ ok: true, revision: 13 }));
    const tool = toolByName(
      createNekoModelCapabilityProvider(
        createModelApi({ setNodeTransform, setNodeVisible, updateMaterial }),
      ),
      TOOL_NAMES_MODEL.MODEL_NODE_MANIPULATE,
    );

    await expect(
      tool.execute({
        operation: 'setTransform',
        nodeId: 'node-body',
        transform: { position: [1, 2, 3] },
      }),
    ).resolves.toMatchObject({ success: true, data: { result: { revision: 11 } } });
    expect(setNodeTransform).toHaveBeenCalledWith('node-body', {
      position: { x: 1, y: 2, z: 3 },
    });

    await expect(
      tool.execute({ operation: 'setVisible', nodeId: 'node-body', visible: false }),
    ).resolves.toMatchObject({ success: true, data: { visible: false } });
    expect(setNodeVisible).toHaveBeenCalledWith('node-body', false);

    await expect(
      tool.execute({
        operation: 'updateMaterial',
        materialId: 'mat-body',
        params: { roughness: 0.7 },
      }),
    ).resolves.toMatchObject({ success: true, data: { materialId: 'mat-body' } });
    expect(updateMaterial).toHaveBeenCalledWith({
      materialId: 'mat-body',
      params: { roughness: 0.7 },
    });
  });

  it('executes animation control and surfaces API failures', async () => {
    const playAnimation = vi.fn(async () => ({ ok: true, revision: 21 }));
    const stopAnimation = vi.fn(async () => ({ ok: true, revision: 22 }));
    const seekAnimation = vi.fn(async () => ({
      ok: false,
      message: 'No active model animation is available.',
    }));
    const tool = toolByName(
      createNekoModelCapabilityProvider(
        createModelApi({ playAnimation, stopAnimation, seekAnimation }),
      ),
      TOOL_NAMES_MODEL.MODEL_ANIMATION_CONTROL,
    );

    await expect(tool.execute({ operation: 'play', name: 'Idle' })).resolves.toMatchObject({
      success: true,
      data: { target: 'Idle', result: { revision: 21 } },
    });
    expect(playAnimation).toHaveBeenCalledWith('Idle');

    await expect(tool.execute({ operation: 'stop' })).resolves.toMatchObject({
      success: true,
      data: { result: { revision: 22 } },
    });
    expect(stopAnimation).toHaveBeenCalled();

    await expect(tool.execute({ operation: 'seek', timeSeconds: 1.5 })).resolves.toMatchObject({
      success: false,
      error: 'No active model animation is available.',
    });
    expect(seekAnimation).toHaveBeenCalledWith(1.5);
  });
});

function createContext(): AgentCapabilityContext {
  return { extensionContext: {} };
}

function toolByName(provider: ReturnType<typeof createNekoModelCapabilityProvider>, name: string) {
  const tool = provider.getTools(createContext()).find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}

function createModelApi(overrides: Partial<NekoModelAPI> = {}): NekoModelAPI {
  return {
    getSceneGraph: vi.fn(async () => ({
      nodes: [],
      materials: [],
      animations: [],
    })),
    getNodeProperties: vi.fn(async () => undefined),
    setNodeTransform: vi.fn(async () => ({ ok: true })),
    setNodeVisible: vi.fn(async () => ({ ok: true })),
    updateMaterial: vi.fn(async () => ({ ok: true })),
    listAnimations: vi.fn(async () => []),
    playAnimation: vi.fn(async () => ({ ok: true })),
    stopAnimation: vi.fn(async () => ({ ok: true })),
    seekAnimation: vi.fn(async () => ({ ok: true })),
    updateViewportCamera: vi.fn(async () => ({ ok: true })),
    getActiveModelPath: vi.fn(() => undefined),
    ...overrides,
  };
}
