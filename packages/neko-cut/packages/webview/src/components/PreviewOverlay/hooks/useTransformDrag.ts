/**
 * useTransformDrag - 变换拖拽 Hook
 * Handles drag operations for move, scale, and rotate
 */

import { useCallback, useRef, useState } from 'react';
import type { TimelineElement } from '@neko/shared';
import type { CoordinateMapper } from './useCoordinateMapping';
import type { ControlPointHit } from './useHitTest';

export type TransformType = 'move' | 'scale' | 'rotate' | 'none';

export interface TransformState {
  /** Whether a transform is in progress */
  isTransforming: boolean;
  /** Type of transform being performed */
  type: TransformType;
  /** Element being transformed */
  elementId: string | null;
  trackId: string | null;
  /** Control point being dragged (for scale) */
  controlPoint: ControlPointHit['position'] | null;
  /** Initial mouse position */
  startX: number;
  startY: number;
  /** Initial element transform values */
  initialTransform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  };
}

export interface TransformDelta {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
}

export interface UseTransformDragOptions {
  /** Coordinate mapper */
  coordinateMapper: CoordinateMapper;
  /** Callback to update element transform */
  onTransformChange: (
    elementId: string,
    trackId: string,
    delta: TransformDelta
  ) => void;
  /** Callback when transform ends */
  onTransformEnd?: (
    elementId: string,
    trackId: string,
    finalTransform: TransformDelta
  ) => void;
  /** Whether to constrain proportions on scale */
  constrainProportions?: boolean;
  /** Snap angle for rotation (degrees) */
  rotationSnapAngle?: number;
}

const INITIAL_STATE: TransformState = {
  isTransforming: false,
  type: 'none',
  elementId: null,
  trackId: null,
  controlPoint: null,
  startX: 0,
  startY: 0,
  initialTransform: {
    x: 0.5,
    y: 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  },
};

/**
 * Hook for handling transform drag operations
 */
