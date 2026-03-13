/**
 * Type definitions for 2D puppet animation data.
 *
 * These mirror the Rust PuppetSnapshot/PuppetDelta types
 * from native-puppet, serialized as JSON over the HTTP API.
 */

export interface PuppetSnapshot {
  nodes: PuppetNodeSnapshot[];
  parameters: ParameterInfo[];
  meshes: MeshSnapshot[];
}

export interface PuppetNodeSnapshot {
  id: string;
  name: string;
  node_type: string;
  position: [number, number];
  rotation: number;
  scale: [number, number];
  z_order: number;
  opacity: number;
  parent_id: string | null;
  has_mesh: boolean;
}

export interface ParameterInfo {
  name: string;
  min: number;
  max: number;
  default: number;
  current: number;
}

export interface MeshSnapshot {
  node_id: string;
  vertices: [number, number][];
  uvs: [number, number][];
  indices: number[];
  texture_index: number | null;
}

export interface PuppetDelta {
  deformed_meshes: DeformedMesh[];
  /** Current animation elapsed time in ms (undefined if no animation active) */
  animation_time_ms?: number;
  /** Whether the animation is currently playing (undefined if no animation active) */
  animation_playing?: boolean;
}

export interface DeformedMesh {
  node_id: string;
  vertices: [number, number][];
  blend_mode: string;
  opacity: number;
  z_order: number;
}

/** Frontend-facing description of a named animation clip */
export interface AnimationClipInfo {
  name: string;
  duration_ms: number;
  loop_default: boolean;
}
