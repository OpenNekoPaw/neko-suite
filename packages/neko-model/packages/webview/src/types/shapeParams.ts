export type ShapeType = 'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane';

export interface ShapeParamDef {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step: number;
}

export const SHAPE_PARAMS: Record<ShapeType, ShapeParamDef[]> = {
  cube: [
    { name: 'width', label: 'Width', min: 0.1, max: 100, default: 1, step: 0.1 },
    { name: 'height', label: 'Height', min: 0.1, max: 100, default: 1, step: 0.1 },
    { name: 'depth', label: 'Depth', min: 0.1, max: 100, default: 1, step: 0.1 },
  ],
  sphere: [
    { name: 'radius', label: 'Radius', min: 0.1, max: 50, default: 1, step: 0.1 },
    { name: 'segments', label: 'Segments', min: 4, max: 128, default: 32, step: 1 },
    { name: 'rings', label: 'Rings', min: 2, max: 64, default: 16, step: 1 },
  ],
  cylinder: [
    { name: 'radiusTop', label: 'Top Radius', min: 0, max: 50, default: 1, step: 0.1 },
    { name: 'radiusBottom', label: 'Bottom Radius', min: 0, max: 50, default: 1, step: 0.1 },
    { name: 'height', label: 'Height', min: 0.1, max: 100, default: 2, step: 0.1 },
    { name: 'segments', label: 'Segments', min: 3, max: 128, default: 32, step: 1 },
  ],
  cone: [
    { name: 'radius', label: 'Radius', min: 0.1, max: 50, default: 1, step: 0.1 },
    { name: 'height', label: 'Height', min: 0.1, max: 100, default: 2, step: 0.1 },
    { name: 'segments', label: 'Segments', min: 3, max: 128, default: 32, step: 1 },
  ],
  torus: [
    { name: 'majorRadius', label: 'Major Radius', min: 0.1, max: 50, default: 1, step: 0.1 },
    { name: 'minorRadius', label: 'Minor Radius', min: 0.01, max: 25, default: 0.3, step: 0.01 },
    { name: 'majorSegments', label: 'Major Segments', min: 3, max: 128, default: 32, step: 1 },
    { name: 'minorSegments', label: 'Minor Segments', min: 3, max: 64, default: 16, step: 1 },
  ],
  plane: [
    { name: 'width', label: 'Width', min: 0.1, max: 100, default: 2, step: 0.1 },
    { name: 'depth', label: 'Depth', min: 0.1, max: 100, default: 2, step: 0.1 },
    { name: 'segmentsW', label: 'Width Segments', min: 1, max: 128, default: 1, step: 1 },
    { name: 'segmentsD', label: 'Depth Segments', min: 1, max: 128, default: 1, step: 1 },
  ],
};

export const SHAPE_ICONS: Record<ShapeType, string> = {
  cube: '\u2B1C',
  sphere: '\u26AA',
  cylinder: '\uD83D\uDD37',
  cone: '\uD83D\uDD3A',
  torus: '\u2B55',
  plane: '\u25AC',
};
