/**
 * Atmosphere preset to particle emitter config mapping
 *
 * Maps atmosphere presets to particle emitter configurations
 * for rendering weather and ambient effects.
 */
import type { ParticleEmitterConfig, ParticleBlendMode } from '../types/particle';
import type { AtmospherePreset, AtmosphereConfig } from '../types/scene';

interface AtmosphereParticleTemplate {
  readonly rate: number;
  readonly lifetime: readonly [number, number];
  readonly speed: readonly [number, number];
  readonly direction: number;
  readonly spread: number;
  readonly gravity: readonly [number, number];
  readonly size: readonly [number, number];
  readonly opacity: readonly [number, number];
  readonly blendMode: ParticleBlendMode;
}

const PRESET_TEMPLATES: Record<Exclude<AtmospherePreset, 'none'>, AtmosphereParticleTemplate> = {
  fog: {
    rate: 5,
    lifetime: [4, 8],
    speed: [10, 30],
    direction: 0,
    spread: Math.PI * 2,
    gravity: [0, 0],
    size: [40, 80],
    opacity: [0.0, 0.15],
    blendMode: 'normal',
  },
  rain: {
    rate: 200,
    lifetime: [0.5, 1.0],
    speed: [400, 600],
    direction: Math.PI / 2 + 0.15,
    spread: 0.1,
    gravity: [0, 200],
    size: [1, 2],
    opacity: [0.6, 0.2],
    blendMode: 'normal',
  },
  snow: {
    rate: 40,
    lifetime: [3, 6],
    speed: [20, 50],
    direction: Math.PI / 2,
    spread: 0.8,
    gravity: [0, 15],
    size: [3, 6],
    opacity: [0.8, 0.3],
    blendMode: 'normal',
  },
  fireflies: {
    rate: 8,
    lifetime: [2, 5],
    speed: [5, 20],
    direction: -Math.PI / 2,
    spread: Math.PI * 2,
    gravity: [0, -5],
    size: [2, 4],
    opacity: [0.0, 0.9],
    blendMode: 'additive',
  },
  dust: {
    rate: 15,
    lifetime: [3, 7],
    speed: [5, 15],
    direction: 0,
    spread: Math.PI * 2,
    gravity: [0, 3],
    size: [1, 3],
    opacity: [0.3, 0.1],
    blendMode: 'normal',
  },
};

let atmosphereIdCounter = 0;

/**
 * Convert an atmosphere config to a particle emitter config.
 * Returns null for 'none' preset.
 */
export function atmosphereToEmitter(config: AtmosphereConfig): ParticleEmitterConfig | null {
  if (config.preset === 'none') return null;

  const template = PRESET_TEMPLATES[config.preset];
  const id = `atmosphere-${++atmosphereIdCounter}`;

  return {
    id,
    name: `Atmosphere: ${config.preset}`,
    shape: 'rect',
    rate: template.rate * config.intensity,
    lifetime: template.lifetime,
    speed: template.speed,
    direction: template.direction,
    spread: template.spread,
    gravity: [template.gravity[0] + config.wind[0], template.gravity[1] + config.wind[1]],
    size: template.size,
    opacity: [template.opacity[0] * config.intensity, template.opacity[1] * config.intensity],
    color: config.color,
    colorEnd: [config.color[0], config.color[1], config.color[2], 0],
    blendMode: template.blendMode,
    texture: null,
  };
}
