/**
 * Vector drawing types
 *
 * Defines path segments, fill/stroke styles, and complete vector paths.
 */

export type SegmentType = 'move' | 'line' | 'cubic' | 'quadratic';

export interface PathSegment {
  readonly type: SegmentType;
  readonly points: readonly [number, number][];
}

export type FillRule = 'evenodd' | 'nonzero';

export interface FillStyle {
  readonly color: readonly [number, number, number, number];
  readonly rule: FillRule;
}

export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'miter' | 'round' | 'bevel';

export interface StrokeStyle {
  readonly color: readonly [number, number, number, number];
  readonly width: number;
  readonly cap: LineCap;
  readonly join: LineJoin;
}

export interface VectorPath {
  readonly id: string;
  readonly segments: readonly PathSegment[];
  readonly closed: boolean;
  readonly fill: FillStyle | null;
  readonly stroke: StrokeStyle | null;
}
