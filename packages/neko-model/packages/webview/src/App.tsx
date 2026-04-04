import React, { useCallback, useEffect, useRef } from 'react';
import { Viewport3D } from './components/Viewport3D';
import { ModelLoader, type ModelLoaderHandle } from './components/ModelLoader';
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
import { ModelKeyframeTimeline } from './components/ModelKeyframeTimeline';
import { useModelStore } from './stores/modelStore';
import type { AnimationClipInfo, ExtensionMessage } from './types';
import type { AnimationClip } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { VRMExpressionPreset } from './types/vrmExpressions';
import { postMessage } from '@neko/shared/vscode';

/**
 * Root application component for the 3D Model Editor webview.
 * Uses Zustand store for all state management.
 */
export function App(): React.JSX.Element {
  const modelLoaderRef = useRef<ModelLoaderHandle>(null);
  const modelUrl = useModelStore((s) => s.modelUrl);
  const sceneNodes = useModelStore((s) => s.sceneNodes);
  const selectedNodeId = useModelStore((s) => s.selectedNodeId);
  const animationClips = useModelStore((s) => s.animationClips);
  const activeAnimation = useModelStore((s) => s.activeAnimation);
  const playbackState = useModelStore((s) => s.playbackState);
  const transformMode = useModelStore((s) => s.transformMode);
  const isFaceEditorOpen = useModelStore((s) => s.isFaceEditorOpen);
  const isLatencyTesterOpen = useModelStore((s) => s.isLatencyTesterOpen);
  const isExpressionPresetOpen = useModelStore((s) => s.isExpressionPresetOpen);
  const isVRMLoaded = useModelStore((s) => s.isVRMLoaded);
  const toggleFaceEditor = useModelStore((s) => s.toggleFaceEditor);
  const toggleLatencyTester = useModelStore((s) => s.toggleLatencyTester);
  const toggleExpressionPreset = useModelStore((s) => s.toggleExpressionPreset);
  const setVRMLoaded = useModelStore((s) => s.setVRMLoaded);
  const isBoneExpressionOpen = useModelStore((s) => s.isBoneExpressionOpen);
  const isCsgPanelOpen = useModelStore((s) => s.isCsgPanelOpen);
  const isTextEditorOpen = useModelStore((s) => s.isTextEditorOpen);
  const isShapeCreatorOpen = useModelStore((s) => s.isShapeCreatorOpen);
  const toggleBoneExpression = useModelStore((s) => s.toggleBoneExpression);
  const toggleCsgPanel = useModelStore((s) => s.toggleCsgPanel);
  const toggleTextEditor = useModelStore((s) => s.toggleTextEditor);
  const toggleShapeCreator = useModelStore((s) => s.toggleShapeCreator);
  const isKeyframeEditorOpen = useModelStore((s) => s.isKeyframeEditorOpen);
  const toggleKeyframeEditor = useModelStore((s) => s.toggleKeyframeEditor);

  const setModelUrl = useModelStore((s) => s.setModelUrl);
  const selectNode = useModelStore((s) => s.selectNode);
  const setAnimationClips = useModelStore((s) => s.setAnimationClips);
  const setActiveAnimation = useModelStore((s) => s.setActiveAnimation);
  const play = useModelStore((s) => s.play);
  const pause = useModelStore((s) => s.pause);
  const stop = useModelStore((s) => s.stop);
  const setTransformMode = useModelStore((s) => s.setTransformMode);

  // Listen for messages from extension host
  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;
      switch (message.type) {
        case 'loadModel':
          setModelUrl(message.uri);
          break;
        case 'sceneSnapshot': {
          // Backend scene snapshot — populate scene tree with ECS data
          const { snapshot } = message;
          if (snapshot.nodes) {
            useModelStore.getState().setSceneNodes(snapshot.nodes);
          }
          if (snapshot.animations) {
            const clipInfos: AnimationClipInfo[] = snapshot.animations.map(
              (a: AnimationClipInfo) => ({
                name: a.name,
                duration: a.duration,
                channelCount: a.channelCount,
              }),
            );
            setAnimationClips(clipInfos);
          }
          break;
        }
        case 'sceneDelta': {
          // Incremental transform updates from engine tick
          const { delta } = message;
          for (const update of delta.updatedTransforms) {
            useModelStore
              .getState()
              .updateNodeTransform(update.nodeId, update.position, update.rotation, update.scale);
          }
          break;
        }
        case 'keyboardAction':
          switch (message.action) {
            case 'escape':
              selectNode(null);
              break;
            case 'resetView':
              // TODO: reset camera to default position
              break;
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
          if (projSnapshot.nodes) {
            useModelStore.getState().setSceneNodes(projSnapshot.nodes);
          }
          if (projSnapshot.animations) {
            const clipInfos: AnimationClipInfo[] = projSnapshot.animations.map(
              (a: AnimationClipInfo) => ({
                name: a.name,
                duration: a.duration,
                channelCount: a.channelCount,
              }),
            );
            setAnimationClips(clipInfos);
          }
          if (editorState && typeof editorState === 'object') {
            useModelStore.getState().restoreEditorState(editorState as Record<string, unknown>);
          }
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('message', handler);
    postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handler);
  }, [setModelUrl, selectNode]);

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

  const handleApplyExpression = useCallback((expression: VRMExpressionPreset) => {
    modelLoaderRef.current?.applyVRMExpression(expression);
  }, []);

  const selectedNode = sceneNodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="h-8 bg-[var(--vscode-titleBar-activeBackground)] border-b border-[var(--vscode-panel-border)] flex items-center px-2 gap-2">
        <button
          onClick={toggleFaceEditor}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            isFaceEditorOpen
              ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
              : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]'
          }`}
        >
          面部编辑器
        </button>
        <button
          onClick={toggleLatencyTester}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            isLatencyTesterOpen
              ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
              : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]'
          }`}
        >
          延迟测试
        </button>
        <button
          onClick={toggleExpressionPreset}
          disabled={!isVRMLoaded}
          className={`px-2 py-1 text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isExpressionPresetOpen
              ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
              : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]'
          }`}
        >
          VRM 表情
        </button>
        <div className="w-px h-4 bg-[var(--vscode-panel-border)]" />
        <button
          onClick={toggleBoneExpression}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            isBoneExpressionOpen
              ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
              : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]'
          }`}
        >
          骨骼表情
        </button>
        <button
          onClick={toggleShapeCreator}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            isShapeCreatorOpen
              ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
              : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]'
          }`}
        >
          几何体
        </button>
        <button
          onClick={toggleTextEditor}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            isTextEditorOpen
              ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
              : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]'
          }`}
        >
          3D 文字
        </button>
        <button
          onClick={toggleCsgPanel}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            isCsgPanelOpen
              ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
              : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]'
          }`}
        >
          CSG
        </button>
        <button
          onClick={toggleKeyframeEditor}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            isKeyframeEditorOpen
              ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
              : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]'
          }`}
        >
          Keyframes
        </button>
        <div className="w-px h-4 bg-[var(--vscode-panel-border)]" />
        <button
          onClick={() => postMessage({ type: 'exportGlb' })}
          className="px-2 py-1 text-xs rounded transition-colors bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]"
        >
          导出 GLB
        </button>
        <button
          onClick={() => {
            const editorState = useModelStore.getState().getEditorState();
            postMessage({ type: 'saveProject', editorState });
          }}
          className="px-2 py-1 text-xs rounded transition-colors bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]"
        >
          保存项目
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Scene Tree (left sidebar) */}
        {sceneNodes.length > 0 && (
          <SceneTree nodes={sceneNodes} selectedNodeId={selectedNodeId} onSelectNode={selectNode} />
        )}

        {/* 3D Viewport (center) */}
        <div className="flex-1 relative">
          {modelUrl ? (
            <Viewport3D>
              <ModelLoader
                ref={modelLoaderRef}
                url={modelUrl}
                onAnimationsLoaded={handleAnimationsLoaded}
                onVRMLoaded={handleVRMLoaded}
                activeAnimation={activeAnimation}
                isPlaying={playbackState === 'playing'}
              />
            </Viewport3D>
          ) : (
            <div className="h-full flex items-center justify-center bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)] opacity-40">
              <p className="text-sm">Open a .gltf, .glb, or .vrm file to view</p>
            </div>
          )}

          {/* Animation Player (bottom overlay) */}
          <AnimationPlayer
            clips={animationClips}
            activeClip={activeAnimation}
            playbackState={playbackState}
            onSelectClip={setActiveAnimation}
            onPlay={play}
            onPause={pause}
            onStop={stop}
          />
        </div>

        {/* Right Sidebar: Panel routing by priority */}
        {isExpressionPresetOpen ? (
          <ExpressionPresetPanel
            onApplyExpression={handleApplyExpression}
            isVRMLoaded={isVRMLoaded}
          />
        ) : isLatencyTesterOpen ? (
          <LatencyTester />
        ) : isFaceEditorOpen ? (
          <FaceEditorPanel />
        ) : isBoneExpressionOpen ? (
          <BoneExpressionPanel />
        ) : isShapeCreatorOpen ? (
          <ShapeCreatorPanel />
        ) : isTextEditorOpen ? (
          <TextEditorPanel />
        ) : isCsgPanelOpen ? (
          <CsgPanel />
        ) : (
          <TransformPanel
            node={selectedNode}
            transformMode={transformMode}
            onTransformModeChange={setTransformMode}
          />
        )}
      </div>

      {/* Collapsible Keyframe Timeline (bottom panel) */}
      {isKeyframeEditorOpen && (
        <div className="h-48 border-t border-[var(--vscode-panel-border)] overflow-hidden">
          <ModelKeyframeTimeline />
        </div>
      )}
    </div>
  );
}
