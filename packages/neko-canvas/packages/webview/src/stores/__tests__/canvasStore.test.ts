import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCanvasStoryboardExecutionSummary,
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
import { usePlaybackStore } from '../playbackStore';

function createSceneNode(): SceneGroupCanvasNode {
  return {
    id: 'scene-1',
    type: 'scene',
    position: { x: 100, y: 100 },
    size: { width: 720, height: 420 },
    zIndex: 0,
    container: { policy: 'scene', childIds: [] },
    data: {
      sceneTitle: 'Scene 1',
      sceneNumber: 1,
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
      generationPanelState: { visible: false, nodeId: null, childNodeId: null },
    });
    useHistoryStore.setState({ undoStack: [], redoStack: [], maxHistory: 50 });
  });

  it('assigns selected shots into a scene and auto-layouts them in container order', () => {
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

    expect(scene?.container?.childIds).toEqual(['shot-2', 'shot-1']);
    expect(shot1?.parentId).toBe('scene-1');
    expect(shot2?.parentId).toBe('scene-1');
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

    expect(shot?.parentId).toBe('scene-1');
    expect(scene?.container?.childIds).toEqual(['shot-1']);

    useCanvasStore.getState().moveNodeEnd('shot-1', { x: 980, y: 980 });

    state = useCanvasStore.getState().canvasData;
    scene = state?.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === 'scene-1',
    );
    shot = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-1',
    );

    expect(shot?.parentId).toBeUndefined();
    expect(scene?.container?.childIds).toEqual([]);
  });

  it('reorders managed shots within a scene and preserves container order', () => {
    useCanvasStore.getState().setCanvasData(
      createCanvasData([
        {
          ...createSceneNode(),
          container: { policy: 'scene', childIds: ['shot-1', 'shot-2'] },
        },
        {
          ...createShotNode('shot-1', 160, 220),
          parentId: 'scene-1',
        },
        {
          ...createShotNode('shot-2', 420, 220),
          parentId: 'scene-1',
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

    expect(scene?.container?.childIds).toEqual(['shot-2', 'shot-1']);
    expect(shot2?.position.x).toBeLessThan(shot1?.position.x ?? 0);
  });

  it('records moved shot positions when auto-layout runs on an existing scene', () => {
    useCanvasStore.getState().setCanvasData(
      createCanvasData([
        {
          ...createSceneNode(),
          container: { policy: 'scene', childIds: ['shot-1', 'shot-2'] },
        },
        {
          ...createShotNode('shot-1', 120, 360),
          parentId: 'scene-1',
        },
        {
          ...createShotNode('shot-2', 140, 620),
          parentId: 'scene-1',
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

  it('provides store node data for storyboard execution summary projection', () => {
    useCanvasStore.getState().setCanvasData(
      createCanvasData([
        {
          ...createSceneNode(),
          data: {
            ...createSceneNode().data,
            sourceScriptUri: 'file:///project/demo.fountain',
            sceneId: 'scene_1',
          },
          container: { policy: 'scene', childIds: ['shot-1'] },
        },
        {
          ...createShotNode('shot-1', 160, 220),
          parentId: 'scene-1',
          data: {
            ...createShotNode('shot-1', 160, 220).data,
            generationStatus: 'done',
            generationHistory: [
              {
                id: 'candidate-1',
                dataUrl: 'blob:runtime-preview',
                prompt: 'test',
                timestamp: 1,
                selected: true,
                assetId: 'asset-shot-1',
              },
            ],
            lastImportedToTimelineAt: 42,
            lastImportedToTimelineProject: 'Demo Cut',
          },
        },
      ]),
    );

    const nodes = useCanvasStore.getState().canvasData?.nodes ?? [];
    const summary = createCanvasStoryboardExecutionSummary({
      nodes,
      request: {
        sourceScriptUri: 'file:///project/demo.fountain',
        sceneId: 'scene_1',
      },
    });

    expect(summary.scenes[0]).toMatchObject({
      sceneId: 'scene_1',
      shotCount: 1,
      generatedShotCount: 1,
      selectedThumbnailRef: 'asset-shot-1',
    });
    expect(summary.scenes[0]?.shots[0]).toMatchObject({
      lastImportedToTimelineAt: 42,
      lastImportedToTimelineProject: 'Demo Cut',
    });
    expect(JSON.stringify(summary)).not.toContain('blob:runtime-preview');
  });

  it('applies subsystem metadata defaults when trigger nodes are loaded or added', () => {
    useCanvasStore.getState().setCanvasData(
      createCanvasData([
        {
          id: 'choice-1',
          type: 'choice',
          position: { x: 0, y: 0 },
          size: { width: 220, height: 120 },
          zIndex: 1,
          data: {},
        },
      ]),
    );

    expect(useCanvasStore.getState().canvasData?.narrative).toEqual({ variables: [] });

    useCanvasStore.getState().addNode({
      type: 'state',
      position: { x: 260, y: 0 },
      size: { width: 220, height: 120 },
      zIndex: 2,
      data: {},
    });

    expect(useCanvasStore.getState().canvasData?.behavior).toEqual({ blackboard: [] });
  });
});

describe('playbackStore runtime handoff', () => {
  beforeEach(() => {
    usePlaybackStore.setState({
      playbacks: new Map(),
      activePlayback: null,
      handoffRequest: null,
    });
  });

  it('tracks one active surface and consumes matching handoff requests once', () => {
    const store = usePlaybackStore.getState();

    store.startActivePlayback({
      assetPath: 'assets/clip.mp4',
      mediaType: 'video',
      surfaceId: 'inline-1',
      surfaceKind: 'inline',
      currentTime: 4,
      duration: 12,
    });
    store.updateActivePlayback('assets/clip.mp4', 'inline-1', { currentTime: 5 });
    store.requestHandoff({
      assetPath: 'assets/clip.mp4',
      mediaType: 'video',
      fromSurfaceId: 'inline-1',
      toKind: 'overlay',
      startTime: 5,
    });

    expect(usePlaybackStore.getState().activePlayback?.currentTime).toBe(5);
    expect(usePlaybackStore.getState().consumeHandoff('assets/clip.mp4', 'inline')).toBeNull();
    expect(usePlaybackStore.getState().consumeHandoff('assets/clip.mp4', 'overlay')).toMatchObject({
      fromSurfaceId: 'inline-1',
      startTime: 5,
    });
    expect(usePlaybackStore.getState().consumeHandoff('assets/clip.mp4', 'overlay')).toBeNull();
  });

  it('ignores stop requests from a non-owning playback surface', () => {
    const store = usePlaybackStore.getState();

    store.startActivePlayback({
      assetPath: 'assets/clip.mp4',
      mediaType: 'video',
      surfaceId: 'inline-1',
      surfaceKind: 'inline',
      currentTime: 4,
      duration: 12,
    });
    store.stopActivePlayback('assets/clip.mp4', 'overlay-1', 8);

    expect(usePlaybackStore.getState().activePlayback).toMatchObject({
      assetPath: 'assets/clip.mp4',
      surfaceId: 'inline-1',
      currentTime: 4,
    });
    expect(usePlaybackStore.getState().getPlayback('assets/clip.mp4')).toBeUndefined();
  });

  it('ignores active playback updates after playback has stopped', () => {
    const store = usePlaybackStore.getState();

    store.startActivePlayback({
      assetPath: 'assets/clip.mp4',
      mediaType: 'video',
      surfaceId: 'inline-1',
      surfaceKind: 'inline',
      currentTime: 4,
      duration: 12,
    });
    store.stopActivePlayback('assets/clip.mp4', 'inline-1', 5);
    store.updateActivePlayback('assets/clip.mp4', 'inline-1', { currentTime: 9, isPlaying: true });

    expect(usePlaybackStore.getState().activePlayback).toBeNull();
    expect(usePlaybackStore.getState().getPlayback('assets/clip.mp4')).toMatchObject({
      currentTime: 5,
      duration: 12,
      wasPlaying: false,
    });
  });

  it('does not consume handoff requests for a different asset or target surface kind', () => {
    const store = usePlaybackStore.getState();

    store.requestHandoff({
      assetPath: 'assets/clip.mp4',
      mediaType: 'video',
      fromSurfaceId: 'inline-1',
      toKind: 'overlay',
      startTime: 5,
    });

    expect(usePlaybackStore.getState().consumeHandoff('assets/other.mp4', 'overlay')).toBeNull();
    expect(usePlaybackStore.getState().consumeHandoff('assets/clip.mp4', 'inline')).toBeNull();
    expect(usePlaybackStore.getState().consumeHandoff('assets/clip.mp4', 'overlay')).toMatchObject({
      assetPath: 'assets/clip.mp4',
      startTime: 5,
    });
  });
});
