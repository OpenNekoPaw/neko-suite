export interface EditableVec3 {
  x: number;
  y: number;
  z: number;
}

export interface EditableQuat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface EditableNodeTransform {
  position: EditableVec3;
  rotation: EditableQuat;
  scale: EditableVec3;
}
