/**
 * Sprite Sheet Export
 *
 * Packs animation frames into a single sprite sheet image with JSON metadata.
 * Compatible with Aseprite/TexturePacker format.
 */
import type { AnimFrame } from '../types/frame';

export interface SpritesheetMeta {
  readonly frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number };
      sourceSize: { w: number; h: number };
    }
  >;
  readonly meta: {
    size: { w: number; h: number };
    frameTags: { name: string; from: number; to: number; direction: string }[];
  };
}

export interface SpritesheetResult {
  readonly image: Blob;
  readonly meta: SpritesheetMeta;
}

export interface SpritesheetOptions {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly columns?: number;
  readonly padding?: number;
}

/**
 * Export animation frames as a sprite sheet.
 * Uses OffscreenCanvas to composite frames into a grid.
 */
export async function exportSpriteSheet(
  frames: readonly AnimFrame[],
  options: SpritesheetOptions,
): Promise<SpritesheetResult> {
  const { frameWidth, frameHeight, padding = 0 } = options;
  const count = frames.length;
  if (count === 0) throw new Error('No frames to export');

  const cols = options.columns ?? Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const sheetW = cols * (frameWidth + padding);
  const sheetH = rows * (frameHeight + padding);

  const canvas = new OffscreenCanvas(sheetW, sheetH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get OffscreenCanvas context');

  const metaFrames: SpritesheetMeta['frames'] = {};

  for (let i = 0; i < count; i++) {
    const frame = frames[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * (frameWidth + padding);
    const y = row * (frameHeight + padding);

    if (frame.imageData) {
      ctx.putImageData(frame.imageData, x, y);
    }

    metaFrames[`frame_${i}`] = {
      frame: { x, y, w: frameWidth, h: frameHeight },
      sourceSize: { w: frameWidth, h: frameHeight },
    };
  }

  const blob = await canvas.convertToBlob({ type: 'image/png' });

  const meta: SpritesheetMeta = {
    frames: metaFrames,
    meta: {
      size: { w: sheetW, h: sheetH },
      frameTags: [{ name: 'animation', from: 0, to: count - 1, direction: 'forward' }],
    },
  };

  return { image: blob, meta };
}
