/** Unified tracking data from any source (VMC, MediaPipe, etc.) */
export interface TrackingData {
  /** Which tracking provider produced this data */
  source: TrackingMode;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** ARKit-compatible blend shape coefficients (0-1) */
  blendShapes: Record<string, number>;
  /** Head rotation as quaternion [x, y, z, w] */
  headRotation?: readonly [number, number, number, number];
  /** Head position [x, y, z] in meters */
  headPosition?: readonly [number, number, number];
  /** Named bone transforms (VMC Humanoid bone names) */
  boneTransforms?: Record<string, BoneTransform>;
}

export interface BoneTransform {
  /** Quaternion [x, y, z, w] */
  rotation: readonly [number, number, number, number];
  /** Position [x, y, z] in meters (optional, not all providers send position) */
  position?: readonly [number, number, number];
}

export type TrackingMode = 'mediapipe' | 'vmc' | 'hybrid';

/** Avatar model type — determines renderer */
export type AvatarType = 'vrm' | 'puppet';

/** Camera device descriptor (for future P5.1.2) */
export interface CameraDevice {
  id: string;
  name: string;
  isDefault: boolean;
}

export type LiveDeviceRole = 'camera' | 'audio-input' | 'midi-input' | 'gamepad';

export interface LiveDeviceBinding {
  role: LiveDeviceRole;
  deviceId: string;
  deviceType: LiveDeviceRole;
  label: string;
  sessionId?: string;
  compositorSourceRef?: {
    sourceId: string;
    kind: 'camera';
    label?: string;
    deviceSessionRef?: string;
    metadata?: Record<string, unknown>;
  };
}

/** Puppet mesh data for 2D rendering */
export interface PuppetMesh {
  node_id: string;
  vertices: [number, number][];
  blend_mode: string;
  opacity: number;
  z_order: number;
  texture_index?: number;
}

/** Puppet delta (frame update from engine stream) */
export interface PuppetDelta {
  deformed_meshes: PuppetMesh[];
  animation_time_ms?: number;
  animation_playing?: boolean;
}

/** Puppet parameter info */
export interface PuppetParameter {
  name: string;
  min: number;
  max: number;
  default: number;
  current: number;
}

/** Recording state */
export type RecordingState = 'idle' | 'recording' | 'stopping';
