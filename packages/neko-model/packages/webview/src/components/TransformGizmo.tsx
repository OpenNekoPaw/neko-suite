import React from 'react';
import { TransformControls } from '@react-three/drei';
import type { Object3D } from 'three';
import type { TransformMode } from '../types';

interface TransformGizmoProps {
  target: Object3D | null;
  mode: TransformMode;
  onTransformChange?: (
    position: [number, number, number],
    rotation: [number, number, number, number],
    scale: [number, number, number],
  ) => void;
}

/**
 * Transform gizmo for manipulating scene objects.
 */
export function TransformGizmo({
  target,
  mode,
  onTransformChange,
}: TransformGizmoProps): React.JSX.Element | null {
  if (!target) return null;

  return (
    <TransformControls
      object={target}
      mode={mode}
      onObjectChange={() => {
        if (!target || !onTransformChange) return;
        const pos = target.position;
        const rot = target.quaternion;
        const scl = target.scale;
        onTransformChange(
          [pos.x, pos.y, pos.z],
          [rot.x, rot.y, rot.z, rot.w],
          [scl.x, scl.y, scl.z],
        );
      }}
    />
  );
}
