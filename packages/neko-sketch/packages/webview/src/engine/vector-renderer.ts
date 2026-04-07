/**
 * Vector Renderer
 *
 * Renders vector paths to a Canvas2D context and provides SVG export.
 */
import type { VectorPath, PathSegment } from '../types/vector';

/**
 * Render a vector path to a 2D canvas context.
 */
function renderPath(ctx: CanvasRenderingContext2D, path: VectorPath): void {
  const path2d = buildPath2D(path.segments);

  if (path.fill) {
    ctx.fillStyle = rgba(path.fill.color);
    ctx.fill(path2d, path.fill.rule);
  }

  if (path.stroke) {
    ctx.strokeStyle = rgba(path.stroke.color);
    ctx.lineWidth = path.stroke.width;
    ctx.lineCap = path.stroke.cap;
    ctx.lineJoin = path.stroke.join;
    ctx.stroke(path2d);
  }
}

/**
 * Render all paths to the given context.
 */
export function renderPaths(ctx: CanvasRenderingContext2D, paths: readonly VectorPath[]): void {
  for (const p of paths) {
    renderPath(ctx, p);
  }
}

/**
 * Export vector paths to SVG string.
 */
function exportSVG(paths: readonly VectorPath[], width: number, height: number): string {
  const pathElements = paths.map((p) => {
    const d = segmentsToSVGPath(p.segments);
    const attrs: string[] = [`d="${d}"`];

    if (p.fill) {
      attrs.push(`fill="${rgba(p.fill.color)}"`);
      attrs.push(`fill-rule="${p.fill.rule}"`);
    } else {
      attrs.push('fill="none"');
    }

    if (p.stroke) {
      attrs.push(`stroke="${rgba(p.stroke.color)}"`);
      attrs.push(`stroke-width="${p.stroke.width}"`);
      attrs.push(`stroke-linecap="${p.stroke.cap}"`);
      attrs.push(`stroke-linejoin="${p.stroke.join}"`);
    }

    return `  <path ${attrs.join(' ')} />`;
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...pathElements,
    '</svg>',
  ].join('\n');
}

// ─── Helpers ───

function buildPath2D(segments: readonly PathSegment[]): Path2D {
  const p = new Path2D();
  for (const seg of segments) {
    switch (seg.type) {
      case 'move': {
        const pt = seg.points[0];
        if (pt) p.moveTo(pt[0], pt[1]);
        break;
      }
      case 'line': {
        const pt = seg.points[0];
        if (pt) p.lineTo(pt[0], pt[1]);
        break;
      }
      case 'cubic': {
        const [cp1, cp2, end] = seg.points;
        if (cp1 && cp2 && end) p.bezierCurveTo(cp1[0], cp1[1], cp2[0], cp2[1], end[0], end[1]);
        break;
      }
      case 'quadratic': {
        const [cp, end] = seg.points;
        if (cp && end) p.quadraticCurveTo(cp[0], cp[1], end[0], end[1]);
        break;
      }
    }
  }
  return p;
}

function segmentsToSVGPath(segments: readonly PathSegment[]): string {
  const parts: string[] = [];
  for (const seg of segments) {
    switch (seg.type) {
      case 'move': {
        const pt = seg.points[0];
        if (pt) parts.push(`M ${pt[0]} ${pt[1]}`);
        break;
      }
      case 'line': {
        const pt = seg.points[0];
        if (pt) parts.push(`L ${pt[0]} ${pt[1]}`);
        break;
      }
      case 'cubic': {
        const [cp1, cp2, end] = seg.points;
        if (cp1 && cp2 && end) {
          parts.push(`C ${cp1[0]} ${cp1[1]} ${cp2[0]} ${cp2[1]} ${end[0]} ${end[1]}`);
        }
        break;
      }
      case 'quadratic': {
        const [cp, end] = seg.points;
        if (cp && end) parts.push(`Q ${cp[0]} ${cp[1]} ${end[0]} ${end[1]}`);
        break;
      }
    }
  }
  return parts.join(' ');
}

function rgba(c: readonly [number, number, number, number]): string {
  const r = Math.round(c[0] * 255);
  const g = Math.round(c[1] * 255);
  const b = Math.round(c[2] * 255);
  return `rgba(${r},${g},${b},${c[3].toFixed(2)})`;
}
