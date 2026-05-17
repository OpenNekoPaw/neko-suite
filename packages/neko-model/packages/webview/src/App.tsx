import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from './i18n/I18nContext';
import { Toolbar } from './components/Toolbar';
import { VideoViewport } from './components/VideoViewport';
import { R3FDevelopmentFallback } from './components/R3FDevelopmentFallback';
import { AnimationPlayer } from './components/AnimationPlayer';
import { SceneTree } from './components/SceneTree';
import { TransformPanel } from './components/panels/TransformPanel';
import { FaceEditorPanel } from './components/face';
import { LatencyTester } from './components/LatencyTester';
import { ExpressionPresetPanel } from './components/vrm';
import { BoneExpressionPanel } from './components/bone-expression';
import { CsgPanel } from './components/csg';
import { TextEditorPanel } from './components/text-editor';
import { ShapeCreatorPanel } from './components/shape-creator';
import { SculptBrushPanel } from './components/sculpt/SculptBrushPanel';
import { ModelKeyframeTimeline } from './components/ModelKeyframeTimeline';
import { EngineDiagnosticsPanel } from './components/EngineDiagnosticsPanel';
import { useModelStore } from './stores/modelStore';
import type { AnimationClipInfo, ExtensionMessage, SceneNodeSnapshot } from './types';
import type { SceneCommandEnvelope } from '@neko/shared';
import type { AnimationClip } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { VRMExpressionPreset } from './types/vrmExpressions';
import { postMessage } from '@neko/shared/vscode';
import { EngineClient, type SceneControlSocket } from '@neko/neko-client';
import type { EditableNodeTransform } from './scene/SceneEditingTypes';
import type { ShapeType } from './types/shapeParams';

/**
 * Root application component for the 3D Model Editor webview.
 * Uses Zustand store for all state management.
 */
