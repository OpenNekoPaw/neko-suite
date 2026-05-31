import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getKeyboardBoundaryMetadata,
  isKeyboardFocusMessage,
  useFocusedWebviewRoot,
  useReportWebviewKeyboardEditable,
  useReportWebviewKeyboardFocus,
} from '@neko/ui/keyboard';
import { useTranslation } from './i18n/I18nContext';
import type {
  CharacterPreviewModeId,
  EnvironmentPatch,
  LightPatch,
  SelectionTarget,
  ViewportRenderMode,
} from '@neko/shared';
import { ModelSideToolbar } from './components/Toolbar';
import { VideoViewport } from './components/VideoViewport';
import { AnimationPlayer } from './components/AnimationPlayer';
import { SceneTree } from './components/SceneTree';
import { TransformPanel } from './components/panels/TransformPanel';
import { EnvironmentPanel } from './components/panels/EnvironmentPanel';
import { LightInspectorPanel } from './components/panels/LightInspectorPanel';
import { FaceEditorPanel } from './components/face';
import { LatencyTester } from './components/LatencyTester';
import { ExpressionPresetPanel } from './components/vrm';
import { BoneExpressionPanel } from './components/bone-expression';
import { CsgPanel } from './components/csg';
import { TextEditorPanel } from './components/text-editor';
import { ShapeCreatorPanel } from './components/shape-creator';
import { SculptBrushPanel } from './components/sculpt/SculptBrushPanel';
import { ModelKeyframeTimeline } from './components/ModelKeyframeTimeline';
import { CharacterPreviewModeSelector } from './components/CharacterPreviewModeSelector';
import { LookDevControls } from './components/LookDevControls';
import { SelectionModeControls } from './components/SelectionModeControls';
import { ViewportPerformanceOverlay } from './components/ViewportPerformanceOverlay';
import { useModelStore } from './stores/modelStore';
import type { ModelSelectionWorkflow } from './stores/modelStore';
import type {
  AnimationClipInfo,
  ExtensionMessage,
  SceneNodeSnapshot,
  SceneSnapshot,
  WebviewMessage,
} from './types';
import type { SceneCommandEnvelope } from '@neko/shared';
import type { VRMExpressionPreset } from './types/vrmExpressions';
import { postMessage } from '@neko/shared/vscode';
import { CreativeWorkbenchShell } from '@neko/ui/workbench';
import { usePersistedResize, useResizable } from '@neko/ui/hooks';
import { ResizeHandle } from '@neko/ui/primitives';
import {
  EngineClient,
  type ModelLookDevSceneControlCapabilities,
  type SceneControlSocket,
} from '@neko/neko-client';
import { ModelController } from './viewport/ModelController';
import type { EditableNodeTransform } from './scene/SceneEditingTypes';
import type { LocalPredictionInput } from './scene/LocalPredictionLayer';
import type { ShapeType } from './types/shapeParams';
import { modelErrorMessage, toError, webviewErrorHandler } from './platform/errors';
import { MODEL_RESIZE_PANELS } from './layout/modelResizeLayout';
import {
  useModelKeyboardController,
  type ModelKeyboardState,
} from './hooks/useModelKeyboardController';

const FALLBACK_MODEL_LOOKDEV_CAPABILITIES: ModelLookDevSceneControlCapabilities = {
  renderModes: ['pbr'],
  liveViewportSettings: false,
  clay: false,
  authoredLights: false,
  environment: false,
  typedPicking: false,
  characterRegions: false,
};

type SceneCommandType = NonNullable<SceneCommandEnvelope['command']>['type'];

/**
 * Root application component for the 3D Model Editor webview.
 * Uses Zustand store for all state management.
 */
