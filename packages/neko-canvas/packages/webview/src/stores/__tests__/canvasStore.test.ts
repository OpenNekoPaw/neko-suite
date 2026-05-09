import { beforeEach, describe, expect, it } from 'vitest';
import {
  isSceneGroupNode,
  isShotNode,
  type CanvasData,
  type SceneGroupCanvasNode,
  type ShotCanvasNode,
} from '@neko/shared';
import { buildCanvasNode } from '../../utils/nodeFactory';
import { hydrateCanvasNodePreview } from '../../utils/canvasPresetRegistry';
import { useCanvasStore } from '../canvasStore';
import { useHistoryStore } from '../historyStore';

function createSceneNode(): SceneGroupCanvasNode {
  return {
    id: 'scene-1',
    type: 'scene',
    position: { x: 100, y: 100 },
    size: { width: 720, height: 420 },
    zIndex: 0,
    data: {
      sceneTitle: 'Scene 1',
      sceneNumber: 1,
      shotIds: [],
    },
  };
}

function createShotNode(id: string, x: number, y: number): ShotCanvasNode {
  return {
    id,
    type: 'shot',
    position: { x, y },
    size: { width: 220, height: 200 },
    zIndex: 1,
    data: {
      shotNumber: 1,
      duration: 3,
      visualDescription: '',
      characters: [],
      shotScale: 'MS',
      characterAction: '',
      emotion: [],
      sceneTags: [],
      generationStatus: 'idle',
      generationHistory: [],
    },
  };
}

function createCanvasData(nodes: CanvasData['nodes']): CanvasData {
  return {
    version: '1.0',
    name: 'Scene Test',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes,
    connections: [],
  };
}

