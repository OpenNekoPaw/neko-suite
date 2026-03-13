/** Scene node snapshot from the backend */
export interface SceneNodeSnapshot {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion xyzw
  scale: [number, number, number];
  parentId: string | null;
  hasMesh: boolean;
  hasLight: boolean;
  hasCamera: boolean;
  hasSkeleton: boolean;
}

/** Animation clip info */
export interface AnimationClipInfo {
  name: string;
  duration: number;
  channelCount: number;
}

/** Scene snapshot from the backend */
export interface SceneSnapshot {
  nodes: SceneNodeSnapshot[];
  animations: AnimationClipInfo[];
}

/** Transform update from animation tick */
export interface TransformUpdate {
  nodeId: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
}

/** Scene delta from backend tick */
export interface SceneDelta {
  updatedTransforms: TransformUpdate[];
}

/** Transform mode for gizmo */
export type TransformMode = 'translate' | 'rotate' | 'scale';

/** Playback state */
export type PlaybackState = 'playing' | 'paused' | 'stopped';

/** Messages from Extension Host to Webview */
export type ExtensionMessage =
  | { type: 'loadModel'; uri: string; filePath: string }
  | { type: 'enginePort'; port: number }
  | { type: 'keyboardAction'; action: string }
  | { type: 'sceneSnapshot'; snapshot: SceneSnapshot }
  | { type: 'sceneDelta'; delta: SceneDelta }
  | { type: 'latency:response'; timestamp: number };

/** Messages from Webview to Extension Host */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'requestEnginePort' }
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
  | { type: 'latency:test'; timestamp: number };
