/**
 * Frame Manager - CRUD operations for frame-by-frame animation
 *
 * Pure functions that operate on FrameLayer/AnimFrame data.
 * All state mutations go through the Zustand store.
 */

import type { AnimFrame, FrameLayer, OnionSkinConfig, OnionSkinGhost } from '../types/frame';

let nextFrameId = 1;

/** Generate a unique frame ID */
function generateFrameId(): string {
  return `frame-${Date.now()}-${nextFrameId++}`;
}

let nextLayerId = 1;

/** Generate a unique frame layer ID */
function generateFrameLayerId(): string {
  return `flayer-${Date.now()}-${nextLayerId++}`;
}

/** Create a new empty frame */
export function createFrame(layerId: string, index: number): AnimFrame {
  return {
    id: generateFrameId(),
    layerId,
    index,
    duration: 1,
    isKeyframe: true,
    imageData: null,
  };
}

/** Duplicate a frame with new ID */
export function duplicateFrame(frame: AnimFrame, newIndex: number): AnimFrame {
  return {
    ...frame,
    id: generateFrameId(),
    index: newIndex,
    // Deep-copy imageData if present
    imageData: frame.imageData
      ? new ImageData(
          new Uint8ClampedArray(frame.imageData.data),
          frame.imageData.width,
          frame.imageData.height,
        )
      : null,
  };
}

/** Create a new frame layer */
export function createFrameLayer(name: string): FrameLayer {
  const id = generateFrameLayerId();
  return {
    id,
    name,
    frames: [createFrame(id, 0)],
    visible: true,
    locked: false,
  };
}

/** Insert a frame at the given index, shifting subsequent frames */
export function insertFrame(layer: FrameLayer, index: number): FrameLayer {
  const newFrame = createFrame(layer.id, index);
  const frames = [...layer.frames];

  // Shift indices of frames at or after the insertion point
  const shifted = frames.map((f) => (f.index >= index ? { ...f, index: f.index + 1 } : f));
  shifted.push(newFrame);
  shifted.sort((a, b) => a.index - b.index);

  return { ...layer, frames: shifted };
}

/** Remove a frame by ID */
export function removeFrame(layer: FrameLayer, frameId: string): FrameLayer {
  const frames = layer.frames.filter((f) => f.id !== frameId);
  // Re-index remaining frames
  const reindexed = frames.map((f, i) => ({ ...f, index: i }));
  return { ...layer, frames: reindexed };
}

/** Compute onion skin ghost frames for rendering */
export function getOnionSkinGhosts(
  layers: FrameLayer[],
  currentLayerId: string,
  currentIndex: number,
  config: OnionSkinConfig,
): OnionSkinGhost[] {
  if (!config.enabled) return [];

  const layer = layers.find((l) => l.id === currentLayerId);
  if (!layer) return [];

  const ghosts: OnionSkinGhost[] = [];
  const prevTint: readonly [number, number, number] = [0.2, 0.8, 0.2]; // green
  const nextTint: readonly [number, number, number] = [0.8, 0.2, 0.2]; // red

  // Previous frames (closest first → decreasing opacity)
  for (let i = 1; i <= config.prevCount; i++) {
    const frame = layer.frames.find((f) => f.index === currentIndex - i);
    if (frame?.imageData) {
      const opacity = config.prevOpacity * (1 - (i - 1) / config.prevCount);
      ghosts.push({ frame, opacity, tint: prevTint });
    }
  }

  // Next frames
  for (let i = 1; i <= config.nextCount; i++) {
    const frame = layer.frames.find((f) => f.index === currentIndex + i);
    if (frame?.imageData) {
      const opacity = config.nextOpacity * (1 - (i - 1) / config.nextCount);
      ghosts.push({ frame, opacity, tint: nextTint });
    }
  }

  return ghosts;
}

/** Get total frame count across a layer (accounting for frame durations) */
export function getTotalFrameCount(layer: FrameLayer): number {
  return layer.frames.reduce((sum, f) => sum + f.duration, 0);
}
