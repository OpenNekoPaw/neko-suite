/**
 * Fill Tool - stack-based flood fill algorithm
 *
 * Fills a connected region of similar color starting from a seed pixel.
 */

/**
 * Flood fill a connected region in an ImageData with the given color.
 * Uses a stack-based approach to avoid recursion limits.
 *
 * @param imageData - The pixel data to modify in-place
 * @param startX - Seed pixel X coordinate
 * @param startY - Seed pixel Y coordinate
 * @param fillColor - RGBA fill color (0-1 range)
 * @param tolerance - Color similarity threshold (0-255), default 32
 */
export function floodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  fillColor: readonly [number, number, number, number],
  tolerance: number = 32,
): void {
  const { width, height, data } = imageData;
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) return;

  // Read target color at seed pixel
  const seedIdx = (sy * width + sx) * 4;
  const tr = data[seedIdx]!;
  const tg = data[seedIdx + 1]!;
  const tb = data[seedIdx + 2]!;
  const ta = data[seedIdx + 3]!;

  // Convert fill color from 0-1 to 0-255
  const fr = Math.round(fillColor[0] * 255);
  const fg = Math.round(fillColor[1] * 255);
  const fb = Math.round(fillColor[2] * 255);
  const fa = Math.round(fillColor[3] * 255);

  // Skip if fill color matches target color
  if (Math.abs(tr - fr) + Math.abs(tg - fg) + Math.abs(tb - fb) + Math.abs(ta - fa) < 4) {
    return;
  }

  // Visited bitmap
  const visited = new Uint8Array(width * height);

  // Stack-based flood fill
  const stack: number[] = [sx, sy];

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;

    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const pixelIndex = y * width + x;
    if (visited[pixelIndex]) continue;
    visited[pixelIndex] = 1;

    const idx = pixelIndex * 4;
    const pr = data[idx]!;
    const pg = data[idx + 1]!;
    const pb = data[idx + 2]!;
    const pa = data[idx + 3]!;

    // Check color similarity with target
    if (
      Math.abs(pr - tr) > tolerance ||
      Math.abs(pg - tg) > tolerance ||
      Math.abs(pb - tb) > tolerance ||
      Math.abs(pa - ta) > tolerance
    ) {
      continue;
    }

    // Fill pixel
    data[idx] = fr;
    data[idx + 1] = fg;
    data[idx + 2] = fb;
    data[idx + 3] = fa;

    // Push neighbors
    stack.push(x + 1, y);
    stack.push(x - 1, y);
    stack.push(x, y + 1);
    stack.push(x, y - 1);
  }
}
