/**
 * Scanline Fill
 *
 * Fills a closed polygon into a Uint8Array bitmask using the scanline algorithm.
 * Used by lasso selection to convert a list of path points into a selection mask.
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/**
 * Fill a closed polygon into a grayscale mask.
 * Points are in document pixel coordinates.
 * Mask value: 255 = inside, 0 = outside.
 */
export function scanlineFill(
  points: readonly Point2D[],
  width: number,
  height: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (points.length < 3) return mask;

  // Find Y-range to limit scanline iteration
  let minY = height;
  let maxY = 0;
  for (const p of points) {
    const py = Math.floor(p.y);
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  minY = Math.max(0, minY);
  maxY = Math.min(height - 1, maxY);

  const n = points.length;

  // For each scanline, find edge intersections and fill between pairs
  for (let y = minY; y <= maxY; y++) {
    const intersections: number[] = [];
    const scanY = y + 0.5; // Sample at pixel center

    for (let i = 0; i < n; i++) {
      const p0 = points[i]!;
      const p1 = points[(i + 1) % n]!;

      // Check if edge crosses this scanline
      if ((p0.y <= scanY && p1.y > scanY) || (p1.y <= scanY && p0.y > scanY)) {
        const t = (scanY - p0.y) / (p1.y - p0.y);
        intersections.push(p0.x + t * (p1.x - p0.x));
      }
    }

    // Sort intersections and fill between pairs
    intersections.sort((a, b) => a - b);
    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x0 = Math.max(0, Math.ceil(intersections[i]!));
      const x1 = Math.min(width - 1, Math.floor(intersections[i + 1]!));
      for (let x = x0; x <= x1; x++) {
        mask[y * width + x] = 255;
      }
    }
  }

  return mask;
}