describe('canvasStore scene container actions', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      canvasData: null,
      selection: { nodeIds: [], connectionIds: [] },
      isConnecting: false,
      pendingConnectionSource: null,
      activePlayingNodeId: null,
      generationPanelState: { visible: false, nodeId: null, cellId: null },
    });
    useHistoryStore.setState({ undoStack: [], redoStack: [], maxHistory: 50 });
  });

  it('assigns selected shots into a scene and auto-layouts them in shotIds order', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        createCanvasData([
          createSceneNode(),
          createShotNode('shot-1', 20, 20),
          createShotNode('shot-2', 40, 40),
        ]),
      );

    useCanvasStore.getState().assignShotsToScene('scene-1', ['shot-2', 'shot-1'], true);

    const state = useCanvasStore.getState().canvasData;
    const scene = state?.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === 'scene-1',
    );
    const shot1 = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-1',
    );
    const shot2 = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-2',
    );

    expect(scene?.data.shotIds).toEqual(['shot-2', 'shot-1']);
    expect(scene?.container?.childIds).toEqual(['shot-2', 'shot-1']);
    expect(shot1?.parentId).toBe('scene-1');
    expect(shot1?.data.sceneGroupId).toBe('scene-1');
    expect(shot2?.data.sceneGroupId).toBe('scene-1');
    expect(shot2?.position.x).toBeLessThan(shot1?.position.x ?? 0);
    expect(shot1?.position.y).toBe(shot2?.position.y);
  });

  it('updates scene membership when a shot is dragged into and out of a scene', () => {
    useCanvasStore
      .getState()
      .setCanvasData(createCanvasData([createSceneNode(), createShotNode('shot-1', 900, 900)]));

    useCanvasStore.getState().moveNodeEnd('shot-1', { x: 160, y: 220 });

    let state = useCanvasStore.getState().canvasData;
    let scene = state?.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === 'scene-1',
    );
    let shot = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-1',
    );

    expect(shot?.data.sceneGroupId).toBe('scene-1');
    expect(shot?.parentId).toBe('scene-1');
    expect(scene?.data.shotIds).toEqual(['shot-1']);

    useCanvasStore.getState().moveNodeEnd('shot-1', { x: 980, y: 980 });

    state = useCanvasStore.getState().canvasData;
    scene = state?.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === 'scene-1',
    );
    shot = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-1',
    );

    expect(shot?.data.sceneGroupId).toBeUndefined();
    expect(shot?.parentId).toBeUndefined();
    expect(scene?.data.shotIds).toEqual([]);
  });

  it('reorders managed shots within a scene and preserves shotIds order', () => {
    useCanvasStore.getState().setCanvasData(
      createCanvasData([
        {
          ...createSceneNode(),
          data: {
            ...createSceneNode().data,
            shotIds: ['shot-1', 'shot-2'],
          },
        },
        {
          ...createShotNode('shot-1', 160, 220),
          data: {
            ...createShotNode('shot-1', 160, 220).data,
            sceneGroupId: 'scene-1',
          },
        },
        {
          ...createShotNode('shot-2', 420, 220),
          data: {
            ...createShotNode('shot-2', 420, 220).data,
            sceneGroupId: 'scene-1',
          },
        },
      ]),
    );

    useCanvasStore.getState().reorderSceneShots('scene-1', ['shot-2', 'shot-1'], true);

    const state = useCanvasStore.getState().canvasData;
    const scene = state?.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === 'scene-1',
    );
    const shot1 = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-1',
    );
    const shot2 = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-2',
    );

    expect(scene?.data.shotIds).toEqual(['shot-2', 'shot-1']);
    expect(scene?.container?.childIds).toEqual(['shot-2', 'shot-1']);
    expect(shot2?.position.x).toBeLessThan(shot1?.position.x ?? 0);
  });

  it('records moved shot positions when auto-layout runs on an existing scene', () => {
    useCanvasStore.getState().setCanvasData(
      createCanvasData([
        {
          ...createSceneNode(),
          data: {
            ...createSceneNode().data,
            shotIds: ['shot-1', 'shot-2'],
          },
        },
        {
          ...createShotNode('shot-1', 120, 360),
          data: {
            ...createShotNode('shot-1', 120, 360).data,
            sceneGroupId: 'scene-1',
          },
        },
        {
          ...createShotNode('shot-2', 140, 620),
          data: {
            ...createShotNode('shot-2', 140, 620).data,
            sceneGroupId: 'scene-1',
          },
        },
      ]),
    );

    useCanvasStore.getState().autoLayoutSceneShots('scene-1');
  });

  it('groups and ungroups nodes through generic container membership', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        createCanvasData([createShotNode('shot-1', 100, 100), createShotNode('shot-2', 360, 100)]),
      );

    const groupId = useCanvasStore.getState().groupNodes(['shot-1', 'shot-2']);

    let state = useCanvasStore.getState().canvasData;
    const group = state?.nodes.find((node) => node.id === groupId);
    const shot1 = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-1',
    );

    expect(group?.type).toBe('group');
    expect(group?.container?.childIds).toEqual(['shot-1', 'shot-2']);
    expect(shot1?.parentId).toBe(groupId);
    expect(shot1?.data.sceneGroupId).toBeUndefined();

    useCanvasStore.getState().ungroupNodes(groupId);

    state = useCanvasStore.getState().canvasData;
    const releasedShot = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-1',
    );

    expect(state?.nodes.some((node) => node.id === groupId)).toBe(false);
    expect(releasedShot?.parentId).toBeUndefined();
  });

  it('refreshes migrated node previews after data and block updates', () => {
    const shot = hydrateCanvasNodePreview({
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 1,
        preset: 'shot.basic',
        data: {
          shotNumber: 4,
          visualDescription: 'Old description',
          generationHistory: [
            {
              id: 'candidate-1',
              dataUrl: 'blob:runtime-old',
              prompt: 'old',
              timestamp: 1,
              selected: true,
              assetId: 'asset-old',
            },
          ],
        },
      }),
      id: 'shot-4',
    } as CanvasData['nodes'][number]);

    useCanvasStore.getState().setCanvasData(createCanvasData([shot]));
    useCanvasStore.getState().updateNodeData('shot-4', {
      visualDescription: 'Updated description',
      generationHistory: [
        {
          id: 'candidate-2',
          dataUrl: 'blob:runtime-new',
          prompt: 'new',
          timestamp: 2,
          selected: true,
          assetId: 'asset-new',
        },
      ],
    });

    let state = useCanvasStore.getState().canvasData;
    let nextShot = state?.nodes.find((node) => node.id === 'shot-4');
    expect(nextShot?.preview).toMatchObject({
      nodeId: 'shot-4',
      subtitle: 'Updated description',
      thumbnailVariantId: 'candidate-2',
      metadata: {
        selectedAssetId: 'asset-new',
      },
    });

    useCanvasStore.getState().updateBlock({
      nodeId: 'shot-4',
      blockId: 'shot-visual-description',
      value: 'Block edit',
    });

    state = useCanvasStore.getState().canvasData;
    nextShot = state?.nodes.find((node) => node.id === 'shot-4');
    expect(nextShot?.preview?.subtitle).toBe('Block edit');
    expect(JSON.stringify(nextShot?.preview)).not.toContain('blob:runtime');
  });
});
