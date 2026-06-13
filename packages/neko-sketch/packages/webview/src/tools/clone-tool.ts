/**
 * Clone Stamp Tool
 *
 * Alt+click to define a source point, then paint to clone pixels
 * from the source offset. Operates on the active layer's pixel data.
 */

export interface CloneState {
  /** Source offset relative to current brush position (document pixels) */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Whether source point has been defined */
  readonly sourceSet: boolean;
}

export function cloneStampFromSource(
  targetData: Uint8ClampedArray,
  sourceData: Uint8ClampedArray,
  w: number,
  h: number,
  dstX: number,
  dstY: number,
  offsetX: number,
  offsetY: number,
  radius: number,
  hardness: number,
): void {
  const srcCX = Math.round(dstX + offsetX);
  const srcCY = Math.round(dstY + offsetY);
  const r = Math.ceil(radius);

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      const dPx = Math.round(dstX) + dx;
      const dPy = Math.round(dstY) + dy;
      const sPx = srcCX + dx;
      const sPy = srcCY + dy;

      if (dPx < 0 || dPx >= w || dPy < 0 || dPy >= h) continue;
      if (sPx < 0 || sPx >= w || sPy < 0 || sPy >= h) continue;

      // Brush falloff
      const edge = 1 - hardness;
      const t = dist / radius;
      const alpha = t <= hardness ? 1.0 : 1.0 - (t - hardness) / Math.max(edge, 0.001);
      if (alpha <= 0) continue;

      const si = (sPy * w + sPx) * 4;
      const di = (dPy * w + dPx) * 4;

      // Blend source over destination with brush alpha
      for (let c = 0; c < 4; c++) {
        const src = sourceData[si + c]!;
        const dst = targetData[di + c]!;
        targetData[di + c] = Math.round(dst + (src - dst) * alpha);
      }
    }
  }
}