export function App(): React.JSX.Element {
  const sceneControlRef = useRef<SceneControlSocket | null>(null);
  const latestRevisionRef = useRef(0);
  const [enginePort, setEnginePort] = useState<number | null>(null);
  const [sceneControlSocket, setSceneControlSocket] = useState<SceneControlSocket | null>(null);
  const sceneId = useModelStore((s) => s.sceneId);
  const modelUrl = useModelStore((s) => s.modelUrl);
  const qualityPreviewDataUrl = useModelStore((s) => s.qualityPreviewDataUrl);
  const sceneNodes = useModelStore((s) => s.sceneNodes);
  const sceneRevision = useModelStore((s) => s.sceneRevision);
  const sceneControlStatus = useModelStore((s) => s.sceneControlStatus);
  const hasPendingPrediction = useModelStore((s) => s.pendingTransformPredictions.length > 0);
  const localPredictions = useModelStore((s) => s.localPredictions);
  const viewportOverlay = useModelStore((s) => s.viewportOverlay);
  const topologyWarning = useModelStore((s) => s.topologyWarning);
  const characterTopologyVersions = useModelStore((s) => s.characterTopologyVersions);
  const selectedNodeId = useModelStore((s) => s.selectedNodeId);
  const animationClips = useModelStore((s) => s.animationClips);
  const activeAnimation = useModelStore((s) => s.activeAnimation);
  const playbackState = useModelStore((s) => s.playbackState);
  const transformMode = useModelStore((s) => s.transformMode);
  const isExpressionPresetOpen = useModelStore((s) => s.isExpressionPresetOpen);
  const isLatencyTesterOpen = useModelStore((s) => s.isLatencyTesterOpen);
  const isFaceEditorOpen = useModelStore((s) => s.isFaceEditorOpen);
  const isBoneExpressionOpen = useModelStore((s) => s.isBoneExpressionOpen);
  const isShapeCreatorOpen = useModelStore((s) => s.isShapeCreatorOpen);
  const isTextEditorOpen = useModelStore((s) => s.isTextEditorOpen);
  const isCsgPanelOpen = useModelStore((s) => s.isCsgPanelOpen);
  const isSculptBrushOpen = useModelStore((s) => s.isSculptBrushOpen);
  const isKeyframeEditorOpen = useModelStore((s) => s.isKeyframeEditorOpen);

  const setModelUrl = useModelStore((s) => s.setModelUrl);
  const setQualityPreview = useModelStore((s) => s.setQualityPreview);
  const setEnvironmentPlacement = useModelStore((s) => s.setEnvironmentPlacement);
  const applySceneSnapshot = useModelStore((s) => s.applySceneSnapshot);
  const applySceneDelta = useModelStore((s) => s.applySceneDelta);
  const setSceneControlStatus = useModelStore((s) => s.setSceneControlStatus);
  const addTransformPrediction = useModelStore((s) => s.addTransformPrediction);
  const commitPredictionsThrough = useModelStore((s) => s.commitPredictionsThrough);
  const rollbackTransformPrediction = useModelStore((s) => s.rollbackTransformPrediction);
  const createLocalPrediction = useModelStore((s) => s.createLocalPrediction);
  const commitLocalPredictionsThrough = useModelStore((s) => s.commitLocalPredictionsThrough);
  const rollbackLocalPrediction = useModelStore((s) => s.rollbackLocalPrediction);
  const recordPatchBytes = useModelStore((s) => s.recordPatchBytes);
  const selectNode = useModelStore((s) => s.selectNode);
  const setAnimationClips = useModelStore((s) => s.setAnimationClips);
  const setActiveAnimation = useModelStore((s) => s.setActiveAnimation);
  const play = useModelStore((s) => s.play);
  const pause = useModelStore((s) => s.pause);
  const stop = useModelStore((s) => s.stop);
  const setTransformMode = useModelStore((s) => s.setTransformMode);
  const setVRMLoaded = useModelStore((s) => s.setVRMLoaded);

  useEffect(() => {
    latestRevisionRef.current = sceneRevision;
  }, [sceneRevision]);

  useEffect(
    () => () => {
      sceneControlRef.current?.close(1000, 'model editor disposed');
      sceneControlRef.current = null;
      setSceneControlSocket(null);
    },
    [],
  );

  // Listen for messages from extension host
  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;
      switch (message.type) {
        case 'loadModel':
          setModelUrl(message.resourceUrl ?? message.uri, message.resourceBaseUrl ?? null);
          break;
        case 'enginePort': {
          setEnginePort(message.port);
          sceneControlRef.current?.close(1000, 'reconnecting scene control');
          setSceneControlSocket(null);
          setSceneControlStatus('connecting');
          const client = new EngineClient(message.port);
          const socket = client.openSceneControlSocket({
            sceneId: useModelStore.getState().sceneId,
            onReady: (ready) => {
              setSceneControlStatus('ready');
              if (
                typeof ready.serverRevision === 'number' &&
                ready.serverRevision > latestRevisionRef.current
              ) {
                sceneControlRef.current?.resync(useModelStore.getState().sceneId);
              }
            },
            onSnapshot: (snapshot) => {
              latestRevisionRef.current = snapshot.revision;
              setSceneControlStatus('ready');
              useModelStore.getState().applySceneSnapshot(snapshot);
            },
            onDelta: (delta) => {
              latestRevisionRef.current = delta.revision;
              setSceneControlStatus('ready');
              useModelStore.getState().applySceneDelta(delta);
            },
            onAck: (ack) => {
              if (ack.status === 'rejected') {
                setSceneControlStatus('error', ack.error ?? 'Scene command rejected');
                sceneControlRef.current?.resync(useModelStore.getState().sceneId);
                return;
              }
              latestRevisionRef.current = Math.max(latestRevisionRef.current, ack.revision);
            },
            onError: (error) => setSceneControlStatus('error', error.message),
          });
          sceneControlRef.current = socket;
          setSceneControlSocket(socket);
          break;
        }
        case 'sceneSnapshot': {
          // Backend scene snapshot — populate scene tree with ECS data
          const { snapshot } = message;
          applySceneSnapshot(snapshot);
          if (snapshot.animations) {
            const clipInfos: AnimationClipInfo[] = snapshot.animations.map((a) => ({
              name: a.name,
              duration: a.duration,
            }));
            setAnimationClips(clipInfos);
          }
          break;
        }
        case 'sceneDelta': {
          // Incremental transform updates from engine tick
          const { delta } = message;
          applySceneDelta(delta);
          break;
        }
        case 'sceneCapturePreview':
          setQualityPreview(message.preview.dataUrl);
          break;
        case 'keyboardAction':
          switch (message.action) {
            case 'escape':
              selectNode(null);
              break;
            case 'resetView': {
              useModelStore.getState().resetCamera();
              if (enginePort !== null) {
                const store = useModelStore.getState();
                const client = new EngineClient(enginePort);
                void client.updateEditorCamera(store.getCameraPosition(), store.cameraTarget);
              }
              break;
            }
          }
          break;
        case 'latency:response':
          // Echo back latency response (handled by LatencyTester component)
          break;
        case 'exportComplete':
          // Export GLB completed — no-op (extension shows save dialog)
          break;
        case 'keyframeTracks':
          useModelStore.getState().setKeyframeTracks(message.tracks);
          break;
        case 'keyframeAdded':
          // Acknowledge — request fresh tracks to stay in sync
          {
            const currentClip = useModelStore.getState().activeAnimation;
            if (currentClip) {
              postMessage({ type: 'requestKeyframeTracks', clipName: currentClip });
            }
          }
          break;
        case 'keyframeRemoved':
          // Acknowledge — request fresh tracks to stay in sync
          {
            const currentClip = useModelStore.getState().activeAnimation;
            if (currentClip) {
              postMessage({ type: 'requestKeyframeTracks', clipName: currentClip });
            }
          }
          break;
        case 'projectSaved':
          // Project saved — no-op (extension shows save dialog)
          break;
        case 'projectLoaded': {
          // Restore scene and editor state from .nkm project
          const { snapshot: projSnapshot, editorState } = message;
          applySceneSnapshot(projSnapshot);
          if (projSnapshot.animations) {
            const clipInfos: AnimationClipInfo[] = projSnapshot.animations.map((a) => ({
              name: a.name,
              duration: a.duration,
            }));
            setAnimationClips(clipInfos);
          }
          if (editorState && typeof editorState === 'object') {
            useModelStore.getState().restoreEditorState(editorState as Record<string, unknown>);
          }
          break;
        }
        case 'liveExpressions':
          useModelStore.getState().setFaceParams(message.expressions);
          break;
        case 'environmentPlacement':
          setEnvironmentPlacement(message.placement);
          break;
        default:
          break;
      }
    };

    window.addEventListener('message', handler);
    postMessage({ type: 'ready' });
    postMessage({ type: 'requestEnginePort' });

    return () => window.removeEventListener('message', handler);
  }, [
    applySceneDelta,
    applySceneSnapshot,
    selectNode,
    setAnimationClips,
    setModelUrl,
    setQualityPreview,
    setSceneControlStatus,
  ]);

  const handleAnimationsLoaded = useCallback(
    (clips: AnimationClip[]) => {
      const clipInfos: AnimationClipInfo[] = clips.map((clip) => ({
        name: clip.name,
        duration: clip.duration,
        channelCount: clip.tracks.length,
      }));
      setAnimationClips(clipInfos);
    },
    [setAnimationClips],
  );

  const handleVRMLoaded = useCallback(
    (vrm: VRM | null) => {
      setVRMLoaded(vrm !== null);
    },
    [setVRMLoaded],
  );

  const selectedNode = sceneNodes.find((n) => n.nodeId === selectedNodeId) ?? null;
  const selectedCharacterId = resolveSelectedCharacterId(selectedNodeId, sceneNodes);
  const selectedTopologyVersion = selectedCharacterId
    ? (characterTopologyVersions[selectedCharacterId] ?? 0)
    : 0;

  const sendRouteACommand = useCallback(
    async (envelope: SceneCommandEnvelope): Promise<boolean> => {
      const socket = sceneControlRef.current;
      if (!socket) {
        setSceneControlStatus('error', 'Scene control socket is not connected');
        return false;
      }

      try {
        const startedAt = performance.now();
        const ack = await socket.sendCommand(envelope);
        useModelStore.getState().recordAckLatency(performance.now() - startedAt);
        if (ack.status === 'superseded') {
          rollbackLocalPrediction(envelope.seq);
          return false;
        }
        if (ack.status !== 'applied') {
          rollbackLocalPrediction(envelope.seq);
          setSceneControlStatus('error', ack.error ?? `Scene command ${ack.status}`);
          socket.resync(useModelStore.getState().sceneId);
          return false;
        }
        latestRevisionRef.current = Math.max(latestRevisionRef.current, ack.revision);
        commitLocalPredictionsThrough(ack.appliedSeq || envelope.seq);
        setQualityPreview(null);
        return true;
      } catch (error) {
        rollbackLocalPrediction(envelope.seq);
        setSceneControlStatus('error', error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [
      commitLocalPredictionsThrough,
      rollbackLocalPrediction,
      setQualityPreview,
      setSceneControlStatus,
    ],
  );

  const handleTransformCommit = useCallback(
    async (nodeId: string, transform: EditableNodeTransform) => {
      const seq = useModelStore.getState().allocateSceneCommandSeq();
      addTransformPrediction({
        seq,
        nodeId,
        position: transform.position,
        rotation: transform.rotation,
        scale: transform.scale,
      });
      createLocalPrediction({
        kind: 'transform',
        seq,
        viewportId: 'main',
        sceneRevision: latestRevisionRef.current,
        nodeId,
        payload: {
          position: transform.position,
          rotation: transform.rotation,
          scale: transform.scale,
        },
      });
      const envelope: SceneCommandEnvelope = {
        seq,
        baseRevision: latestRevisionRef.current,
        coalesceKey: `transform:${nodeId}`,
        command: {
          type: 'transform',
          payloadJson: JSON.stringify({
            nodeId,
            position: transform.position,
            rotation: transform.rotation,
            scale: transform.scale,
          }),
        },
      };

      const applied = await sendRouteACommand(envelope);
      if (applied) {
        commitPredictionsThrough(seq);
      } else {
        rollbackTransformPrediction(seq);
      }
    },
    [
      addTransformPrediction,
      commitPredictionsThrough,
      createLocalPrediction,
      rollbackTransformPrediction,
      sendRouteACommand,
    ],
  );

  const sendCharacterCommand = useCallback(
    (
      command: NonNullable<NonNullable<SceneCommandEnvelope['command']>['characterCommand']>,
      coalesceKey?: string,
    ) => {
      const seq = useModelStore.getState().allocateSceneCommandSeq();
      createLocalPrediction({
        kind:
          command.type === 'morph-set'
            ? 'morph'
            : command.type === 'ik-handle-set' || command.type === 'bone-pose-set'
              ? 'ik'
              : 'selection',
        seq,
        viewportId: 'main',
        sceneRevision: latestRevisionRef.current,
        characterId: command.characterId,
        topologyVersion: command.topologyVersion,
        payload: { command },
      });
      void sendRouteACommand({
        seq,
        baseRevision: latestRevisionRef.current,
        coalesceKey,
        command: {
          type: 'character',
          payloadJson: '{}',
          topologyVersion: command.topologyVersion,
          characterCommand: command,
        },
      });
    },
    [createLocalPrediction, sendRouteACommand],
  );

  const handleSetMorph = useCallback(
    (morphId: string, weight: number) => {
      if (!selectedCharacterId) {
        setSceneControlStatus('error', 'No Engine character selected');
        return;
      }
      sendCharacterCommand(
        {
          type: 'morph-set',
          characterId: selectedCharacterId,
          topologyVersion: selectedTopologyVersion,
          morphSet: { morphId, weight },
        },
        `character:${selectedCharacterId}:morph:${morphId}`,
      );
    },
    [selectedCharacterId, selectedTopologyVersion, sendCharacterCommand, setSceneControlStatus],
  );

  const handleApplyExpression = useCallback(
    (expression: VRMExpressionPreset, weight: number) => {
      if (!selectedCharacterId) {
        setSceneControlStatus('error', 'No Engine character selected');
        return;
      }
      sendCharacterCommand(
        {
          type: 'expression-preset-apply',
          characterId: selectedCharacterId,
          topologyVersion: selectedTopologyVersion,
          expressionPreset: { presetId: expression, weight },
        },
        `character:${selectedCharacterId}:expression:${expression}`,
      );
    },
    [selectedCharacterId, selectedTopologyVersion, sendCharacterCommand, setSceneControlStatus],
  );

  const handleSetBonePose = useCallback(
    (boneId: string, rotation: [number, number, number, number]) => {
      if (!selectedCharacterId) {
        setSceneControlStatus('error', 'No Engine character selected');
        return;
      }
      sendCharacterCommand(
        {
          type: 'bone-pose-set',
          characterId: selectedCharacterId,
          topologyVersion: selectedTopologyVersion,
          bonePose: {
            boneId,
            transform: {
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] },
              scale: { x: 1, y: 1, z: 1 },
            },
            space: 'local',
          },
        },
        `character:${selectedCharacterId}:bone:${boneId}`,
      );
    },
    [selectedCharacterId, selectedTopologyVersion, sendCharacterCommand, setSceneControlStatus],
  );

  const sendSceneCommand = useCallback(
    (
      type: NonNullable<SceneCommandEnvelope['command']>['type'],
      payload: Record<string, unknown>,
    ) => {
      const seq = useModelStore.getState().allocateSceneCommandSeq();
      createLocalPrediction({
        kind: type.startsWith('modeling-') ? 'topology' : 'camera',
        seq,
        viewportId: 'main',
        sceneRevision: latestRevisionRef.current,
        nodeId: typeof payload['nodeId'] === 'string' ? payload['nodeId'] : undefined,
        topologyVersion: selectedTopologyVersion,
        payload,
      });
      void sendRouteACommand({
        seq,
        baseRevision: latestRevisionRef.current,
        command: {
          type,
          payloadJson: JSON.stringify(payload),
          topologyVersion: selectedTopologyVersion,
        },
      });
    },
    [createLocalPrediction, selectedTopologyVersion, sendRouteACommand],
  );

  const handleCreateShape = useCallback(
    (shapeType: ShapeType, params: Record<string, number>) => {
      sendSceneCommand('node-add', { kind: 'primitive', shapeType, params });
    },
    [sendSceneCommand],
  );

  const handleCreateText = useCallback(
    (text: string, fontSize: number, extrusionDepth: number) => {
      sendSceneCommand('node-add', { kind: 'text', text, fontSize, extrusionDepth });
    },
    [sendSceneCommand],
  );

  const handleExecuteCsg = useCallback(
    (operation: 'union' | 'difference' | 'intersection', operandA: string, operandB: string) => {
      sendSceneCommand('modeling-topology-op', { operation, operands: [operandA, operandB] });
    },
    [sendSceneCommand],
  );

  const handleSelectAnimation = useCallback(
    (clipName: string) => {
      setActiveAnimation(clipName);
      if (clipName) {
        sendSceneCommand('animation-play', { action: 'select', clipName });
      }
    },
    [sendSceneCommand, setActiveAnimation],
  );

  const handlePlayAnimation = useCallback(() => {
    if (!activeAnimation) return;
    sendSceneCommand('animation-play', { action: 'play', clipName: activeAnimation });
    play();
  }, [activeAnimation, play, sendSceneCommand]);

  const handlePauseAnimation = useCallback(() => {
    if (!activeAnimation) return;
    sendSceneCommand('animation-play', { action: 'pause', clipName: activeAnimation });
    pause();
  }, [activeAnimation, pause, sendSceneCommand]);

  const handleStopAnimation = useCallback(() => {
    sendSceneCommand('animation-play', { action: 'stop', clipName: activeAnimation });
    stop();
  }, [activeAnimation, sendSceneCommand, stop]);

  const handleCrossfadeAnimation = useCallback(
    (clipName: string, fadeDuration: number) => {
      sendSceneCommand('animation-play', {
        action: 'crossfade',
        clipName,
        fadeDuration,
        loop: true,
      });
    },
    [sendSceneCommand],
  );

  const handleSeekAnimation = useCallback(
    (clipName: string, timeMs: number) => {
      sendSceneCommand('animation-seek', { clipName, timeMs });
    },
    [sendSceneCommand],
  );

  const handleKeyframeMutation = useCallback(
    (operation: 'add' | 'remove' | 'update', payload: Record<string, unknown>) => {
      sendSceneCommand('animation-play', { action: `keyframe:${operation}`, ...payload });
    },
    [sendSceneCommand],
  );

  // Only treat the engine scene as render-ready when it actually has nodes.
  // A revision-only snapshot (revision>0, nodes=[]) is published for empty .nkm
  // documents and would otherwise spin up an H264 stream against an empty
  // RenderWorld, which trips wgpu validation in the PBR RenderGraph.
  const hasEngineScene = sceneNodes.length > 0;
  const routeAReady = enginePort !== null && sceneControlStatus === 'ready';
  const panelCommandDisabled = sceneControlStatus !== 'ready';

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar */}
        <Toolbar />

        {/* Scene Tree */}
        {sceneNodes.length > 0 && (
          <SceneTree nodes={sceneNodes} selectedNodeId={selectedNodeId} onSelectNode={selectNode} />
        )}

        {/* 3D Viewport (center) */}
        <div className="flex-1 relative">
          {qualityPreviewDataUrl ? (
            <div className="h-full w-full bg-black">
              <img
                src={qualityPreviewDataUrl}
                alt=""
                className="h-full w-full object-contain"
                draggable={false}
              />
            </div>
          ) : enginePort !== null && (modelUrl || hasEngineScene) ? (
            <VideoViewport
              enginePort={enginePort}
              sceneId={sceneId}
              sceneRevision={sceneRevision}
              selectedNodeId={selectedNodeId}
              hasPendingPrediction={hasPendingPrediction}
              sceneControlSocket={sceneControlSocket}
              overlay={viewportOverlay}
              predictions={localPredictions}
              topologyWarning={topologyWarning}
              onSelectNode={selectNode}
              onSceneControlError={(message) => setSceneControlStatus('error', message)}
            />
          ) : modelUrl ? (
            <R3FDevelopmentFallback
              url={modelUrl}
              onAnimationsLoaded={handleAnimationsLoaded}
              onVRMLoaded={handleVRMLoaded}
              activeAnimation={activeAnimation}
              isPlaying={playbackState === 'playing'}
            />
          ) : (
            // sceneRevision > 0 means engine has acknowledged the document but
            // the scene has no nodes yet — surface a precise hint instead of
            // falling back to the generic drop hint.
            <ModelEmptyState reason={sceneRevision > 0 ? 'emptyScene' : 'noDocument'} />
          )}

          {/* Animation Player (bottom overlay) */}
          <EngineDiagnosticsPanel />
          <AnimationPlayer
            clips={animationClips}
            activeClip={activeAnimation}
            playbackState={playbackState}
            onSelectClip={handleSelectAnimation}
            onCrossfade={handleCrossfadeAnimation}
            onPlay={handlePlayAnimation}
            onPause={handlePauseAnimation}
            onStop={handleStopAnimation}
            disabled={!routeAReady}
          />
        </div>

        {/* Right Sidebar: Panel routing by priority */}
        {isExpressionPresetOpen ? (
          <ExpressionPresetPanel
            onApplyExpression={handleApplyExpression}
            characterId={selectedCharacterId}
            disabled={panelCommandDisabled}
          />
        ) : isLatencyTesterOpen ? (
          <LatencyTester />
        ) : isFaceEditorOpen ? (
          <FaceEditorPanel
            characterId={selectedCharacterId}
            disabled={panelCommandDisabled}
            onSetMorph={handleSetMorph}
          />
        ) : isBoneExpressionOpen ? (
          <BoneExpressionPanel
            characterId={selectedCharacterId}
            disabled={panelCommandDisabled}
            onSetBonePose={handleSetBonePose}
          />
        ) : isShapeCreatorOpen ? (
          <ShapeCreatorPanel disabled={panelCommandDisabled} onCreateShape={handleCreateShape} />
        ) : isTextEditorOpen ? (
          <TextEditorPanel disabled={panelCommandDisabled} onCreateText={handleCreateText} />
        ) : isCsgPanelOpen ? (
          <CsgPanel disabled={panelCommandDisabled} onExecuteCsg={handleExecuteCsg} />
        ) : isSculptBrushOpen ? (
          <SculptBrushPanel
            disabled={panelCommandDisabled}
            enginePort={enginePort}
            selectedNodeId={selectedNodeId}
            selectedCharacterId={selectedCharacterId}
            topologyVersion={selectedTopologyVersion}
            sceneRevision={sceneRevision}
            nextSeq={() => useModelStore.getState().allocateSceneCommandSeq()}
            onBeginSession={(payload) => sendSceneCommand('modeling-begin-session', payload)}
            onCommitSession={(payload) => sendSceneCommand('modeling-end-session', payload)}
            onCancelSession={(payload) => sendSceneCommand('modeling-cancel-session', payload)}
            onCreatePrediction={(prediction) => {
              createLocalPrediction(prediction);
            }}
            onRecordPatchBytes={recordPatchBytes}
            onDropPrediction={rollbackLocalPrediction}
          />
        ) : (
          <TransformPanel
            node={selectedNode}
            transformMode={transformMode}
            onTransformModeChange={setTransformMode}
            onTransformCommit={handleTransformCommit}
            disabled={sceneControlStatus !== 'ready'}
          />
        )}
      </div>

      {/* Collapsible Keyframe Timeline (bottom panel) */}
      {isKeyframeEditorOpen && (
        <div className="h-48 overflow-hidden border-t border-[var(--model-border)]">
          <ModelKeyframeTimeline
            disabled={!routeAReady}
            onSeek={handleSeekAnimation}
            onKeyframeMutation={handleKeyframeMutation}
          />
        </div>
      )}
    </div>
  );
}

