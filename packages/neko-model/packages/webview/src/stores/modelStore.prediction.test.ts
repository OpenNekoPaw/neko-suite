import { beforeEach, describe, expect, it } from 'vitest';
import { useModelStore } from './modelStore';
import { LocalPredictionLayer } from '../scene/LocalPredictionLayer';
import { AuthoringPerformanceMetrics } from '../scene/AuthoringPerformanceMetrics';

const node = {
  nodeId: 'node_1',
  name: 'Node',
  children: [],
  visible: true,
  transform: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
  },
};

describe('modelStore transform prediction layer', () => {
  beforeEach(() => {
    useModelStore.setState({
      sceneNodes: [node],
      pendingTransformPredictions: [],
      localPredictionLayer: new LocalPredictionLayer(),
      localPredictions: [],
      sceneRevision: 1,
      selectedNodeId: 'node_1',
      faceParams: {},
      characterTopologyVersions: {},
      modelingSessions: {},
      authoringMetrics: new AuthoringPerformanceMetrics(),
      authoringMetricsSnapshot: new AuthoringPerformanceMetrics().snapshot(),
      lastRenderFrameMeta: null,
      cameraTheta: 0,
      cameraPhi: Math.PI / 4,
      cameraRadius: 5,
      cameraTarget: [0, 0.9, 0],
      showViewportGrid: true,
      lastAutoFramedSceneSignature: null,
    });
  });

  it('keeps predictions out of the authoritative scene mirror until commit', () => {
    useModelStore.getState().addTransformPrediction({
      seq: 5,
      nodeId: 'node_1',
      position: { x: 3, y: 0, z: 0 },
    });

    expect(useModelStore.getState().sceneNodes[0]?.transform?.position?.x).toBe(0);
    expect(useModelStore.getState().pendingTransformPredictions).toHaveLength(1);

    useModelStore.getState().commitTransformPrediction(5);

    expect(useModelStore.getState().sceneNodes[0]?.transform?.position?.x).toBe(3);
    expect(useModelStore.getState().pendingTransformPredictions).toHaveLength(0);
  });

  it('rolls back rejected predictions without mutating scene nodes', () => {
    useModelStore.getState().addTransformPrediction({
      seq: 6,
      nodeId: 'node_1',
      position: { x: 8, y: 0, z: 0 },
    });

    useModelStore.getState().rollbackTransformPrediction(6);

    expect(useModelStore.getState().sceneNodes[0]?.transform?.position?.x).toBe(0);
    expect(useModelStore.getState().pendingTransformPredictions).toHaveLength(0);
  });

  it('commits predictions through render frame applied sequence', () => {
    useModelStore.getState().addTransformPrediction({
      seq: 5,
      nodeId: 'node_1',
      position: { x: 2, y: 0, z: 0 },
    });
    useModelStore.getState().addTransformPrediction({
      seq: 6,
      nodeId: 'node_1',
      position: { x: 4, y: 0, z: 0 },
    });
    useModelStore.getState().addTransformPrediction({
      seq: 9,
      nodeId: 'node_1',
      position: { x: 8, y: 0, z: 0 },
    });

    useModelStore.getState().commitPredictionsThrough(6);

    expect(useModelStore.getState().sceneNodes[0]?.transform?.position?.x).toBe(4);
    expect(useModelStore.getState().pendingTransformPredictions.map((item) => item.seq)).toEqual([
      9,
    ]);
  });

  it('clears acknowledged predictions when a matching SceneDelta arrives', () => {
    useModelStore.getState().addTransformPrediction({
      seq: 7,
      nodeId: 'node_1',
      position: { x: 5, y: 0, z: 0 },
    });

    useModelStore.getState().applySceneDelta({
      revision: 2,
      appliedSeq: 7,
      updatedTransforms: [
        {
          nodeId: 'node_1',
          position: { x: 6, y: 0, z: 0 },
        },
      ],
    });

    expect(useModelStore.getState().sceneRevision).toBe(2);
    expect(useModelStore.getState().sceneNodes[0]?.transform?.position?.x).toBe(6);
    expect(useModelStore.getState().pendingTransformPredictions).toHaveLength(0);
  });

  it('aligns transform command prediction through ack, SceneDelta, and RenderFrameMeta appliedSeq', () => {
    useModelStore.getState().addTransformPrediction({
      seq: 50,
      nodeId: 'node_1',
      position: { x: 2, y: 0, z: 0 },
    });

    useModelStore.getState().applySceneDelta({
      revision: 2,
      appliedSeq: 50,
      updatedTransforms: [
        {
          nodeId: 'node_1',
          position: { x: 2, y: 0, z: 0 },
        },
      ],
    });

    expect(useModelStore.getState().pendingTransformPredictions).toHaveLength(0);
    expect(useModelStore.getState().sceneRevision).toBe(2);

    useModelStore.getState().addTransformPrediction({
      seq: 51,
      nodeId: 'node_1',
      position: { x: 3, y: 0, z: 0 },
    });

    useModelStore.getState().commitPredictionsThrough(51);

    expect(useModelStore.getState().sceneNodes[0]?.transform?.position?.x).toBe(3);
    expect(useModelStore.getState().pendingTransformPredictions).toHaveLength(0);
  });

  it('removes selected descendants when a parent removal delta is applied', () => {
    useModelStore.setState({
      sceneNodes: [
        node,
        {
          ...node,
          nodeId: 'child_1',
          name: 'Child',
          parentId: 'node_1',
        },
      ],
      selectedNodeId: 'child_1',
      sceneRevision: 2,
    });

    useModelStore.getState().applySceneDelta({
      revision: 3,
      removedNodes: ['node_1'],
    });

    expect(useModelStore.getState().sceneNodes).toHaveLength(0);
    expect(useModelStore.getState().selectedNodeId).toBeNull();
  });

  it('aligns character morph command prediction with SceneDelta and RenderFrameMeta sequence', () => {
    const prediction = useModelStore.getState().createLocalPrediction({
      kind: 'morph',
      seq: 70,
      viewportId: 'main',
      sceneRevision: 2,
      characterId: 'character-a',
      topologyVersion: 3,
      payload: { morphId: 'Smile', weight: 0.8 },
      nowMs: 100,
    });

    expect(prediction.status).toBe('active');
    expect(useModelStore.getState().localPredictions).toHaveLength(1);

    useModelStore.getState().applySceneDelta({
      revision: 3,
      appliedSeq: 70,
      updatedCharacterMorphWeights: [
        {
          characterId: 'character-a',
          topologyVersion: 3,
          weights: [{ name: 'Smile', weight: 0.8 }],
        },
      ],
    });
    useModelStore.getState().commitLocalPredictionsThrough(70);

    expect(useModelStore.getState().faceParams['Smile']).toBe(0.8);
    expect(useModelStore.getState().characterTopologyVersions['character-a']).toBe(3);
    expect(useModelStore.getState().localPredictions).toHaveLength(0);
  });

  it('tracks modeling sessions and GPU upload diagnostics for the control surface', () => {
    useModelStore.getState().applySceneDelta({
      revision: 2,
      modelingSessions: [
        {
          sessionId: 'session-sculpt',
          meshId: 'mesh-a',
          characterId: 'character-a',
          topologyMutable: true,
          topologyVersion: 4,
          state: 'active',
          pendingMigrations: ['morph-retarget'],
          opLog: [],
        },
      ],
    });
    useModelStore.getState().recordRenderFrameMeta({
      streamId: 'stream-main',
      viewportId: 'main',
      frameId: 1,
      ptsUs: 0,
      durationUs: 16_666,
      isKeyframe: true,
      sceneRevision: 2,
      appliedSeq: 9,
      frameTimestamp: 0,
      viewTransform: [1, 0, 0, 1, 0, 0],
      diagnostics: {
        qualityTier: 'main-fps-reduced',
        gpuUploadTimeMs: 2.5,
      },
    });

    expect(useModelStore.getState().modelingSessions['session-sculpt']?.topologyVersion).toBe(4);
    expect(useModelStore.getState().authoringMetricsSnapshot.gpuUploadMs).toBe(2.5);
    expect(useModelStore.getState().lastRenderFrameMeta?.diagnostics?.qualityTier).toBe(
      'main-fps-reduced',
    );
  });

  it('auto-frames tiny imported mesh snapshots for the Engine viewport', () => {
    const framed = useModelStore.getState().frameSceneCamera({
      sceneId: 'imported',
      revision: 3,
      animations: [],
      nodes: [
        {
          ...node,
          nodeId: 'root',
          kind: 'node',
          transform: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 0.01, y: 0.01, z: 0.01 },
          },
        },
        {
          ...node,
          nodeId: 'mesh',
          parentId: 'root',
          kind: 'mesh',
          transform: {
            position: { x: 0, y: 0.02, z: -0.12 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 0.01, y: 0.01, z: 0.01 },
          },
        },
      ],
    });

    const state = useModelStore.getState();
    expect(framed).toBe(true);
    expect(state.cameraRadius).toBeGreaterThanOrEqual(0.12);
    expect(state.cameraRadius).toBeLessThan(0.5);
    expect(state.cameraTarget[2]).toBeLessThan(0);
    expect(state.cameraTarget[1]).toBeCloseTo(0.0002, 4);
  });

  it('uses active Engine camera when snapshots provide one', () => {
    useModelStore.getState().frameSceneCamera({
      sceneId: 'with-camera',
      revision: 4,
      animations: [],
      activeCamera: {
        cameraId: 'camera',
        position: { x: 2, y: 3, z: 4 },
        target: { x: 0, y: 1, z: 0 },
        up: { x: 0, y: 1, z: 0 },
        fov: 45,
      },
      nodes: [
        {
          ...node,
          nodeId: 'mesh',
          kind: 'mesh',
        },
      ],
    });

    const state = useModelStore.getState();
    expect(state.cameraTarget).toEqual([0, 1, 0]);
    expect(state.getCameraPosition()[0]).toBeCloseTo(2);
    expect(state.getCameraPosition()[1]).toBeCloseTo(3);
    expect(state.getCameraPosition()[2]).toBeCloseTo(4);
  });

  it('pans the orbit target in camera space', () => {
    useModelStore.setState({
      cameraTheta: Math.PI / 2,
      cameraPhi: Math.PI / 2,
      cameraRadius: 5,
      cameraTarget: [0, 0, 0],
    });

    useModelStore.getState().panCamera(1, 0);
    expect(useModelStore.getState().cameraTarget[2]).toBeCloseTo(1);

    useModelStore.getState().panCamera(0, 1);
    expect(useModelStore.getState().cameraTarget[1]).toBeCloseTo(1);
  });

  it('supports close-up meter-scale zoom below the old 0.5m floor', () => {
    useModelStore.setState({ cameraRadius: 0.2 });

    useModelStore.getState().zoomCamera(-0.12);
    expect(useModelStore.getState().cameraRadius).toBeCloseTo(0.08);

    useModelStore.getState().zoomCamera(-1);
    expect(useModelStore.getState().cameraRadius).toBeCloseTo(0.05);
  });

  it('persists the viewport grid visibility in editor state', () => {
    useModelStore.getState().setViewportGridVisible(false);

    const editorState = useModelStore.getState().getEditorState();
    expect(editorState['showViewportGrid']).toBe(false);

    useModelStore.getState().restoreEditorState({
      ...editorState,
      showViewportGrid: true,
    });

    expect(useModelStore.getState().showViewportGrid).toBe(true);
  });
});
