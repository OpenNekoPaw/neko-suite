import { describe, it, expect } from 'vitest';
import {
  createPath,
  moveTo,
  lineTo,
  cubicTo,
  closePath,
  createRectangle,
  createEllipse,
  createPolygon,
  createStar,
} from './vector-tool';

describe('vector-tool', () => {
  it('createPath returns empty path', () => {
    const p = createPath();
    expect(p.segments).toHaveLength(0);
    expect(p.closed).toBe(false);
    expect(p.fill).toBeNull();
    expect(p.stroke).toBeNull();
    expect(p.id).toMatch(/^vpath-/);
  });

  it('moveTo/lineTo add segments', () => {
    let p = createPath();
    p = moveTo(p, 10, 20);
    p = lineTo(p, 30, 40);
    expect(p.segments).toHaveLength(2);
    expect(p.segments[0]?.type).toBe('move');
    expect(p.segments[0]?.points[0]).toEqual([10, 20]);
    expect(p.segments[1]?.type).toBe('line');
    expect(p.segments[1]?.points[0]).toEqual([30, 40]);
  });

  it('cubicTo adds cubic segment with 3 points', () => {
    let p = createPath();
    p = moveTo(p, 0, 0);
    p = cubicTo(p, 1, 2, 3, 4, 5, 6);
    const seg = p.segments[1];
    expect(seg?.type).toBe('cubic');
    expect(seg?.points).toHaveLength(3);
    expect(seg?.points).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it('closePath sets closed=true', () => {
    const p = closePath(createPath());
    expect(p.closed).toBe(true);
  });

  it('createRectangle has 5 segments and is closed', () => {
    const r = createRectangle(0, 0, 100, 50);
    expect(r.segments).toHaveLength(5);
    expect(r.segments[0]?.type).toBe('move');
    expect(r.closed).toBe(true);
  });

  it('createEllipse has 1 move + 4 cubics', () => {
    const e = createEllipse(50, 50, 30, 20);
    expect(e.segments).toHaveLength(5);
    expect(e.segments[0]?.type).toBe('move');
    expect(e.segments.filter((s) => s.type === 'cubic')).toHaveLength(4);
    expect(e.closed).toBe(true);
  });

  it('createPolygon with 5 sides has 6 segments', () => {
    const p = createPolygon(0, 0, 50, 5);
    expect(p.segments).toHaveLength(6);
    expect(p.segments[0]?.type).toBe('move');
    expect(p.closed).toBe(true);
  });

  it('createStar with 5 points has 11 segments', () => {
    const s = createStar(0, 0, 50, 25, 5);
    // 5 points * 2 (outer+inner) + 1 closing = 11
    expect(s.segments).toHaveLength(11);
    expect(s.segments[0]?.type).toBe('move');
    expect(s.closed).toBe(true);
  });
});
