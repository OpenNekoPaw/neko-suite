/**
 * SafeZones - 安全区域显示组件
 * Shows action safe and title safe zones
 */

import { memo, useMemo } from 'react';
import type { CoordinateMapper } from './hooks/useCoordinateMapping';

export interface SafeZonesProps {
  /** Coordinate mapper */
  coordinateMapper: CoordinateMapper;
  /** Whether to show action safe zone (90%) */
  showActionSafe?: boolean;
  /** Whether to show title safe zone (80%) */
  showTitleSafe?: boolean;
  /** Action safe zone color */
  actionSafeColor?: string;
  /** Title safe zone color */
  titleSafeColor?: string;
}

/**
 * Safe zones overlay component
 */
export const SafeZones = memo(function SafeZones({
  coordinateMapper,
  showActionSafe = true,
  showTitleSafe = true,
  actionSafeColor = 'rgba(255, 255, 0, 0.5)',
  titleSafeColor = 'rgba(255, 0, 0, 0.5)',
}: SafeZonesProps) {
  const effectiveArea = coordinateMapper.getEffectiveArea();

  // Calculate safe zone rectangles
  const zones = useMemo(() => {
    const { offsetX, offsetY, width, height } = effectiveArea;

    // Action safe: 90% of frame
    const actionSafeMargin = 0.05; // 5% on each side = 90% total
    const actionSafe = {
      x: offsetX + width * actionSafeMargin,
      y: offsetY + height * actionSafeMargin,
      width: width * (1 - 2 * actionSafeMargin),
      height: height * (1 - 2 * actionSafeMargin),
    };

    // Title safe: 80% of frame
    const titleSafeMargin = 0.1; // 10% on each side = 80% total
    const titleSafe = {
      x: offsetX + width * titleSafeMargin,
      y: offsetY + height * titleSafeMargin,
      width: width * (1 - 2 * titleSafeMargin),
      height: height * (1 - 2 * titleSafeMargin),
    };

    return { actionSafe, titleSafe };
  }, [effectiveArea]);

  if (!showActionSafe && !showTitleSafe) {
    return null;
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ width: '100%', height: '100%' }}
    >
      {/* Action Safe Zone (90%) */}
      {showActionSafe && (
        <rect
          x={zones.actionSafe.x}
          y={zones.actionSafe.y}
          width={zones.actionSafe.width}
          height={zones.actionSafe.height}
          fill="none"
          stroke={actionSafeColor}
          strokeWidth={1}
          strokeDasharray="8 4"
        />
      )}

      {/* Title Safe Zone (80%) */}
      {showTitleSafe && (
        <rect
          x={zones.titleSafe.x}
          y={zones.titleSafe.y}
          width={zones.titleSafe.width}
          height={zones.titleSafe.height}
          fill="none"
          stroke={titleSafeColor}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      )}

      {/* Labels */}
      {showActionSafe && (
        <text
          x={zones.actionSafe.x + 4}
          y={zones.actionSafe.y + 12}
          fill={actionSafeColor}
          fontSize={10}
          fontFamily="monospace"
        >
          Action Safe (90%)
        </text>
      )}

      {showTitleSafe && (
        <text
          x={zones.titleSafe.x + 4}
          y={zones.titleSafe.y + 12}
          fill={titleSafeColor}
          fontSize={10}
          fontFamily="monospace"
        >
          Title Safe (80%)
        </text>
      )}
    </svg>
  );
});
