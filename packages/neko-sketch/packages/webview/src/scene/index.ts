/**
 * Scene module - re-exports scene system components
 */
export { computeParallaxOffsets, buildParallaxTransform } from '../engine/parallax-renderer';
export type { ParallaxLayerView } from '../engine/parallax-renderer';
export { SCENE_TEMPLATES } from '../data/scene-templates';
export { computeOnionSkinGhosts } from '../utils/frame-manager';
export type { OnionSkinGhost } from '../types/frame';
