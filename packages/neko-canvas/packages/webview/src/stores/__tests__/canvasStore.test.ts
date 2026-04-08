import { beforeEach, describe, expect, it } from 'vitest';
import {
  isSceneGroupNode,
  isShotNode,
  type CanvasData,
  type SceneGroupCanvasNode,
  type ShotCanvasNode,
} from '@neko/shared';
import { useCanvasStore } from '../canvasStore';
import { useHistoryStore } from '../historyStore';
import { useCanvasOperationStore } from '../canvasOperationStore';

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

function getOperationNodeIds(): string[] {
  return useCanvasOperationStore.getState().operationLog.flatMap((operation) => {
    const { payload } = operation;
    if (
      payload &&
      typeof payload === 'object' &&
      'nodeId' in payload &&
      typeof payload.nodeId === 'string'
    ) {
      return [payload.nodeId];
    }
    return [];
  });
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
    useCanvasOperationStore.setState({ operationLog: [], maxLogSize: 500 });
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
    expect(shot1?.data.sceneGroupId).toBe('scene-1');
    expect(shot2?.data.sceneGroupId).toBe('scene-1');
    expect(shot2?.position.x).toBeLessThan(shot1?.position.x ?? 0);
    expect(shot1?.position.y).toBe(shot2?.position.y);
    expect(useCanvasOperationStore.getState().operationLog).toHaveLength(3);
    expect(getOperationNodeIds()).toEqual(['scene-1', 'shot-1', 'shot-2']);
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
    expect(shot2?.position.x).toBeLessThan(shot1?.position.x ?? 0);
    expect(useCanvasOperationStore.getState().operationLog).toHaveLength(3);
    expect(getOperationNodeIds()).toEqual(['scene-1', 'shot-1', 'shot-2']);
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

    const ops = useCanvasOperationStore.getState().operationLog;
    expect(ops).toHaveLength(2);
    expect(getOperationNodeIds()).toEqual(['shot-1', 'shot-2']);
  });
});
