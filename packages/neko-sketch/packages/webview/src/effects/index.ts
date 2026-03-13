/**
 * Effects module - re-exports particle and filter systems
 */
export { ParticleSimulation } from '../engine/particle-simulation';
export { ParticleRenderer } from '../engine/particle-renderer';
export { FilterPipeline } from '../engine/filter-pipeline';
export { FilterRegistry } from '../engine/filter-registry';
export { atmosphereToEmitter } from '../data/atmosphere-presets';
export { exportSpriteSheet } from '../utils/spritesheet-export';
export type {
  SpritesheetResult,
  SpritesheetOptions,
  SpritesheetMeta,
} from '../utils/spritesheet-export';
