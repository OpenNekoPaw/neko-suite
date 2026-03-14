/**
 * Sprite Sheet Import
 *
 * Loads a sprite sheet image (PNG) and optional Aseprite/TexturePacker JSON
 * metadata, slicing it into individual frame ImageData objects.
 *
 * Without JSON: frames are sliced from a uniform grid using cols × rows.
 * With JSON: frame positions are read from the `frames` map in the metadata.
 */
import type { SpritesheetMeta } from './spritesheet-export';

export interface ImportedFrame {
  readonly index: number;
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly imageData: ImageData;
}

export interface SpriteSheetImportOptions {
  /** Number of columns in a uniform grid (used when no JSON is provided). */
  readonly cols?: number;
  /** Number of rows in a uniform grid (used when no JSON is provided). */
  readonly rows?: number;
}

/**
 * Load an image file as an HTMLImageElement (resolves on load, rejects on error).
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/**
 * Read a JSON metadata file as text and parse it.
 */
function readJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result as string));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Import a sprite sheet image with optional JSON metadata.
 *
 * @param imageFile  PNG sprite sheet file
 * @param metaFile   Optional Aseprite/TexturePacker JSON metadata file
 * @param options    Grid dimensions for uniform-grid import (no JSON)
 */
export async function importSpriteSheet(
  imageFile: File,
  metaFile: File | null,
  options: SpriteSheetImportOptions = {},
): Promise<ImportedFrame[]> {
  const img = await loadImage(imageFile);

  // Draw image to an OffscreenCanvas to extract pixel data
  const offscreen = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = offscreen.getContext('2d');
  if (!ctx) throw new Error('Failed to get OffscreenCanvas context');
  ctx.drawImage(img, 0, 0);

  // Parse frame rectangles
  const rects: { key: string; x: number; y: number; w: number; h: number }[] = [];

  if (metaFile) {
    const raw = (await readJsonFile(metaFile)) as SpritesheetMeta;
    const entries = Object.entries(raw.frames ?? {});
    for (const [key, fd] of entries) {
      rects.push({ key, x: fd.frame.x, y: fd.frame.y, w: fd.frame.w, h: fd.frame.h });
    }
    // Sort by key for deterministic frame order
    rects.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  } else {
    // Uniform grid
    const cols = options.cols ?? 1;
    const rows = options.rows ?? 1;
    const fw = Math.floor(img.naturalWidth / cols);
    const fh = Math.floor(img.naturalHeight / rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        rects.push({ key: `frame_${idx}`, x: c * fw, y: r * fh, w: fw, h: fh });
      }
    }
  }

  // Extract ImageData for each frame
  const frames: ImportedFrame[] = [];
  for (let i = 0; i < rects.length; i++) {
    const { key, x, y, w, h } = rects[i]!;
    if (w <= 0 || h <= 0) continue;
    const imageData = ctx.getImageData(x, y, w, h);
    frames.push({ index: i, key, x, y, width: w, height: h, imageData });
  }

  return frames;
}
