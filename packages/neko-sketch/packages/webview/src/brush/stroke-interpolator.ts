/**
 * Stroke Interpolator
 *
 * Interpolates raw pointer events into smooth stroke points
 * using Catmull-Rom spline interpolation.
 */
import type { StrokePoint } from '../types';

/** Catmull-Rom interpolation between 4 control points */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/** Interpolate between stroke points for smooth rendering */
export function interpolateStroke(
  points: ReadonlyArray<StrokePoint>,
  spacing: number,
): StrokePoint[] {
  if (points.length < 2) return [...points];
  if (points.length === 2) {
    return interpolateLinear(points[0]!, points[1]!, spacing);
  }

  const result: StrokePoint[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;

    const segmentLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(1, Math.ceil(segmentLen / spacing));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      result.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
        pressure: catmullRom(p0.pressure, p1.pressure, p2.pressure, p3.pressure, t),
        tiltX: catmullRom(p0.tiltX, p1.tiltX, p2.tiltX, p3.tiltX, t),
        tiltY: catmullRom(p0.tiltY, p1.tiltY, p2.tiltY, p3.tiltY, t),
        timestamp: p1.timestamp + (p2.timestamp - p1.timestamp) * t,
      });
    }
  }

  // Add the last point
  const last = points[points.length - 1];
  if (last) result.push(last);

  return result;
}

function interpolateLinear(p1: StrokePoint, p2: StrokePoint, spacing: number): StrokePoint[] {
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const steps = Math.max(1, Math.ceil(dist / spacing));
  const result: StrokePoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    result.push({
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
      pressure: p1.pressure + (p2.pressure - p1.pressure) * t,
      tiltX: p1.tiltX + (p2.tiltX - p1.tiltX) * t,
      tiltY: p1.tiltY + (p2.tiltY - p1.tiltY) * t,
      timestamp: p1.timestamp + (p2.timestamp - p1.timestamp) * t,
    });
  }

  return result;
}
