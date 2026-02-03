/**
 * MarqueeSelection - 框选组件
 * Draws a selection rectangle when dragging on empty space
 */

import { memo } from 'react';

export interface MarqueeSelectionProps {
  /** Start position (canvas coordinates) */
  startX: number;
  startY: number;
  /** Current position (canvas coordinates) */
  currentX: number;
  currentY: number;
  /** Whether selection is active */
  isActive: boolean;
}

/**
 * Marquee selection rectangle component
 */
export const MarqueeSelection = memo(function MarqueeSelection({
  startX,
  startY,
  currentX,
  currentY,
  isActive,
}: MarqueeSelectionProps) {
  if (!isActive) return null;

  // Calculate rectangle bounds
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  // Don't render if too small
  if (width < 2 && height < 2) return null;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left,
        top,
        width,
        height,
        border: '1px dashed #3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
      }}
    />
  );
});
