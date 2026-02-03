/**
 * ShapeElementContent - 时间轴形状元素内容渲染
 *
 * 在时间轴上显示形状元素的缩略预览
 * 显示形状图层的简化版本
 */

import { memo, useMemo } from 'react';
import type { ShapeElement } from '../types';
import type { ShapeInstance, Shape } from '../types/shape';
import { generateStarPoints } from '../types/shape';

interface ShapeElementContentProps {
  element: ShapeElement;
  width: number;
  height: number;
}

/**
 * 生成简化的形状路径用于缩略图
 */
function getSimplifiedShapePath(shape: Shape, w: number, h: number): string {
  const pct2px = (pct: number, size: number) => (pct / 100) * size;

  switch (shape.shapeType) {
    case 'rectangle': {
      const cx = pct2px(shape.centerX, w);
      const cy = pct2px(shape.centerY, h);
      const sw = pct2px(shape.width, w);
      const sh = pct2px(shape.height, h);
      return `M ${cx - sw / 2} ${cy - sh / 2} h ${sw} v ${sh} h ${-sw} Z`;
    }
    case 'ellipse': {
      const cx = pct2px(shape.centerX, w);
      const cy = pct2px(shape.centerY, h);
      const rx = pct2px(shape.radiusX, w);
      const ry = pct2px(shape.radiusY, h);
      // Approximate ellipse with bezier curves
      const kappa = 0.5522847498;
      const ox = rx * kappa;
      const oy = ry * kappa;
      return `M ${cx - rx} ${cy}
        C ${cx - rx} ${cy - oy}, ${cx - ox} ${cy - ry}, ${cx} ${cy - ry}
        C ${cx + ox} ${cy - ry}, ${cx + rx} ${cy - oy}, ${cx + rx} ${cy}
        C ${cx + rx} ${cy + oy}, ${cx + ox} ${cy + ry}, ${cx} ${cy + ry}
        C ${cx - ox} ${cy + ry}, ${cx - rx} ${cy + oy}, ${cx - rx} ${cy} Z`;
    }
    case 'polygon': {
      const points = shape.points
        .map((p, i) => {
          const x = pct2px(p.x, w);
          const y = pct2px(p.y, h);
          return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
        })
        .join(' ');
      return points + ' Z';
    }
    case 'star': {
      const starPoints = generateStarPoints(shape);
      const points = starPoints
        .map((p, i) => {
          const x = pct2px(p.x, w);
          const y = pct2px(p.y, h);
          return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
        })
        .join(' ');
      return points + ' Z';
    }
    case 'line': {
      const x1 = pct2px(shape.startX, w);
      const y1 = pct2px(shape.startY, h);
      const x2 = pct2px(shape.endX, w);
      const y2 = pct2px(shape.endY, h);
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    case 'bezier': {
      if (shape.points.length === 0) return '';
      const pts = shape.points;
      let d = `M ${pct2px(pts[0].anchor.x, w)},${pct2px(pts[0].anchor.y, h)}`;
      for (let i = 1; i < pts.length; i++) {
        const curr = pts[i];
        d += ` L ${pct2px(curr.anchor.x, w)},${pct2px(curr.anchor.y, h)}`;
      }
      if (shape.closed) d += ' Z';
      return d;
    }
    default:
      return '';
  }
}

/**
 * 获取形状的填充颜色（简化版）
 */
function getShapeFillColor(shape: ShapeInstance): string {
  const { fill } = shape.style;
  if (fill.type === 'none') return 'transparent';
  if (fill.type === 'solid') return fill.color || '#4a90d9';
  if (fill.type === 'gradient' && fill.gradient) {
    // 返回渐变的第一个颜色
    return fill.gradient.stops[0]?.color || '#4a90d9';
  }
  return '#4a90d9';
}

/**
 * 获取形状的描边颜色
 */
function getShapeStrokeColor(shape: ShapeInstance): string {
  const { stroke } = shape.style;
  if (!stroke.enabled) return 'none';
  return stroke.color || '#333';
}

export const ShapeElementContent = memo(function ShapeElementContent({
  element,
  width,
  height,
}: ShapeElementContentProps) {
  // 获取可见的形状，按 zIndex 排序
  const visibleShapes = useMemo(() => {
    return element.shapes
      .filter((s) => s.visible)
      .sort((a, b) => a.zIndex - b.zIndex);
  }, [element.shapes]);

  // 缩略图内边距
  const padding = 4;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  // 如果没有形状，显示占位符
  if (visibleShapes.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none bg-indigo-800/60">
        <span className="text-xs text-white/70 truncate select-none">
          {element.name} (空)
        </span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none bg-indigo-800/60">
      {/* 形状缩略预览 */}
      <svg
        className="absolute"
        style={{
          left: padding,
          top: padding,
          width: innerWidth,
          height: innerHeight,
        }}
        viewBox={`0 0 ${innerWidth} ${innerHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {visibleShapes.map((shape) => (
          <path
            key={shape.id}
            d={getSimplifiedShapePath(shape.shape, innerWidth, innerHeight)}
            fill={getShapeFillColor(shape)}
            fillOpacity={shape.style.fill.opacity * 0.8}
            stroke={getShapeStrokeColor(shape)}
            strokeWidth={Math.min(shape.style.stroke.width, 2)}
            strokeOpacity={shape.style.stroke.opacity * 0.8}
          />
        ))}
      </svg>

      {/* 元素名称 */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-0.5 bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-[10px] text-white truncate select-none drop-shadow-sm">
          {element.name}
          {visibleShapes.length > 0 && (
            <span className="ml-1 text-white/60">
              ({visibleShapes.length})
            </span>
          )}
        </span>
      </div>

      {/* 形状类型指示器 */}
      <div className="absolute top-1 right-1 flex gap-0.5">
        {visibleShapes.slice(0, 3).map((shape) => (
          <div
            key={shape.id}
            className="w-3 h-3 rounded-sm flex items-center justify-center bg-black/40"
            title={shape.name}
          >
            <ShapeTypeIcon type={shape.shape.shapeType} />
          </div>
        ))}
        {visibleShapes.length > 3 && (
          <div className="w-3 h-3 rounded-sm flex items-center justify-center bg-black/40 text-[8px] text-white">
            +{visibleShapes.length - 3}
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * 形状类型小图标
 */
const ShapeTypeIcon = memo(function ShapeTypeIcon({
  type,
}: {
  type: Shape['shapeType'];
}) {
  const iconClass = 'w-2 h-2 text-white/80';

  switch (type) {
    case 'rectangle':
      return (
        <svg className={iconClass} viewBox="0 0 10 10" fill="currentColor">
          <rect x="1" y="2" width="8" height="6" rx="0.5" />
        </svg>
      );
    case 'ellipse':
      return (
        <svg className={iconClass} viewBox="0 0 10 10" fill="currentColor">
          <ellipse cx="5" cy="5" rx="4" ry="3" />
        </svg>
      );
    case 'polygon':
      return (
        <svg className={iconClass} viewBox="0 0 10 10" fill="currentColor">
          <polygon points="5,1 9,4 7,9 3,9 1,4" />
        </svg>
      );
    case 'star':
      return (
        <svg className={iconClass} viewBox="0 0 10 10" fill="currentColor">
          <polygon points="5,1 6,4 9,4 7,6 8,9 5,7 2,9 3,6 1,4 4,4" />
        </svg>
      );
    case 'line':
      return (
        <svg className={iconClass} viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5" fill="none">
          <line x1="1" y1="9" x2="9" y2="1" />
        </svg>
      );
    case 'bezier':
      return (
        <svg className={iconClass} viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5" fill="none">
          <path d="M1,8 C3,2 7,2 9,8" />
        </svg>
      );
    default:
      return null;
  }
});

export default ShapeElementContent;
