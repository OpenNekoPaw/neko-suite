import type { SceneCapturePreview } from '@neko/neko-client';
import type {
  EditorKeyframeTrack,
  EnvironmentPlacement,
  SceneDelta,
  SceneSnapshot,
} from '@neko/shared';
import type { VRMExpressionPreset } from './vrmExpressions';

export type { SceneDelta, SceneSnapshot };
export type SceneNodeSnapshot = SceneSnapshot['nodes'][number];
export type AnimationClipInfo = SceneSnapshot['animations'][number];
export type SceneControlStatusView = 'disconnected' | 'connecting' | 'ready' | 'error';

/** Transform mode for gizmo */
export type TransformMode = 'translate' | 'rotate' | 'scale';

/** Playback state */
export type PlaybackState = 'playing' | 'paused' | 'stopped';

/** Messages from Extension Host to Webview */
export type ExtensionMessage =
  | { type: 'enginePort'; port: number }
  | { type: 'webviewVisibility'; visible: boolean }
  | { type: 'keyboardFocus'; focused: boolean }
  | { type: 'keyboardAction'; action: string }
  | { type: 'sceneSnapshot'; snapshot: SceneSnapshot }
  | { type: 'sceneDelta'; delta: SceneDelta }
  | { type: 'sceneCapturePreview'; preview: SceneCapturePreview }
  | { type: 'latency:response'; timestamp: number }
  | { type: 'exportComplete'; success: boolean; filePath?: string; error?: string }
  | { type: 'projectSaved'; success: boolean; filePath?: string; error?: string }
  | { type: 'projectLoaded'; snapshot: SceneSnapshot; editorState: unknown }
  | { type: 'liveExpressions'; expressions: Partial<Record<VRMExpressionPreset, number>> }
  | { type: 'environmentPlacement'; placement: EnvironmentPlacement }
  | { type: 'keyframeTracks'; tracks: EditorKeyframeTrack[] }
  | { type: 'keyframeAdded'; trackProperty: string; keyframeId: string }
  | { type: 'keyframeRemoved'; trackProperty: string; keyframeId: string };

/** Messages from Webview to Extension Host */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'requestEnginePort' }
  | {
      type: 'modelStatus';
      selectedNodeName: string | null;
      objectCount: number;
      sceneControlStatus: SceneControlStatusView;
      sceneControlError?: string | null;
      hasPendingPrediction: boolean;
      enginePort: number | null;
      sceneRevision: number;
    }
  | {
      type: 'updateTransform';
      nodeId: string;
      position: [number, number, number];
      rotation: [number, number, number, number];
      scale: [number, number, number];
    }
  | { type: 'playAnimation'; clipName: string }
  | { type: 'pauseAnimation' }
  | { type: 'stopAnimation' }
  | { type: 'latency:test'; timestamp: number }
  | { type: 'scene:capturePreview'; width?: number; height?: number; quality?: number }
  | { type: 'createShape'; shapeType: string; params: Record<string, number> }
  | { type: 'model:import' }
  | { type: 'model:template'; templateId: string }
  | { type: 'model:dropFile'; name: string; data: string }
  | { type: 'createTextMesh'; text: string; fontSize: number; extrusionDepth: number }
  | {
      type: 'csgBoolean';
      entityA: string;
      entityB: string;
      operation: 'union' | 'difference' | 'intersection';
    }
  | {
      type: 'updateBoneTransform';
      nodeId: string;
      rotation: [number, number, number, number];
    }
  | { type: 'exportGlb' }
  | { type: 'saveProject'; editorState: unknown }
  | {
      type: 'addKeyframe';
      clipName: string;
      nodeId: string;
      property: string;
      timestamp: number;
      values: number[];
    }
  | { type: 'removeKeyframe'; clipName: string; keyframeId: string }
  | {
      type: 'updateKeyframe';
      clipName: string;
      keyframeId: string;
      timestamp?: number;
      values?: number[];
      easing?: string;
    }
  | { type: 'createClip'; name: string; duration: number }
  | { type: 'requestKeyframeTracks'; clipName: string }
  | { type: 'crossfadeAnimation'; clipName: string; fadeDuration: number; loop?: boolean };
