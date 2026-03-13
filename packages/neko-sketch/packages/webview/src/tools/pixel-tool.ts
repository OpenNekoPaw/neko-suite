/**
 * Pixel Tool
 *
 * Pixel-perfect drawing on ImageData using Bresenham's line algorithm.
 * Supports variable brush sizes (1x, 2x, 4x, 8x) and flood fill.
 */

export type PixelBrushSize = 1 | 2 | 4 | 8;

/**
 * Draw a single pixel (or block) at the given coordinates.
 */
export function drawPixel(
  imageData: ImageData,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
  brushSize: PixelBrushSize = 1,
): void {
  const { width, height, data } = imageData;
  const r = Math.round(color[0] * 255);
  const g = Math.round(color[1] * 255);
  const b = Math.round(color[2] * 255);
  const a = Math.round(color[3] * 255);

  // Snap to grid
  const sx = Math.floor(x / brushSize) * brushSize;
  const sy = Math.floor(y / brushSize) * brushSize;

  for (let dy = 0; dy < brushSize; dy++) {
    for (let dx = 0; dx < brushSize; dx++) {
      const px = sx + dx;
      const py = sy + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const idx = (py * width + px) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }
}

/**
 * Draw a line between two points using Bresenham's algorithm.
 */
export function drawLine(
  imageData: ImageData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: readonly [number, number, number, number],
  brushSize: PixelBrushSize = 1,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let cx = x0;
  let cy = y0;

  for (;;) {
    drawPixel(imageData, cx, cy, color, brushSize);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
}

/**
 * Flood fill from a starting point.
 */
export function floodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  fillColor: readonly [number, number, number, number],
  tolerance: number = 0,
): void {
  const { width, height, data } = imageData;
  const x = Math.floor(startX);
  const y = Math.floor(startY);
  if (x < 0 || x >= width || y < 0 || y >= height) return;

  const startIdx = (y * width + x) * 4;
  const sr = data[startIdx]!;
  const sg = data[startIdx + 1]!;
  const sb = data[startIdx + 2]!;
  const sa = data[startIdx + 3]!;

  const fr = Math.round(fillColor[0] * 255);
  const fg = Math.round(fillColor[1] * 255);
  const fb = Math.round(fillColor[2] * 255);
  const fa = Math.round(fillColor[3] * 255);

  // Don't fill if already the target color
  if (sr === fr && sg === fg && sb === fb && sa === fa) return;

  const visited = new Uint8Array(width * height);
  const stack: [number, number][] = [[x, y]];

  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!;
    const vi = cy * width + cx;
    if (visited[vi]) continue;
    visited[vi] = 1;

    const idx = vi * 4;
    const dr = Math.abs(data[idx]! - sr);
    const dg = Math.abs(data[idx + 1]! - sg);
    const db = Math.abs(data[idx + 2]! - sb);
    const da = Math.abs(data[idx + 3]! - sa);

    if (dr + dg + db + da > tolerance * 4) continue;

    data[idx] = fr;
    data[idx + 1] = fg;
    data[idx + 2] = fb;
    data[idx + 3] = fa;

    if (cx > 0) stack.push([cx - 1, cy]);
    if (cx < width - 1) stack.push([cx + 1, cy]);
    if (cy > 0) stack.push([cx, cy - 1]);
    if (cy < height - 1) stack.push([cx, cy + 1]);
  }
}
