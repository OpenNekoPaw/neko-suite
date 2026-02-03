/**
 * SelectionBox - 选择框组件
 * Displays selection border and transform handles for selected elements
 */

import { memo, useMemo } from 'react';
import type { TimelineElement } from '@uniedit/shared';
import type { CoordinateMapper } from './hooks/useCoordinateMapping';

export interface SelectionBoxProps {
  /** The selected element */
  element: TimelineElement;
  /** Coordinate mapper */
  coordinateMapper: CoordinateMapper;
  /** Whether this is the primary selection (for multi-select) */
  isPrimary?: boolean;
  /** Callback when a control point is dragged */
  onControlPointDrag?: (
    position: ControlPointPosition,
    deltaX: number,
    deltaY: number
  ) => void;
}

export type ControlPointPosition =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'rotate';

interface ControlPointProps {
  x: number;
  y: number;
  position: ControlPointPosition;
  type: 'corner' | 'edge' | 'rotate';
  rotation?: number;
}

const CONTROL_POINT_SIZE = 8;
const ROTATION_HANDLE_OFFSET = 24;

/**
 * Get cursor style for control point
 */
function getCursor(position: ControlPointPosition, _rotation: number): string {
  const cursors: Record<ControlPointPosition, string> = {
    nw: 'nwse-resize',
    n: 'ns-resize',
    ne: 'nesw-resize',
    e: 'ew-resize',
    se: 'nwse-resize',
    s: 'ns-resize',
    sw: 'nesw-resize',
    w: 'ew-resize',
    rotate: 'grab',
  };

  // TODO: Adjust cursor based on rotation
  return cursors[position];
}

/**
 * Control point component
 */
const ControlPoint = memo(function ControlPoint({
  x,
  y,
  position,
  type,
  rotation = 0,
}: ControlPointProps) {
  const isRotate = type === 'rotate';
  const size = isRotate ? CONTROL_POINT_SIZE + 2 : CONTROL_POINT_SIZE;

  return (
    <div
      className={`absolute pointer-events-auto ${
        isRotate
          ? 'bg-blue-500 rounded-full border-2 border-white shadow-md'
          : 'bg-white border-2 border-blue-500 shadow-sm'
      }`}
      style={{
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        cursor: getCursor(position, rotation),
        transform: type === 'corner' ? 'rotate(45deg)' : undefined,
      }}
      data-control-point={position}
    />
  );
});

/**
 * Selection box component
 */
export const SelectionBox = memo(function SelectionBox({
  element,
  coordinateMapper,
  isPrimary = true,
}: SelectionBoxProps) {
  // Get element transform
  const transform = element.transform;
  const x = transform?.x ?? 0.5;
  const y = transform?.y ?? 0.5;
  const scaleX = transform?.scaleX ?? 1;
  const scaleY = transform?.scaleY ?? 1;
  const rotation = transform?.rotation ?? 0;

  // Calculate bounds in canvas coordinates
  const bounds = useMemo(() => {
    // Element dimensions in project space (assuming full canvas at scale 1)
    const width = scaleX;
    const height = scaleY;

    // Corner positions in project coordinates
    const left = x - width / 2;
    const top = y - height / 2;
    const right = x + width / 2;
    const bottom = y + height / 2;

    // Convert to canvas coordinates
    const topLeft = coordinateMapper.projectToCanvas(left, top);
    const topRight = coordinateMapper.projectToCanvas(right, top);
    const bottomLeft = coordinateMapper.projectToCanvas(left, bottom);
    const bottomRight = coordinateMapper.projectToCanvas(right, bottom);
    const center = coordinateMapper.projectToCanvas(x, y);

    return {
      topLeft,
      topRight,
      bottomLeft,
      bottomRight,
      center,
      width: topRight.x - topLeft.x,
      height: bottomLeft.y - topLeft.y,
      rotation,
    };
  }, [x, y, scaleX, scaleY, rotation, coordinateMapper]);

  // Control points positions
  const controlPoints = useMemo((): ControlPointProps[] => {
    const { topLeft, topRight, bottomLeft, bottomRight, center } = bounds;

    return [
      // Corners
      { x: topLeft.x, y: topLeft.y, position: 'nw', type: 'corner' },
      { x: topRight.x, y: topRight.y, position: 'ne', type: 'corner' },
      { x: bottomLeft.x, y: bottomLeft.y, position: 'sw', type: 'corner' },
      { x: bottomRight.x, y: bottomRight.y, position: 'se', type: 'corner' },
      // Edges
      { x: center.x, y: topLeft.y, position: 'n', type: 'edge' },
      { x: topRight.x, y: center.y, position: 'e', type: 'edge' },
      { x: center.x, y: bottomLeft.y, position: 's', type: 'edge' },
      { x: topLeft.x, y: center.y, position: 'w', type: 'edge' },
      // Rotation handle
      {
        x: center.x,
        y: topLeft.y - ROTATION_HANDLE_OFFSET,
        position: 'rotate',
        type: 'rotate',
      },
    ];
  }, [bounds]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Selection border */}
      <div
        className={`absolute border-2 ${
          isPrimary ? 'border-blue-500' : 'border-blue-300'
        }`}
        style={{
          left: bounds.topLeft.x,
          top: bounds.topLeft.y,
          width: bounds.width,
          height: bounds.height,
          transform: `rotate(${rotation}deg)`,
          transformOrigin: 'center center',
        }}
      />

      {/* Rotation handle line */}
      {isPrimary && (
        <svg
          className="absolute overflow-visible"
          style={{
            left: bounds.center.x,
            top: bounds.topLeft.y - ROTATION_HANDLE_OFFSET,
            width: 1,
            height: ROTATION_HANDLE_OFFSET,
          }}
        >
          <line
            x1={0}
            y1={ROTATION_HANDLE_OFFSET}
            x2={0}
            y2={0}
            stroke="#3b82f6"
            strokeWidth={1}
            strokeDasharray="4 2"
          />
        </svg>
      )}

      {/* Control points (only for primary selection) */}
      {isPrimary &&
        controlPoints.map((cp) => (
          <ControlPoint
            key={cp.position}
            x={cp.x}
            y={cp.y}
            position={cp.position}
            type={cp.type}
            rotation={rotation}
          />
        ))}
    </div>
  );
});