export function useTransformDrag(options: UseTransformDragOptions) {
  const {
    coordinateMapper,
    onTransformChange,
    onTransformEnd,
    constrainProportions = false,
    rotationSnapAngle = 15,
  } = options;

  const [state, setState] = useState<TransformState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * Start a move transform
   */
  const startMove = useCallback(
    (
      element: TimelineElement,
      trackId: string,
      canvasX: number,
      canvasY: number
    ) => {
      const transform = element.transform;
      const newState: TransformState = {
        isTransforming: true,
        type: 'move',
        elementId: element.id,
        trackId,
        controlPoint: null,
        startX: canvasX,
        startY: canvasY,
        initialTransform: {
          x: transform?.x ?? 0.5,
          y: transform?.y ?? 0.5,
          scaleX: transform?.scaleX ?? 1,
          scaleY: transform?.scaleY ?? 1,
          rotation: transform?.rotation ?? 0,
        },
      };
      setState(newState);
    },
    []
  );

  /**
   * Start a scale transform
   */
  const startScale = useCallback(
    (
      element: TimelineElement,
      trackId: string,
      controlPoint: ControlPointHit['position'],
      canvasX: number,
      canvasY: number
    ) => {
      const transform = element.transform;
      const newState: TransformState = {
        isTransforming: true,
        type: 'scale',
        elementId: element.id,
        trackId,
        controlPoint,
        startX: canvasX,
        startY: canvasY,
        initialTransform: {
          x: transform?.x ?? 0.5,
          y: transform?.y ?? 0.5,
          scaleX: transform?.scaleX ?? 1,
          scaleY: transform?.scaleY ?? 1,
          rotation: transform?.rotation ?? 0,
        },
      };
      setState(newState);
    },
    []
  );

  /**
   * Start a rotate transform
   */
  const startRotate = useCallback(
    (
      element: TimelineElement,
      trackId: string,
      canvasX: number,
      canvasY: number
    ) => {
      const transform = element.transform;
      const newState: TransformState = {
        isTransforming: true,
        type: 'rotate',
        elementId: element.id,
        trackId,
        controlPoint: 'rotate',
        startX: canvasX,
        startY: canvasY,
        initialTransform: {
          x: transform?.x ?? 0.5,
          y: transform?.y ?? 0.5,
          scaleX: transform?.scaleX ?? 1,
          scaleY: transform?.scaleY ?? 1,
          rotation: transform?.rotation ?? 0,
        },
      };
      setState(newState);
    },
    []
  );

  /**
   * Update transform during drag
   */
  const updateTransform = useCallback(
    (canvasX: number, canvasY: number, shiftKey: boolean = false) => {
      const currentState = stateRef.current;
      if (!currentState.isTransforming || !currentState.elementId || !currentState.trackId) {
        return;
      }

      const { type, startX, startY, initialTransform, controlPoint } = currentState;

      // Convert to project coordinates
      const startProject = coordinateMapper.canvasToProject(startX, startY);
      const currentProject = coordinateMapper.canvasToProject(canvasX, canvasY);

      let delta: TransformDelta = {};

      switch (type) {
        case 'move': {
          // Calculate position delta
          const dx = currentProject.x - startProject.x;
          const dy = currentProject.y - startProject.y;

          delta = {
            x: initialTransform.x + dx,
            y: initialTransform.y + dy,
          };
          break;
        }

        case 'scale': {
          // Calculate scale based on control point
          const dx = currentProject.x - startProject.x;
          const dy = currentProject.y - startProject.y;

          let newScaleX = initialTransform.scaleX;
          let newScaleY = initialTransform.scaleY;

          // Determine scale direction based on control point
          switch (controlPoint) {
            case 'nw':
              newScaleX = initialTransform.scaleX - dx * 2;
              newScaleY = initialTransform.scaleY - dy * 2;
              break;
            case 'ne':
              newScaleX = initialTransform.scaleX + dx * 2;
              newScaleY = initialTransform.scaleY - dy * 2;
              break;
            case 'sw':
              newScaleX = initialTransform.scaleX - dx * 2;
              newScaleY = initialTransform.scaleY + dy * 2;
              break;
            case 'se':
              newScaleX = initialTransform.scaleX + dx * 2;
              newScaleY = initialTransform.scaleY + dy * 2;
              break;
            case 'n':
              newScaleY = initialTransform.scaleY - dy * 2;
              break;
            case 's':
              newScaleY = initialTransform.scaleY + dy * 2;
              break;
            case 'w':
              newScaleX = initialTransform.scaleX - dx * 2;
              break;
            case 'e':
              newScaleX = initialTransform.scaleX + dx * 2;
              break;
          }

          // Constrain proportions if shift key is held or option is enabled
          if (shiftKey || constrainProportions) {
            const aspectRatio = initialTransform.scaleX / initialTransform.scaleY;
            if (controlPoint === 'n' || controlPoint === 's') {
              newScaleX = newScaleY * aspectRatio;
            } else if (controlPoint === 'w' || controlPoint === 'e') {
              newScaleY = newScaleX / aspectRatio;
            } else {
              // Corner - use the larger change
              const scaleXRatio = newScaleX / initialTransform.scaleX;
              const scaleYRatio = newScaleY / initialTransform.scaleY;
              if (Math.abs(scaleXRatio - 1) > Math.abs(scaleYRatio - 1)) {
                newScaleY = newScaleX / aspectRatio;
              } else {
                newScaleX = newScaleY * aspectRatio;
              }
            }
          }

          // Clamp scale values
          newScaleX = Math.max(0.1, Math.min(10, newScaleX));
          newScaleY = Math.max(0.1, Math.min(10, newScaleY));

          delta = {
            scaleX: newScaleX,
            scaleY: newScaleY,
          };
          break;
        }

        case 'rotate': {
          // Calculate angle from center to current position
          const centerProject = { x: initialTransform.x, y: initialTransform.y };
          const center = coordinateMapper.projectToCanvas(centerProject.x, centerProject.y);

          const startAngle = Math.atan2(startY - center.y, startX - center.x);
          const currentAngle = Math.atan2(canvasY - center.y, canvasX - center.x);
          let angleDelta = (currentAngle - startAngle) * (180 / Math.PI);

          let newRotation = initialTransform.rotation + angleDelta;

          // Snap rotation if shift key is held
          if (shiftKey) {
            newRotation = Math.round(newRotation / rotationSnapAngle) * rotationSnapAngle;
          }

          // Normalize to -180 to 180
          while (newRotation > 180) newRotation -= 360;
          while (newRotation < -180) newRotation += 360;

          delta = {
            rotation: newRotation,
          };
          break;
        }
      }

      // Call the change callback
      onTransformChange(currentState.elementId, currentState.trackId, delta);
    },
    [coordinateMapper, onTransformChange, constrainProportions, rotationSnapAngle]
  );

  /**
   * End the transform
   */
  const endTransform = useCallback(() => {
    const currentState = stateRef.current;
    if (currentState.isTransforming && currentState.elementId && currentState.trackId) {
      if (onTransformEnd) {
        // Get final transform values - this would need to be passed from the component
        onTransformEnd(currentState.elementId, currentState.trackId, {});
      }
    }
    setState(INITIAL_STATE);
  }, [onTransformEnd]);

  /**
   * Cancel the transform (restore original values)
   */
  const cancelTransform = useCallback(() => {
    const currentState = stateRef.current;
    if (currentState.isTransforming && currentState.elementId && currentState.trackId) {
      // Restore initial transform
      onTransformChange(
        currentState.elementId,
        currentState.trackId,
        currentState.initialTransform
      );
    }
    setState(INITIAL_STATE);
  }, [onTransformChange]);

  return {
    state,
    startMove,
    startScale,
    startRotate,
    updateTransform,
    endTransform,
    cancelTransform,
  };
}
