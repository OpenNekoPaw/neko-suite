/**
 * Face parameter definitions for parametric face editing.
 * Organized by category with 20-25 total parameters.
 */

export interface FaceParameter {
  name: string;
  label: string;
  category: FaceCategory;
  min: number;
  max: number;
  default: number;
  step: number;
}

export type FaceCategory = 'face' | 'eyes' | 'nose' | 'mouth' | 'eyebrows';

export const FACE_CATEGORIES: Record<FaceCategory, string> = {
  face: '脸型',
  eyes: '眼睛',
  nose: '鼻子',
  mouth: '嘴巴',
  eyebrows: '眉毛',
};

/**
 * All face parameters organized by category.
 * Each parameter maps to a Morph Target (Blend Shape) in the 3D model.
 */
export const FACE_PARAMETERS: FaceParameter[] = [
  // Face shape (5 parameters)
  { name: 'faceWidth', label: '脸宽', category: 'face', min: 0, max: 1, default: 0.5, step: 0.01 },
  { name: 'faceLength', label: '脸长', category: 'face', min: 0, max: 1, default: 0.5, step: 0.01 },
  { name: 'cheekbones', label: '颧骨', category: 'face', min: 0, max: 1, default: 0.5, step: 0.01 },
  {
    name: 'chinSharpness',
    label: '下巴尖度',
    category: 'face',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },
  {
    name: 'chinWidth',
    label: '下巴宽度',
    category: 'face',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },

  // Eyes (5 parameters)
  {
    name: 'eyeDistance',
    label: '眼距',
    category: 'eyes',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },
  { name: 'eyeSize', label: '眼大小', category: 'eyes', min: 0, max: 1, default: 0.5, step: 0.01 },
  {
    name: 'eyeAngle',
    label: '眼角上扬',
    category: 'eyes',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },
  {
    name: 'eyelidFold',
    label: '双眼皮',
    category: 'eyes',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },
  {
    name: 'pupilSize',
    label: '瞳孔大小',
    category: 'eyes',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },

  // Nose (4 parameters)
  { name: 'noseHeight', label: '鼻高', category: 'nose', min: 0, max: 1, default: 0.5, step: 0.01 },
  { name: 'noseWidth', label: '鼻宽', category: 'nose', min: 0, max: 1, default: 0.5, step: 0.01 },
  { name: 'noseTip', label: '鼻尖', category: 'nose', min: 0, max: 1, default: 0.5, step: 0.01 },
  {
    name: 'nostrilWidth',
    label: '鼻翼',
    category: 'nose',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },

  // Mouth (4 parameters)
  {
    name: 'mouthWidth',
    label: '嘴宽',
    category: 'mouth',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },
  {
    name: 'lipThickness',
    label: '唇厚',
    category: 'mouth',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },
  {
    name: 'mouthCorner',
    label: '嘴角',
    category: 'mouth',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },
  { name: 'cupidsBow', label: '唇弓', category: 'mouth', min: 0, max: 1, default: 0.5, step: 0.01 },

  // Eyebrows (4 parameters)
  {
    name: 'eyebrowDistance',
    label: '眉距',
    category: 'eyebrows',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },
  {
    name: 'eyebrowHeight',
    label: '眉高',
    category: 'eyebrows',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },
  {
    name: 'eyebrowThickness',
    label: '眉粗',
    category: 'eyebrows',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },
  {
    name: 'eyebrowCurve',
    label: '眉弯',
    category: 'eyebrows',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },
];

/**
 * Get parameters by category
 */
export function getParametersByCategory(category: FaceCategory): FaceParameter[] {
  return FACE_PARAMETERS.filter((p) => p.category === category);
}

/**
 * Get default face parameters
 */
export function getDefaultFaceParams(): Record<string, number> {
  const params: Record<string, number> = {};
  for (const param of FACE_PARAMETERS) {
    params[param.name] = param.default;
  }
  return params;
}

/**
 * Get parameter definition by name
 */
export function getParameter(name: string): FaceParameter | undefined {
  return FACE_PARAMETERS.find((p) => p.name === name);
}
