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

/** Camera device descriptor (for future P5.1.2) */
export interface CameraDevice {
  id: string;
  name: string;
  isDefault: boolean;
}