/** Empty state UI — import, template, or drag-drop */
function ModelEmptyState({ reason = 'noDocument' }: { reason?: 'noDocument' | 'emptyScene' }) {
  const { t } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleImport = useCallback(() => {
    postMessage({ type: 'model:import' });
  }, []);

  const handleTemplate = useCallback((templateId: string) => {
    postMessage({ type: 'model:template', templateId });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && /\.(glb|gltf|vrm)$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] ?? '';
        postMessage({ type: 'model:dropFile', name: file.name, data: base64 });
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const btnClass = 'model-btn-secondary px-4 py-2';
  const primaryBtnClass = 'model-btn-primary px-4 py-2';

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex h-full flex-col items-center justify-center gap-5 text-sm transition-colors ${
        isDragOver ? 'bg-[var(--model-selected)]' : 'bg-[var(--model-bg)]'
      }`}
    >
      <div className="max-w-sm text-center text-[var(--model-fg-secondary)]">
        {t(reason === 'emptyScene' ? 'empty.emptyScene' : 'empty.dropHint')}
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={handleImport} className={primaryBtnClass}>
          {t('empty.import')}
        </button>
        <button type="button" onClick={() => handleTemplate('blank')} className={btnClass}>
          {t('empty.templateBlank')}
        </button>
        <button type="button" onClick={() => handleTemplate('humanoid')} className={btnClass}>
          {t('empty.templateHumanoid')}
        </button>
      </div>
    </div>
  );
}

function resolveSelectedCharacterId(
  selectedNodeId: string | null,
  sceneNodes: readonly SceneNodeSnapshot[],
): string | null {
  if (!selectedNodeId) return null;
  const selected = sceneNodes.find((node) => node.nodeId === selectedNodeId);
  if (!selected) return selectedNodeId;
  return selected.kind === 'character' || selected.kind === 'character-instance'
    ? selected.nodeId
    : selectedNodeId;
}
