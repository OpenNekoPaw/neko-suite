/**
 * Gradient Tool
 *
 * Drag to define gradient direction (linear) or center+radius (radial).
 * Renders into the active layer's FBO via a dedicated GLSL shader.
 */

export type GradientType = 'linear' | 'radial';

export interface GradientState {
  readonly type: GradientType;
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  /** Start color RGBA [0-1] */
  readonly color0: readonly [number, number, number, number];
  /** End color RGBA [0-1] */
  readonly color1: readonly [number, number, number, number];
}

export interface LinearGradientPaintOptions {
  readonly width: number;
  readonly height: number;
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly color: readonly [number, number, number, number];
}

/**
 * Paint a foreground-to-transparent linear gradient over straight-alpha RGBA data.
 * The source color is strongest at start and fades to transparent at end.
 */
export function paintLinearGradient(
  pixels: Uint8ClampedArray,
  options: LinearGradientPaintOptions,
): void {
  const { width, height, startX, startY, endX, endY, color } = options;
  const dx = endX - startX;
  const dy = endY - startY;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 0) {
    return;
  }

  const sr = Math.round(color[0] * 255);
  const sg = Math.round(color[1] * 255);
  const sb = Math.round(color[2] * 255);
  const baseAlpha = Math.max(0, Math.min(1, color[3]));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = Math.max(0, Math.min(1, ((x - startX) * dx + (y - startY) * dy) / len2));
      const sourceAlpha = baseAlpha * (1 - t);
      if (sourceAlpha <= 0) {
        continue;
      }

      const index = (y * width + x) * 4;
      compositePixel(pixels, index, sr, sg, sb, sourceAlpha);
    }
  }
}

function compositePixel(
  pixels: Uint8ClampedArray,
  index: number,
  sourceR: number,
  sourceG: number,
  sourceB: number,
  sourceAlpha: number,
): void {
  const destAlpha = pixels[index + 3]! / 255;
  const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
  if (outAlpha <= 0) {
    return;
  }

  const destFactor = destAlpha * (1 - sourceAlpha);
  pixels[index] = Math.round((sourceR * sourceAlpha + pixels[index]! * destFactor) / outAlpha);
  pixels[index + 1] = Math.round(
    (sourceG * sourceAlpha + pixels[index + 1]! * destFactor) / outAlpha,
  );
  pixels[index + 2] = Math.round(
    (sourceB * sourceAlpha + pixels[index + 2]! * destFactor) / outAlpha,
  );
  pixels[index + 3] = Math.round(outAlpha * 255);
}
