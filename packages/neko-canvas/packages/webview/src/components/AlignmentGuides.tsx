/**
 * AlignmentGuides - 对齐参考线组件
 * 在节点拖拽时显示吸附参考线
 */

import type { CanvasViewport } from '@neko/shared';
import type { Guide } from '../utils/snapEngine';

// =============================================================================
// Types
// =============================================================================

export interface AlignmentGuidesProps {
  guides: Guide[];
  viewport: CanvasViewport;
}

// =============================================================================
// Component
// =============================================================================

export function AlignmentGuides({ guides, viewport }: AlignmentGuidesProps) {
  if (guides.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{
        transform: `translate(${viewport.pan.x}px, ${viewport.pan.y}px) scale(${viewport.zoom})`,
        transformOrigin: '0 0',
      }}
    >
      {guides.map((guide, index) => (
        <GuideLine key={index} guide={guide} />
      ))}
    </svg>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface GuideLineProps {
  guide: Guide;
}

function GuideLine({ guide }: GuideLineProps) {
  const { direction, position, start, end, type } = guide;

  const strokeColor = type === 'center' ? '#f59e0b' : '#3b82f6';
  const strokeDasharray = type === 'center' ? '4 4' : 'none';

  if (direction === 'horizontal') {
    return (
      <line
        x1={start}
        y1={position}
        x2={end}
        y2={position}
        stroke={strokeColor}
        strokeWidth={1}
        strokeDasharray={strokeDasharray}
      />
    );
  }

  return (
    <line
      x1={position}
      y1={start}
      x2={position}
      y2={end}
      stroke={strokeColor}
      strokeWidth={1}
      strokeDasharray={strokeDasharray}
    />
  );
}
