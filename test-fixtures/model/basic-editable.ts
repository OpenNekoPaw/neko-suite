import { generateDefaultCubeGlb } from '@neko/shared/vscode/extension';

export const BASIC_EDITABLE_GLB_FIXTURE = {
  id: 'basic-editable',
  fileName: 'basic-editable.glb',
  sceneName: 'NekoBasicEditable',
  license: 'Generated from project code; repository redistributable',
  requirements: {
    meshNodeCount: 1,
    materialSlotCount: 1,
    nonEmptyBounds: true,
  },
} as const;

export function generateBasicEditableGlb(): Uint8Array {
  return generateDefaultCubeGlb(BASIC_EDITABLE_GLB_FIXTURE.sceneName);
}
