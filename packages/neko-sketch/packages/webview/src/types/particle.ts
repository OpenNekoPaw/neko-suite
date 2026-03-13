/**
 * Particle system types
 *
 * Defines emitter configurations and particle state for 2D particle effects.
 */

// ─── Emitter Configuration ───

export type EmitterShape = 'point' | 'line' | 'circle' | 'rect';
export type ParticleBlendMode = 'normal' | 'additive' | 'multiply';

export interface ParticleEmitterConfig {
  readonly id: string;
  readonly name: string;
  readonly shape: EmitterShape;
  readonly rate: number;
  readonly lifetime: readonly [number, number];
  readonly speed: readonly [number, number];
  readonly direction: number;
  readonly spread: number;
  readonly gravity: readonly [number, number];
  readonly size: readonly [number, number];
  readonly opacity: readonly [number, number];
  readonly color: readonly [number, number, number, number];
  readonly colorEnd: readonly [number, number, number, number];
  readonly blendMode: ParticleBlendMode;
  readonly texture: string | null;
}

// ─── Runtime Particle State ───

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  sizeEnd: number;
  opacity: number;
  opacityEnd: number;
  r: number;
  g: number;
  b: number;
  a: number;
  rEnd: number;
  gEnd: number;
  bEnd: number;
  aEnd: number;
  rotation: number;
  active: boolean;
}

// ─── Default Emitter Config ───

export const DEFAULT_EMITTER: ParticleEmitterConfig = {
  id: '',
  name: 'Emitter',
  shape: 'point',
  rate: 50,
  lifetime: [1.0, 2.0],
  speed: [50, 100],
  direction: -Math.PI / 2,
  spread: Math.PI / 6,
  gravity: [0, 98],
  size: [8, 2],
  opacity: [1.0, 0.0],
  color: [1, 1, 1, 1],
  colorEnd: [1, 1, 1, 0],
  blendMode: 'additive',
  texture: null,
};
