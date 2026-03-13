/**
 * Parallax Renderer
 *
 * Renders scene layers with parallax scrolling based on camera position.
 * Each layer's position is offset by its parallaxFactor relative to the camera.
 */
import type { SceneLayer, CameraConfig } from '../types/scene';

export interface ParallaxLayerView {
  readonly layerId: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly zIndex: number;
  readonly visible: boolean;
}

/**
 * Compute the display offset for each visible scene layer given camera position.
 * Returns layers sorted by zIndex (bottom to top).
 */
export function computeParallaxOffsets(
  layers: readonly SceneLayer[],
  camera: CameraConfig,
): ParallaxLayerView[] {
  return layers
    .filter((l) => l.visible)
    .map((l) => ({
      layerId: l.id,
      offsetX: -camera.x * l.parallaxFactor[0],
      offsetY: -camera.y * l.parallaxFactor[1],
      zIndex: l.zIndex,
      visible: true,
    }))
    .sort((a, b) => a.zIndex - b.zIndex);
}

/**
 * Build a 3x3 column-major transform matrix for a parallax layer.
 * Combines camera zoom with layer-specific parallax offset.
 */
export function buildParallaxTransform(
  view: ParallaxLayerView,
  camera: CameraConfig,
  canvasWidth: number,
  canvasHeight: number,
): Float32Array {
  const sx = camera.zoom;
  const sy = camera.zoom;
  const tx = (view.offsetX / canvasWidth) * 2;
  const ty = (view.offsetY / canvasHeight) * 2;

  return new Float32Array([sx, 0, 0, 0, sy, 0, tx, ty, 1]);
}
