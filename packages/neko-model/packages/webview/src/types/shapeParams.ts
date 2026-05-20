export type ShapeType = 'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane';

export interface ShapeParamDef {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step: number;
}

const MODEL_LINEAR_MIN = 0.01;
const MODEL_EXTENT_MAX = 5;
const MODEL_RADIUS_MAX = 2.5;
const MODEL_LINEAR_STEP = 0.01;

export const SHAPE_PARAMS: Record<ShapeType, ShapeParamDef[]> = {
  cube: [
    {
      name: 'width',
      label: 'Width',
      min: MODEL_LINEAR_MIN,
      max: MODEL_EXTENT_MAX,
      default: 1,
      step: MODEL_LINEAR_STEP,
    },
    {
      name: 'height',
      label: 'Height',
      min: MODEL_LINEAR_MIN,
      max: MODEL_EXTENT_MAX,
      default: 1,
      step: MODEL_LINEAR_STEP,
    },
    {
      name: 'depth',
      label: 'Depth',
      min: MODEL_LINEAR_MIN,
      max: MODEL_EXTENT_MAX,
      default: 1,
      step: MODEL_LINEAR_STEP,
    },
  ],
  sphere: [
    {
      name: 'radius',
      label: 'Radius',
      min: MODEL_LINEAR_MIN,
      max: MODEL_RADIUS_MAX,
      default: 0.5,
      step: MODEL_LINEAR_STEP,
    },
    { name: 'segments', label: 'Segments', min: 4, max: 128, default: 32, step: 1 },
    { name: 'rings', label: 'Rings', min: 2, max: 64, default: 16, step: 1 },
  ],
  cylinder: [
    {
      name: 'radiusTop',
      label: 'Top Radius',
      min: 0,
      max: MODEL_RADIUS_MAX,
      default: 0.5,
      step: MODEL_LINEAR_STEP,
    },
    {
      name: 'radiusBottom',
      label: 'Bottom Radius',
      min: 0,
      max: MODEL_RADIUS_MAX,
      default: 0.5,
      step: MODEL_LINEAR_STEP,
    },
    {
      name: 'height',
      label: 'Height',
      min: MODEL_LINEAR_MIN,
      max: MODEL_EXTENT_MAX,
      default: 1,
      step: MODEL_LINEAR_STEP,
    },
    { name: 'segments', label: 'Segments', min: 3, max: 128, default: 32, step: 1 },
  ],
  cone: [
    {
      name: 'radius',
      label: 'Radius',
      min: MODEL_LINEAR_MIN,
      max: MODEL_RADIUS_MAX,
      default: 0.5,
      step: MODEL_LINEAR_STEP,
    },
    {
      name: 'height',
      label: 'Height',
      min: MODEL_LINEAR_MIN,
      max: MODEL_EXTENT_MAX,
      default: 1,
      step: MODEL_LINEAR_STEP,
    },
    { name: 'segments', label: 'Segments', min: 3, max: 128, default: 32, step: 1 },
  ],
  torus: [
    {
      name: 'majorRadius',
      label: 'Major Radius',
      min: MODEL_LINEAR_MIN,
      max: MODEL_RADIUS_MAX,
      default: 0.5,
      step: MODEL_LINEAR_STEP,
    },
    {
      name: 'minorRadius',
      label: 'Minor Radius',
      min: MODEL_LINEAR_MIN,
      max: 1,
      default: 0.2,
      step: MODEL_LINEAR_STEP,
    },
    { name: 'majorSegments', label: 'Major Segments', min: 3, max: 128, default: 32, step: 1 },
    { name: 'minorSegments', label: 'Minor Segments', min: 3, max: 64, default: 16, step: 1 },
  ],
  plane: [
    {
      name: 'width',
      label: 'Width',
      min: MODEL_LINEAR_MIN,
      max: MODEL_EXTENT_MAX,
      default: 1,
      step: MODEL_LINEAR_STEP,
    },
    {
      name: 'depth',
      label: 'Depth',
      min: MODEL_LINEAR_MIN,
      max: MODEL_EXTENT_MAX,
      default: 1,
      step: MODEL_LINEAR_STEP,
    },
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