export function App(): React.JSX.Element {
  const sceneControlRef = useRef<SceneControlSocket | null>(null);
  const sendSceneCommandRef = useRef<
    ((type: SceneCommandType, payload: Record<string, unknown>) => void) | null
  >(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const { isKeyboardFocused, isKeyboardFocusedRef, setKeyboardFocused } = useFocusedWebviewRoot(
    rootRef,
    false,
  );
  useReportWebviewKeyboardFocus(rootRef, { postMessage });
  useReportWebviewKeyboardEditable({ postMessage });
  const latestRevisionRef = useRef(0);
  const enginePortRef = useRef<number | null>(null);
  const initialWebviewVisible = document.visibilityState !== 'hidden';
  const webviewVisibleRef = useRef(initialWebviewVisible);
  const [enginePort, setEnginePort] = useState<number | null>(null);
  const [sceneControlSocket, setSceneControlSocket] = useState<SceneControlSocket | null>(null);
  const [webviewVisible, setWebviewVisible] = useState(initialWebviewVisible);
  const [isViewportHudVisible, setIsViewportHudVisible] = useState(true);
  const [isBottomPanelVisible, setIsBottomPanelVisible] = useState(true);
  const [isRightDockVisible, setIsRightDockVisible] = useState(false);
  const sceneId = useModelStore((s) => s.sceneId);
  const qualityPreviewDataUrl = useModelStore((s) => s.qualityPreviewDataUrl);
  const sceneNodes = useModelStore((s) => s.sceneNodes);
  const sceneRevision = useModelStore((s) => s.sceneRevision);
  const sceneControlStatus = useModelStore((s) => s.sceneControlStatus);
  const sceneControlError = useModelStore((s) => s.sceneControlError);
  const hasPendingPrediction = useModelStore((s) => s.pendingTransformPredictions.length > 0);
  const localPredictions = useModelStore((s) => s.localPredictions);
  const viewportOverlay = useModelStore((s) => s.viewportOverlay);
  const topologyWarning = useModelStore((s) => s.topologyWarning);
  const characterTopologyVersions = useModelStore((s) => s.characterTopologyVersions);
  const selectedNodeId = useModelStore((s) => s.selectedNodeId);
  const animationClips = useModelStore((s) => s.animationClips);
  const activeAnimation = useModelStore((s) => s.activeAnimation);
  const playbackState = useModelStore((s) => s.playbackState);
  const rootMotionEnabled = useModelStore((s) => s.rootMotionEnabled);
  const rootMotionNodeId = useModelStore((s) => s.rootMotionNodeId);
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
  const characterPreview = useModelStore((s) => s.characterPreview);
  const lookDev = useModelStore((s) => s.lookDev);
  const lookDevCapabilities = useModelStore((s) => s.lookDevCapabilities);
  const helperPassesEnabled = useModelStore((s) => s.showViewportGrid);
  const isPerformanceMetricsVisible = useModelStore((s) => s.isPerformanceMetricsVisible);
  const environmentState = useModelStore((s) => s.environmentState);
  const environmentDiagnostics = useModelStore((s) => s.environmentDiagnostics);
  const selectedTargets = useModelStore((s) => s.selectedTargets);
  const selectionWorkflow = useModelStore((s) => s.selectionWorkflow);
  const setSelectionWorkflow = useModelStore((s) => s.setSelectionWorkflow);

  const setQualityPreview = useModelStore((s) => s.setQualityPreview);
  const setEnvironmentPlacement = useModelStore((s) => s.setEnvironmentPlacement);
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
  const setRootMotion = useModelStore((s) => s.setRootMotion);
  const play = useModelStore((s) => s.play);
  const pause = useModelStore((s) => s.pause);
  const stop = useModelStore((s) => s.stop);
  const setTransformMode = useModelStore((s) => s.setTransformMode);

  useEffect(() => {
    latestRevisionRef.current = sceneRevision;
  }, [sceneRevision]);

  useEffect(() => {
    enginePortRef.current = enginePort;
  }, [enginePort]);

  useEffect(
    () => () => {
      sceneControlRef.current?.close(1000, 'model editor disposed');
      sceneControlRef.current = null;
      setSceneControlSocket(null);
    },
    [],
  );

  const sendEditorCameraToEngine = useCallback(() => {
    const store = useModelStore.getState();
    const position = store.getCameraPosition();
    const target = store.cameraTarget;
    const socket = sceneControlRef.current;
    const handleCameraError = (error: unknown) => {
      void webviewErrorHandler.handleError(toError(error), {
        showToUser: false,
        severity: 'error',
      });
      setSceneControlStatus('error', modelErrorMessage('error.cameraUpdateFailed'));
    };

    if (!socket?.isOpen()) {
      return;
    }

    void socket
      .updateViewportCamera({
        sceneId: store.sceneId,
        sceneRevision: store.sceneRevision,
        viewportId: 'main',
        position,
        target,
      })
      .then(() => {
        socket.requestKeyframe('main');
      })
      .catch(handleCameraError);
  }, [setSceneControlStatus]);

  const handleViewportCameraMutated = useCallback(() => {
    setQualityPreview(null);
  }, [setQualityPreview]);

  const toggleViewportHud = useCallback(() => {
    setIsViewportHudVisible((visible) => !visible);
  }, []);

  const toggleBottomPanel = useCallback(() => {
    setIsBottomPanelVisible((visible) => !visible);
  }, []);

  const toggleRightDock = useCallback(() => {
    setIsRightDockVisible((visible) => !visible);
  }, []);

  const closeSceneControlSocket = useCallback(
    (reason: string) => {
      sceneControlRef.current?.close(1000, reason);
      sceneControlRef.current = null;
      setSceneControlSocket(null);
      setSceneControlStatus('disconnected');
    },
    [setSceneControlStatus],
  );

  const sendSceneCommandFromStore = useCallback(
    (type: SceneCommandType, payload: Record<string, unknown>) => {
      const sender = sendSceneCommandRef.current;
      if (!sender) {
        setSceneControlStatus('error', modelErrorMessage('error.sceneControlDisconnected'));
        return;
      }
      sender(type, payload);
    },
    [setSceneControlStatus],
  );

  const applyWebviewVisibility = useCallback(
    (visible: boolean) => {
      webviewVisibleRef.current = visible;
      setWebviewVisible(visible);
      if (!visible) {
        closeSceneControlSocket('webview hidden');
      }
    },
    [closeSceneControlSocket],
  );

  const applyEngineSceneSnapshot = useCallback(
    (snapshot: SceneSnapshot, options?: { restoreCamera?: boolean }) => {
      const store = useModelStore.getState();
      store.applySceneSnapshot(snapshot);
      const framed = options?.restoreCamera === true ? false : store.frameSceneCamera(snapshot);
      if (options?.restoreCamera === true) {
        store.markSceneCameraFramed(snapshot);
      }
      if (framed) {
        sendEditorCameraToEngine();
      }
    },
    [sendEditorCameraToEngine],
  );

  const resetViewportCamera = useCallback(() => {
    useModelStore.getState().resetCamera();
    sendEditorCameraToEngine();
  }, [sendEditorCameraToEngine]);

  const handleKeyboardAction = useCallback(
    (action: string) => {
      if (!isKeyboardFocusedRef.current) {
        return;
      }
      switch (action) {
        case 'escape':
          selectNode(null);
          break;
        case 'resetView':
          resetViewportCamera();
          break;
        default:
          break;
      }
    },
    [isKeyboardFocusedRef, resetViewportCamera, selectNode],
  );

  // Listen for messages from extension host
  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;
      const focusMessage = isKeyboardFocusMessage(message) ? message : null;
      if (focusMessage) {
        setKeyboardFocused(focusMessage.focused);
        return;
      }

      switch (message.type) {
        case 'enginePort': {
          if (enginePortRef.current === message.port && sceneControlRef.current) {
            setEnginePort(message.port);
            sendEditorCameraToEngine();
            break;
          }

          enginePortRef.current = message.port;
          setEnginePort(message.port);
          sceneControlRef.current?.close(1000, 'reconnecting scene control');
          setSceneControlSocket(null);
          setSceneControlStatus('connecting');
          const client = new EngineClient(message.port);
          void client
            .getModelLookDevSceneControlCapabilities()
            .then((capabilities) => {
              useModelStore.getState().setLookDevCapabilities(capabilities);
            })
            .catch((error: unknown) => {
              useModelStore.getState().setLookDevCapabilities(FALLBACK_MODEL_LOOKDEV_CAPABILITIES);
              void webviewErrorHandler.handleError(toError(error), {
                showToUser: false,
                severity: 'warning',
              });
            });
          const socket = client.openSceneControlSocket({
            sceneId: useModelStore.getState().sceneId,
            onReady: (ready) => {
              setSceneControlStatus('ready');
              sendEditorCameraToEngine();
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
              applyEngineSceneSnapshot(snapshot);
            },
            onDelta: (delta) => {
              latestRevisionRef.current = delta.revision;
              setSceneControlStatus('ready');
              useModelStore.getState().applySceneDelta(delta);
            },
            onAck: (ack) => {
              if (ack.status === 'rejected') {
                setSceneControlStatus(
                  'error',
                  ack.error ?? modelErrorMessage('error.sceneCommandRejected'),
                );
                sceneControlRef.current?.resync(useModelStore.getState().sceneId);
                return;
              }
              latestRevisionRef.current = Math.max(latestRevisionRef.current, ack.revision);
            },
            onCharacterPreviewState: (state) => {
              useModelStore.getState().applyCharacterPreviewState(state);
            },
            onError: (error) => {
              if (!webviewVisibleRef.current) {
                return;
              }
              void webviewErrorHandler.handleError(error, {
                showToUser: false,
                severity: 'error',
              });
              setSceneControlStatus('error', error.message);
            },
          });
          sceneControlRef.current = socket;
          setSceneControlSocket(socket);
          break;
        }
        case 'webviewVisibility': {
          applyWebviewVisibility(message.visible);
          if (message.visible) {
            const currentEnginePort = enginePortRef.current;
            if (currentEnginePort === null || sceneControlRef.current === null) {
              postMessage({ type: 'requestEnginePort' });
            } else {
              sendEditorCameraToEngine();
            }
          }
          break;
        }
        case 'sceneSnapshot': {
          // Backend scene snapshot — populate scene tree with ECS data
          const { snapshot } = message;
          applyEngineSceneSnapshot(snapshot);
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
          handleKeyboardAction(message.action);
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
          applyEngineSceneSnapshot(projSnapshot, {
            restoreCamera: hasRestorableCameraState(editorState),
          });
          if (projSnapshot.animations) {
            const clipInfos: AnimationClipInfo[] = projSnapshot.animations.map((a) => ({
              name: a.name,
              duration: a.duration,
            }));
            setAnimationClips(clipInfos);
          }
          if (editorState && typeof editorState === 'object') {
            useModelStore.getState().restoreEditorState(editorState as Record<string, unknown>);
            sendEditorCameraToEngine();
          }
          break;
        }
        case 'liveExpressions':
          useModelStore.getState().setFaceParams(message.expressions);
          break;
        case 'environmentPlacement':
          setEnvironmentPlacement(message.placement);
          if (message.placement.sourceAssetId) {
            sendSceneCommandFromStore('environment-set', {
              environmentId: 'scene-environment',
              source: {
                id: message.placement.sourceAssetId,
                uri: message.placement.sourceUri,
                kind: 'asset-handle',
              },
              mode: message.placement.mode,
              rotationDeg: message.placement.rotationDeg,
              intensity: message.placement.intensity,
              exposure: message.placement.exposure,
              visibleAsBackground: message.placement.visibleAsBackground,
            });
          }
          break;
        case 'environmentCommand':
          setEnvironmentPlacement(message.legacyPlacement ?? null);
          sendSceneCommandFromStore(
            'environment-set',
            message.patch as unknown as Record<string, unknown>,
          );
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
    applyEngineSceneSnapshot,
    applySceneDelta,
    applyWebviewVisibility,
    handleKeyboardAction,
    sendEditorCameraToEngine,
    sendSceneCommandFromStore,
    setAnimationClips,
    setEnvironmentPlacement,
    setQualityPreview,
    setSceneControlStatus,
  ]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState !== 'hidden';
      applyWebviewVisibility(visible);
      if (!visible) return;

      const currentEnginePort = enginePortRef.current;
      if (currentEnginePort === null || sceneControlRef.current === null) {
        postMessage({ type: 'requestEnginePort' });
      } else {
        sendEditorCameraToEngine();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    window.addEventListener('pageshow', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('pageshow', handleVisibilityChange);
    };
  }, [applyWebviewVisibility, sendEditorCameraToEngine]);

  const selectedNode = sceneNodes.find((n) => n.nodeId === selectedNodeId) ?? null;
  const selectedNodeName = selectedNode?.name ?? null;
  useEffect(() => {
    postMessage({
      type: 'modelStatus',
      selectedNodeName,
      objectCount: sceneNodes.length,
      sceneControlStatus,
      sceneControlError,
      hasPendingPrediction,
      enginePort,
      sceneRevision,
    } satisfies WebviewMessage);
  }, [
    enginePort,
    hasPendingPrediction,
    sceneControlError,
    sceneControlStatus,
    sceneRevision,
    sceneNodes.length,
    selectedNodeName,
  ]);

  const characterPreviewTarget = resolveCharacterPreviewTarget(selectedNodeId, sceneNodes);
  const selectedCharacterId = characterPreviewTarget.characterId;
  const selectedTopologyVersion = selectedCharacterId
    ? (characterTopologyVersions[selectedCharacterId] ?? 0)
    : 0;
  const sendRouteACommand = useCallback(
    async (envelope: SceneCommandEnvelope): Promise<boolean> => {
      const socket = sceneControlRef.current;
      if (!socket) {
        setSceneControlStatus('error', modelErrorMessage('error.sceneControlDisconnected'));
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
          setSceneControlStatus(
            'error',
            ack.error ?? modelErrorMessage('error.sceneCommandStatus', { status: ack.status }),
          );
          socket.resync(useModelStore.getState().sceneId);
          return false;
        }
        latestRevisionRef.current = Math.max(latestRevisionRef.current, ack.revision);
        commitLocalPredictionsThrough(ack.appliedSeq || envelope.seq);
        setQualityPreview(null);
        return true;
      } catch (error) {
        rollbackLocalPrediction(envelope.seq);
        void webviewErrorHandler.handleError(toError(error), {
          showToUser: false,
          severity: 'error',
        });
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
      if (sceneControlRef.current === null) {
        setSceneControlStatus('error', modelErrorMessage('error.sceneControlDisconnected'));
        return;
      }
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
      const applied = await sendRouteACommand({
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
      });
      if (applied) {
        commitPredictionsThrough(seq);
        setQualityPreview(null);
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
      setQualityPreview,
      setSceneControlStatus,
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
        setSceneControlStatus('error', modelErrorMessage('error.noEngineCharacterSelected'));
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
        setSceneControlStatus('error', modelErrorMessage('error.noEngineCharacterSelected'));
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
        setSceneControlStatus('error', modelErrorMessage('error.noEngineCharacterSelected'));
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
        kind: sceneCommandPredictionKind(type),
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

  useEffect(() => {
    sendSceneCommandRef.current = sendSceneCommand;
    return () => {
      if (sendSceneCommandRef.current === sendSceneCommand) {
        sendSceneCommandRef.current = null;
      }
    };
  }, [sendSceneCommand]);

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

  const handleSetNodeVisible = useCallback(
    (nodeId: string, visible: boolean) => {
      sendSceneCommand('visibility-set', { nodeId, visible });
    },
    [sendSceneCommand],
  );

  const handleAddLight = useCallback(
    (kind: LightPatch['kind']) => {
      const id = `light_${kind}_${Date.now().toString(36)}`;
      sendSceneCommand('node-add', {
        kind: 'light',
        nodeId: id,
        name: `${kind[0]?.toUpperCase() ?? 'L'}${kind.slice(1)} Light`,
        transform: {
          position: { x: 0, y: 2, z: 2 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        light: {
          nodeId: id,
          kind,
          color: { x: 1, y: 1, z: 1 },
          intensity: kind === 'directional' ? 2 : 4,
          range: kind === 'directional' ? undefined : 12,
          ...(kind === 'spot' ? { innerConeAngle: 0.2, outerConeAngle: 0.75 } : {}),
          shadow: { enabled: false },
        },
      });
    },
    [sendSceneCommand],
  );

  const handleDeleteLight = useCallback(
    (nodeId: string) => {
      sendSceneCommand('node-remove', { nodeId, cascade: false });
    },
    [sendSceneCommand],
  );

  const handleLightUpdate = useCallback(
    (nodeId: string, patch: Omit<LightPatch, 'nodeId'>) => {
      sendSceneCommand('light-update', { nodeId, ...patch });
    },
    [sendSceneCommand],
  );

  const handleEnvironmentSet = useCallback(
    (patch: Omit<EnvironmentPatch, 'environmentId'>) => {
      sendSceneCommand('environment-set', { environmentId: 'scene-environment', ...patch });
    },
    [sendSceneCommand],
  );

  const handleEnvironmentUpdate = useCallback(
    (patch: Omit<EnvironmentPatch, 'environmentId'>) => {
      sendSceneCommand('environment-update', { environmentId: 'scene-environment', ...patch });
    },
    [sendSceneCommand],
  );

  const handleEnvironmentClear = useCallback(() => {
    sendSceneCommand('environment-clear', { environmentId: 'scene-environment' });
  }, [sendSceneCommand]);

  const handleEnvironmentRetry = useCallback(() => {
    const environment = useModelStore.getState().environmentState;
    if (environment) {
      sendSceneCommand('environment-set', environment as unknown as Record<string, unknown>);
    }
  }, [sendSceneCommand]);

  const handleEnvironmentPickPanorama = useCallback(() => {
    postMessage({ type: 'environment:pickPanorama' } satisfies WebviewMessage);
  }, []);

  const animationPlaybackPayload = useCallback(
    (action: string, clipName: string | null) => ({
      action,
      clipName,
      rootMotionEnabled,
      rootNodeId: rootMotionNodeId,
    }),
    [rootMotionEnabled, rootMotionNodeId],
  );

  const handleSelectAnimation = useCallback(
    (clipName: string) => {
      setActiveAnimation(clipName);
      if (clipName) {
        sendSceneCommand(
          'animation-play',
          animationPlaybackPayload(playbackState === 'playing' ? 'play' : 'select', clipName),
        );
        postMessage({ type: 'requestKeyframeTracks', clipName });
      }
    },
    [animationPlaybackPayload, playbackState, sendSceneCommand, setActiveAnimation],
  );

  const handlePlayAnimation = useCallback(() => {
    if (!activeAnimation) return;
    sendSceneCommand('animation-play', animationPlaybackPayload('play', activeAnimation));
    play();
  }, [activeAnimation, animationPlaybackPayload, play, sendSceneCommand]);

  const handlePauseAnimation = useCallback(() => {
    if (!activeAnimation) return;
    sendSceneCommand('animation-play', animationPlaybackPayload('pause', activeAnimation));
    pause();
  }, [activeAnimation, animationPlaybackPayload, pause, sendSceneCommand]);

  const handleStopAnimation = useCallback(() => {
    sendSceneCommand('animation-play', animationPlaybackPayload('stop', activeAnimation));
    stop();
  }, [activeAnimation, animationPlaybackPayload, sendSceneCommand, stop]);

  const handleCharacterPreviewModeChange = useCallback(
    (modeId: CharacterPreviewModeId) => {
      if (!selectedCharacterId) {
        setSceneControlStatus('error', modelErrorMessage('error.noEngineCharacterSelected'));
        return;
      }
      const socket = sceneControlRef.current;
      if (!socket || enginePort === null) {
        useModelStore.getState().applyCharacterPreviewState({
          characterId: selectedCharacterId,
          modeId,
          viewportId: 'main',
          status: 'unavailable',
          sceneRevision: latestRevisionRef.current,
          cameraPreset: previewCameraPreset(modeId),
          renderPreset: previewRenderPreset(modeId),
          playback: { state: 'unavailable' },
          diagnostics: [
            {
              code: 'scene-control-unavailable',
              severity: 'error',
              message: modelErrorMessage('error.sceneControlDisconnected'),
              retryable: true,
            },
          ],
          hasCameraOverride: false,
        });
        setSceneControlStatus('error', modelErrorMessage('error.sceneControlDisconnected'));
        return;
      }
      const controller = new ModelController({
        enginePort,
        sceneId,
        viewportId: 'main',
        sceneRevision: latestRevisionRef.current,
        sceneControlSocket: socket,
        onError: (message) => setSceneControlStatus('error', message),
      });
      void controller.setCharacterPreviewMode(selectedCharacterId, modeId).catch((error) => {
        void webviewErrorHandler.handleError(toError(error), {
          showToUser: false,
          severity: 'warning',
        });
      });
    },
    [enginePort, sceneId, selectedCharacterId, setSceneControlStatus],
  );

  const handleLookDevModeChange = useCallback((mode: ViewportRenderMode) => {
    useModelStore.getState().requestLookDevMode(mode);
  }, []);

  const handleSelectionWorkflowChange = useCallback(
    (workflow: ModelSelectionWorkflow) => {
      setSelectionWorkflow(workflow);
    },
    [setSelectionWorkflow],
  );

  const handleCharacterPreviewCameraReset = useCallback(() => {
    const modeId = characterPreview.requestedMode ?? characterPreview.appliedMode;
    if (!selectedCharacterId || !modeId || !sceneControlRef.current || enginePort === null) return;
    const controller = new ModelController({
      enginePort,
      sceneId,
      viewportId: 'main',
      sceneRevision: latestRevisionRef.current,
      sceneControlSocket: sceneControlRef.current,
      onError: (message) => setSceneControlStatus('error', message),
    });
    void controller.resetCharacterPreviewCamera(selectedCharacterId, modeId).catch((error) => {
      void webviewErrorHandler.handleError(toError(error), {
        showToUser: false,
        severity: 'warning',
      });
    });
  }, [
    characterPreview.appliedMode,
    characterPreview.requestedMode,
    enginePort,
    sceneId,
    selectedCharacterId,
    setSceneControlStatus,
  ]);

  const handleCharacterPreviewPlaybackControl = useCallback(
    (action: 'play' | 'pause' | 'stop') => {
      const modeId = characterPreview.appliedMode;
      if (!selectedCharacterId || !modeId || !sceneControlRef.current || enginePort === null)
        return;
      const controller = new ModelController({
        enginePort,
        sceneId,
        viewportId: 'main',
        sceneRevision: latestRevisionRef.current,
        sceneControlSocket: sceneControlRef.current,
        onError: (message) => setSceneControlStatus('error', message),
      });
      void controller
        .controlCharacterPreviewPlayback(selectedCharacterId, modeId, action)
        .catch((error) => {
          void webviewErrorHandler.handleError(toError(error), {
            showToUser: false,
            severity: 'warning',
          });
        });
    },
    [characterPreview.appliedMode, enginePort, sceneId, selectedCharacterId, setSceneControlStatus],
  );

  const handleCrossfadeAnimation = useCallback(
    (clipName: string, fadeDuration: number) => {
      setActiveAnimation(clipName, 'playing');
      sendSceneCommand('animation-play', {
        ...animationPlaybackPayload('crossfade', clipName),
        fadeDuration,
        loop: true,
      });
      postMessage({ type: 'requestKeyframeTracks', clipName });
    },
    [animationPlaybackPayload, sendSceneCommand, setActiveAnimation],
  );

  const handleSeekAnimation = useCallback(
    (clipName: string, timeMs: number) => {
      sendSceneCommand('animation-seek', {
        clipName,
        timeMs,
        rootMotionEnabled,
        rootNodeId: rootMotionNodeId,
      });
    },
    [sendSceneCommand, rootMotionEnabled, rootMotionNodeId],
  );

  const handleRootMotionChange = useCallback(
    (enabled: boolean, rootNodeId: string | null) => {
      setRootMotion(enabled, rootNodeId);
      if (activeAnimation) {
        sendSceneCommand('animation-play', {
          action: playbackState === 'playing' ? 'play' : 'select',
          clipName: activeAnimation,
          rootMotionEnabled: enabled,
          rootNodeId,
        });
      }
    },
    [activeAnimation, playbackState, sendSceneCommand, setRootMotion],
  );

  const handleKeyframeMutation = useCallback(
    (operation: 'add' | 'remove' | 'update', payload: Record<string, unknown>) => {
      switch (operation) {
        case 'add':
          postMessage({
            type: 'addKeyframe',
            clipName: String(payload['clipName'] ?? ''),
            nodeId: String(payload['nodeId'] ?? ''),
            property: String(payload['property'] ?? ''),
            timestamp: Number(payload['timestamp'] ?? 0),
            values: Array.isArray(payload['values']) ? payload['values'].map(Number) : [],
          } satisfies WebviewMessage);
          break;
        case 'remove':
          postMessage({
            type: 'removeKeyframe',
            clipName: String(payload['clipName'] ?? ''),
            keyframeId: String(payload['keyframeId'] ?? ''),
          } satisfies WebviewMessage);
          break;
        case 'update':
          postMessage({
            type: 'updateKeyframe',
            clipName: String(payload['clipName'] ?? ''),
            keyframeId: String(payload['keyframeId'] ?? ''),
            timestamp: typeof payload['timestamp'] === 'number' ? payload['timestamp'] : undefined,
            values: Array.isArray(payload['values']) ? payload['values'].map(Number) : undefined,
            easing: typeof payload['easing'] === 'string' ? payload['easing'] : undefined,
          } satisfies WebviewMessage);
          break;
      }
    },
    [],
  );

  const shouldRenderEngineViewport = enginePort !== null;
  const routeAReady = enginePort !== null && sceneControlStatus === 'ready';
  const panelCommandDisabled = sceneControlStatus !== 'ready';
  const isCharacterPreviewDisabled = !routeAReady || !selectedCharacterId;
  const characterPreviewStatusLabel = characterPreviewStatusText({
    routeAReady,
    status: characterPreview.status,
    target: characterPreviewTarget,
    t,
  });
  const modelKeyboardState = useMemo<ModelKeyboardState>(
    () => ({
      hasSelection: selectedNodeId !== null,
      isKeyboardFocused,
    }),
    [isKeyboardFocused, selectedNodeId],
  );

  useModelKeyboardController({
    state: modelKeyboardState,
    onClearSelection: () => handleKeyboardAction('escape'),
    onResetView: () => handleKeyboardAction('resetView'),
  });

  const selectedTarget = selectedTargets[0] ?? null;
  const inspectorRoute = resolveInspectorRoute(selectedNode, selectedTarget, environmentState);
  const propertiesPanel = isExpressionPresetOpen ? (
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
      sceneNodes={sceneNodes}
      selectedNodeId={selectedNodeId}
      disabled={panelCommandDisabled}
      onSetBonePose={handleSetBonePose}
      onSetJointTransform={handleTransformCommit}
      onSelectJoint={selectNode}
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
  ) : inspectorRoute.kind === 'light' ? (
    <LightInspectorPanel
      node={selectedNode}
      disabled={panelCommandDisabled || !lookDevCapabilities.authoredLights}
      onAddLight={handleAddLight}
      onDeleteLight={handleDeleteLight}
      onSetVisible={handleSetNodeVisible}
      onLightUpdate={handleLightUpdate}
    />
  ) : inspectorRoute.kind === 'environment' ? (
    <EnvironmentPanel
      environment={environmentState}
      diagnostics={environmentDiagnostics}
      disabled={panelCommandDisabled || !lookDevCapabilities.environment}
      onSet={handleEnvironmentSet}
      onUpdate={handleEnvironmentUpdate}
      onClear={handleEnvironmentClear}
      onRetry={handleEnvironmentRetry}
      onPickPanorama={handleEnvironmentPickPanorama}
    />
  ) : inspectorRoute.kind === 'target' ? (
    <SelectionTargetInspector target={inspectorRoute.target} />
  ) : (
    <TransformPanel
      node={selectedNode}
      transformMode={transformMode}
      onTransformModeChange={setTransformMode}
      onTransformCommit={handleTransformCommit}
      disabled={sceneControlStatus !== 'ready'}
    />
  );

  return (
    <div
      ref={rootRef}
      className="model-keyboard-root h-screen w-screen overflow-hidden"
      data-neko-keyboard-focused={isKeyboardFocused ? 'true' : 'false'}
      {...getKeyboardBoundaryMetadata({
        scope: 'editor',
        ownerId: 'model-editor',
      })}
    >
      <CreativeWorkbenchShell
        className="model-workbench h-screen w-screen overflow-hidden"
        bodyClassName="model-workbench-body"
        mainClassName="model-center-panel"
        mainKind="viewport-timeline"
        leftRail={
          <ModelSideToolbar
            className="model-left-toolbar"
            width={48}
            isViewportHudVisible={isViewportHudVisible}
            onToggleViewportHud={toggleViewportHud}
            isBottomPanelVisible={isBottomPanelVisible}
            onToggleBottomPanel={toggleBottomPanel}
            isRightDockVisible={isRightDockVisible}
            onToggleRightDock={toggleRightDock}
            onCameraChange={sendEditorCameraToEngine}
            onCameraMutated={handleViewportCameraMutated}
          />
        }
        main={
          <>
            <section className="model-viewport-area">
              <div
                className="model-viewport-shell"
                {...getKeyboardBoundaryMetadata({
                  scope: 'viewport',
                  ownerId: 'model-viewport',
                })}
              >
                {enginePort !== null ? (
                  <VideoViewport
                    enginePort={enginePort}
                    sceneId={sceneId}
                    sceneRevision={sceneRevision}
                    selectedNodeId={selectedNodeId}
                    hasPendingPrediction={hasPendingPrediction}
                    sceneControlSocket={sceneControlSocket}
                    visible={webviewVisible}
                    overlay={viewportOverlay}
                    predictions={localPredictions}
                    topologyWarning={topologyWarning}
                    hudVisible={isViewportHudVisible}
                    onSelectNode={selectNode}
                    onSceneControlError={(message) => setSceneControlStatus('error', message)}
                    onCameraMutated={handleViewportCameraMutated}
                  />
                ) : null}
                {qualityPreviewDataUrl && shouldRenderEngineViewport ? (
                  <div className="model-quality-preview-overlay pointer-events-none absolute inset-0">
                    <img
                      src={qualityPreviewDataUrl}
                      alt=""
                      className="h-full w-full object-contain opacity-95"
                      draggable={false}
                    />
                  </div>
                ) : null}
                {isViewportHudVisible ? (
                  <div id="model-viewport-hud">
                    <LookDevControls
                      state={lookDev}
                      capabilities={lookDevCapabilities}
                      routeAReady={routeAReady}
                      helperPassesEnabled={helperPassesEnabled}
                      onModeChange={handleLookDevModeChange}
                    />
                    <SelectionModeControls
                      workflow={selectionWorkflow}
                      typedPickingAvailable={lookDevCapabilities.typedPicking}
                      characterRegionsAvailable={lookDevCapabilities.characterRegions}
                      onWorkflowChange={handleSelectionWorkflowChange}
                    />
                    <CharacterPreviewModeSelector
                      state={characterPreview}
                      disabled={isCharacterPreviewDisabled}
                      statusLabel={characterPreviewStatusLabel}
                      onModeChange={handleCharacterPreviewModeChange}
                      onResetCamera={handleCharacterPreviewCameraReset}
                      onPlaybackControl={handleCharacterPreviewPlaybackControl}
                    />
                  </div>
                ) : null}
                {isPerformanceMetricsVisible ? <ViewportPerformanceOverlay /> : null}
              </div>
            </section>
            {isBottomPanelVisible ? (
              <TimelineDock
                key={isKeyframeEditorOpen ? 'expanded' : 'compact'}
                expanded={isKeyframeEditorOpen}
              >
                <div id="model-timeline-controls" className="model-timeline-controls">
                  {isKeyframeEditorOpen ? (
                    <ModelKeyframeTimeline
                      disabled={!routeAReady}
                      onSeek={handleSeekAnimation}
                      onKeyframeMutation={handleKeyframeMutation}
                    />
                  ) : (
                    <AnimationTimelineStrip clipCount={animationClips.length}>
                      <AnimationPlayer
                        clips={animationClips}
                        nodes={sceneNodes}
                        activeClip={activeAnimation}
                        playbackState={playbackState}
                        rootMotionEnabled={rootMotionEnabled}
                        rootMotionNodeId={rootMotionNodeId}
                        onRootMotionChange={handleRootMotionChange}
                        onSelectClip={handleSelectAnimation}
                        onCrossfade={handleCrossfadeAnimation}
                        onPlay={handlePlayAnimation}
                        onPause={handlePauseAnimation}
                        onStop={handleStopAnimation}
                        disabled={!routeAReady}
                      />
                    </AnimationTimelineStrip>
                  )}
                </div>
              </TimelineDock>
            ) : null}
          </>
        }
        rightPanel={
          isRightDockVisible ? (
            <RightDock
              outliner={
                <SceneTree
                  nodes={sceneNodes}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={selectNode}
                  onSetNodeVisible={handleSetNodeVisible}
                  visibilityDisabled={panelCommandDisabled}
                  showHeader={false}
                />
              }
              properties={propertiesPanel}
            />
          ) : undefined
        }
      />
    </div>
  );
}

interface RightDockProps {
  outliner: React.ReactNode;
  properties: React.ReactNode;
}

function RightDock({ outliner, properties }: RightDockProps): React.JSX.Element {
  const { t } = useTranslation();
  const dockSpec = MODEL_RESIZE_PANELS.rightDock;
  const outlinerSpec = MODEL_RESIZE_PANELS.outlinerSplit;
  const dockResize = usePersistedResize(dockSpec.panelId, dockSpec.defaultSize, {
    minSize: dockSpec.minSize,
    maxSize: dockSpec.maxSize,
  });
  const outlinerResize = usePersistedResize(outlinerSpec.panelId, outlinerSpec.defaultSize, {
    minSize: outlinerSpec.minSize,
    maxSize: outlinerSpec.maxSize,
  });
  const {
    containerRef: dockResizeRef,
    handleProps: dockHandleProps,
    isResizing: isDockResizing,
  } = useResizable<HTMLElement>({
    edge: 'right',
    mode: 'pixel',
    size: dockResize.size,
    minSize: dockSpec.minSize,
    maxSize: dockSpec.maxSize,
    onSizeChange: dockResize.setSize,
  });
  const {
    containerRef: splitResizeRef,
    handleProps: splitHandleProps,
    isResizing: isSplitResizing,
  } = useResizable<HTMLDivElement>({
    edge: 'top',
    mode: 'pixel',
    size: outlinerResize.size,
    minSize: outlinerSpec.minSize,
    maxSize: outlinerSpec.maxSize,
    onSizeChange: outlinerResize.setSize,
    calculateSize: (event, containerRect) => event.clientY - containerRect.top,
  });

  return (
    <aside
      id="model-right-dock"
      ref={dockResizeRef}
      className="model-right-dock"
      {...getKeyboardBoundaryMetadata({
        scope: 'property-panel',
        ownerId: 'model-right-dock',
        ownedKeys: [
          'Enter',
          'Escape',
          'Space',
          'Tab',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
        ],
      })}
      style={{ width: dockResize.size }}
      data-resizing={isDockResizing ? 'true' : 'false'}
    >
      <ResizeHandle
        handleProps={dockHandleProps}
        className="model-resize-handle model-right-dock-resize-handle"
      />
      <div ref={splitResizeRef} className="model-right-dock-stack">
        <section
          className="model-dock-pane model-outliner-pane"
          style={{ height: outlinerResize.size }}
          data-resizing={isSplitResizing ? 'true' : 'false'}
        >
          <div className="model-dock-title">{t('workbench.outliner')}</div>
          <div className="model-dock-content">{outliner}</div>
        </section>
        <ResizeHandle
          handleProps={splitHandleProps}
          className="model-resize-handle model-outliner-resize-handle"
        />
        <section className="model-dock-pane model-properties-pane">
          <div className="model-dock-title">{t('workbench.properties')}</div>
          <div className="model-dock-content">{properties}</div>
        </section>
      </div>
    </aside>
  );
}

function TimelineDock({
  expanded,
  children,
}: {
  expanded: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const timelineSpec = expanded
    ? MODEL_RESIZE_PANELS.timelineExpanded
    : MODEL_RESIZE_PANELS.timelineCompact;
  const timelineResize = usePersistedResize(timelineSpec.panelId, timelineSpec.defaultSize, {
    minSize: timelineSpec.minSize,
    maxSize: timelineSpec.maxSize,
  });
  const { containerRef, handleProps, isResizing } = useResizable<HTMLElement>({
    edge: 'bottom',
    mode: 'pixel',
    size: timelineResize.size,
    minSize: timelineSpec.minSize,
    maxSize: timelineSpec.maxSize,
    onSizeChange: timelineResize.setSize,
  });

  return (
    <footer
      id="model-timeline-dock"
      aria-controls="model-timeline-controls"
      aria-expanded={true}
      ref={containerRef}
      className={expanded ? 'model-timeline-dock expanded' : 'model-timeline-dock'}
      {...getKeyboardBoundaryMetadata({
        scope: 'timeline',
        ownerId: 'model-timeline',
        ownedKeys: [
          'Delete',
          'Backspace',
          'Enter',
          'Escape',
          'Space',
          'Tab',
          'ArrowLeft',
          'ArrowRight',
        ],
      })}
      style={{ height: timelineResize.size }}
      data-resizing={isResizing ? 'true' : 'false'}
    >
      <ResizeHandle
        handleProps={handleProps}
        className="model-resize-handle model-timeline-resize-handle"
      />
      {children}
    </footer>
  );
}

function AnimationTimelineStrip({
  clipCount,
  children,
}: {
  clipCount: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="model-animation-strip">
      <div className="model-frame-ruler" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <span key={index}>{index * 30}</span>
        ))}
      </div>
      <div className="model-animation-controls">
        {clipCount > 0 ? (
          children
        ) : (
          <span className="text-[var(--model-fg-muted)]">{t('animation.noClips')}</span>
        )}
      </div>
    </div>
  );
}

function previewCameraPreset(modeId: CharacterPreviewModeId) {
  switch (modeId) {
    case 'face':
      return 'face-closeup' as const;
    case 'full-body':
      return 'full-body' as const;
    case 'motion':
      return 'motion-review' as const;
    case 'voice-pack':
      return 'voice-performance' as const;
  }
}

function previewRenderPreset(modeId: CharacterPreviewModeId) {
  switch (modeId) {
    case 'face':
      return 'face-detail' as const;
    case 'full-body':
      return 'body-silhouette' as const;
    case 'motion':
      return 'motion-diagnostics' as const;
    case 'voice-pack':
      return 'voice-lipsync' as const;
  }
}

interface CharacterPreviewTarget {
  readonly characterId: string | null;
  readonly reason:
    | 'selected-character'
    | 'single-character'
    | 'single-preview-node'
    | 'selected-node'
    | 'no-scene-node';
}

function resolveCharacterPreviewTarget(
  selectedNodeId: string | null,
  sceneNodes: readonly SceneNodeSnapshot[],
): CharacterPreviewTarget {
  if (selectedNodeId) {
    const selected = sceneNodes.find((node) => node.nodeId === selectedNodeId);
    if (selected && isCharacterSceneNode(selected)) {
      return { characterId: selected.nodeId, reason: 'selected-character' };
    }
    if (!selected) {
      return { characterId: selectedNodeId, reason: 'selected-node' };
    }
  }

  const characterNodes = sceneNodes.filter(isCharacterSceneNode);
  if (characterNodes.length === 1) {
    return { characterId: characterNodes[0]?.nodeId ?? null, reason: 'single-character' };
  }

  const previewNodes = sceneNodes.filter(isPreviewableSceneNode);
  if (previewNodes.length === 1) {
    return { characterId: previewNodes[0]?.nodeId ?? null, reason: 'single-preview-node' };
  }

  return {
    characterId: selectedNodeId && sceneNodes.length > 0 ? selectedNodeId : null,
    reason: selectedNodeId ? 'selected-node' : 'no-scene-node',
  };
}

function isCharacterSceneNode(node: SceneNodeSnapshot): boolean {
  return node.kind === 'character' || node.kind === 'character-instance';
}

function isPreviewableSceneNode(node: SceneNodeSnapshot): boolean {
  return isCharacterSceneNode(node) || node.kind === 'mesh' || node.mesh !== undefined;
}

type InspectorRoute =
  | { readonly kind: 'transform' }
  | { readonly kind: 'light' }
  | { readonly kind: 'environment' }
  | { readonly kind: 'target'; readonly target: SelectionTarget };

function resolveInspectorRoute(
  selectedNode: SceneNodeSnapshot | null,
  selectedTarget: SelectionTarget | null,
  environment: EnvironmentPatch | null,
): InspectorRoute {
  if (selectedTarget?.kind === 'environment') {
    return { kind: 'environment' };
  }
  if (selectedNode?.kind === 'light' || selectedNode?.light) {
    return { kind: 'light' };
  }
  if (selectedTarget && selectedTarget.kind !== 'node') {
    return { kind: 'target', target: selectedTarget };
  }
  if (!selectedNode && environment) {
    return { kind: 'environment' };
  }
  return { kind: 'transform' };
}

function SelectionTargetInspector({ target }: { target: SelectionTarget }): React.JSX.Element {
  const entries = [
    ['Kind', target.kind],
    ['Node', target.nodeId],
    ['Character', target.characterId],
    ['Bone', target.boneId],
    ['Material slot', target.materialSlotId],
    ['Submesh', target.submeshId],
    ['Primitive', target.primitiveId],
    ['Region', target.regionId],
    ['Morph', target.morphId],
    ['Environment', target.environmentId],
  ].filter((entry): entry is [string, string] => typeof entry[1] === 'string');

  return (
    <div className="model-side-panel model-selection-target-panel h-full w-full overflow-y-auto text-xs">
      <div className="model-panel-header">
        <div className="model-title">Selection</div>
        <div className="mt-1 text-[10px] text-[var(--model-fg-secondary)]">
          Engine typed picking target
        </div>
      </div>
      <div className="model-panel-section">
        {entries.map(([label, value]) => (
          <div key={label} className="model-target-readout">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function characterPreviewStatusText({
  routeAReady,
  status,
  target,
  t,
}: {
  readonly routeAReady: boolean;
  readonly status: string;
  readonly target: CharacterPreviewTarget;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}): string | undefined {
  if (!routeAReady) return t('characterPreview.status.waitingForEngine');
  if (!target.characterId) return t('characterPreview.status.selectCharacter');
  if (status === 'unavailable' && target.reason !== 'selected-character') {
    return t('characterPreview.status.ready');
  }
  return undefined;
}

function sceneCommandPredictionKind(
  type: NonNullable<SceneCommandEnvelope['command']>['type'],
): LocalPredictionInput['kind'] {
  if (type.startsWith('modeling-')) {
    return 'topology';
  }
  if (type === 'visibility-set') {
    return 'visibility';
  }
  return 'camera';
}

function hasRestorableCameraState(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['cameraTheta'] === 'number' &&
    typeof record['cameraPhi'] === 'number' &&
    typeof record['cameraRadius'] === 'number' &&
    (Array.isArray(record['cameraTarget']) ||
      (typeof record['cameraTarget'] === 'object' && record['cameraTarget'] !== null))
  );
}
