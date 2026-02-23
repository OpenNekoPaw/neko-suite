/**
 * InfiniteCanvas - Main canvas component
 * Provides infinite pan/zoom canvas with grid background
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import type {
  CanvasNode,
  CanvasConnection,
  CanvasViewport as ViewportType,
  MediaCanvasNode,
  StoryboardCanvasNode,
  AnnotationCanvasNode,
} from '@neko/shared';
import { CanvasGrid } from './CanvasGrid';
import { CanvasViewport } from './CanvasViewport';
import { MediaNode, StoryboardNode, AnnotationNode } from './nodes';
import { ConnectionLayer } from './connections';
import { useViewportTransform } from '../hooks/useViewportTransform';
import { useViewportCulling } from '../hooks/useViewportCulling';
import { useConnectionDrag } from '../hooks/useConnectionDrag';

// =============================================================================
// Types
// =============================================================================

export interface InfiniteCanvasProps {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  viewport: ViewportType;
  selectedNodeIds: string[];
  selectedConnectionIds?: string[];
  onViewportChange: (viewport: Partial<ViewportType>) => void;
  onNodeSelect?: (nodeId: string, multi: boolean) => void;
  /** Called on every mousemove during node drag (real-time store update) */
  onNodeDrag?: (nodeId: string, position: { x: number; y: number }) => void;
  /** Called on mouseup when node drag ends (final position + history) */
  onNodeMove?: (nodeId: string, position: { x: number; y: number }) => void;
  /** Called on every mousemove during node resize */
  onNodeResize?: (nodeId: string, size: { width: number; height: number }, position: { x: number; y: number }) => void;
  /** Called on mouseup when node resize ends */
  onNodeResizeEnd?: (nodeId: string, size: { width: number; height: number }, position: { x: number; y: number }) => void;
  onNodeUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  onConnectionSelect?: (connectionId: string) => void;
  onConnectionStart?: (nodeId: string, anchor: string) => void;
  onConnectionComplete?: (sourceNodeId: string, sourceAnchor: string, targetNodeId: string, targetAnchor: string) => void;
  onConnectionCancel?: () => void;
  onCanvasClick?: () => void;
  /** 是否启用视口裁剪（默认启用） */
  enableCulling?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function InfiniteCanvas({
  nodes,
  connections,
  viewport,
  selectedNodeIds,
  selectedConnectionIds = [],
  onViewportChange,
  onNodeSelect,
  onNodeDrag,
  onNodeMove,
  onNodeResize,
  onNodeResizeEnd,
  onNodeUpdateData,
  onConnectionSelect,
  onConnectionStart,
  onConnectionComplete,
  onConnectionCancel,
  onCanvasClick,
  enableCulling = true,
}: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Viewport transform hook
  const { state: viewportState, handlers: viewportHandlers } = useViewportTransform({
    viewport,
    onViewportChange,
    containerRef,
  });

  // Connection drag hook - enables drag-to-connect with mouse-follow preview
  const {
    pendingConnection,
    isConnecting: isDraggingConnection,
    startConnection: startDragConnection,
  } = useConnectionDrag({
    viewport,
    containerRef: containerRef as React.RefObject<HTMLElement>,
    onConnectionStart,
    onConnectionComplete,
    onConnectionCancel,
  });

  // Viewport culling - 只渲染可见节点
  const { visibleNodes, culledCount, totalCount } = useViewportCulling({
    nodes,
    viewport,
    containerWidth: containerSize.width,
    containerHeight: containerSize.height,
    enabled: enableCulling,
  });

  // Update container size on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setContainerSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Handle canvas click (deselect)
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // Only handle clicks on the canvas itself, not on nodes
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-canvas-background]')) {
      onCanvasClick?.();
    }
  }, [onCanvasClick]);

  // Cursor style based on state
  const getCursor = () => {
    if (viewportState.isPanning) return 'grabbing';
    if (isDraggingConnection) return 'crosshair';
    return 'default';
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ cursor: getCursor() }}
      onMouseDown={(e) => {
        viewportHandlers.onMouseDown(e);
        handleCanvasClick(e);
      }}
      onMouseMove={viewportHandlers.onMouseMove}
      onMouseUp={viewportHandlers.onMouseUp}
      onMouseLeave={viewportHandlers.onMouseLeave}
    >
      {/* Background grid */}
      <CanvasGrid
        viewport={viewport}
        width={containerSize.width}
        height={containerSize.height}
      />

      {/* Viewport transform layer */}
      <CanvasViewport viewport={viewport}>
        {/* Connection layer with pending connection preview */}
        <ConnectionLayer
          connections={connections}
          nodes={nodes}
          selectedConnectionIds={selectedConnectionIds}
          pendingConnection={pendingConnection}
          onConnectionSelect={onConnectionSelect}
        />

        {/* Node layer - 使用裁剪后的可见节点 */}
        {visibleNodes.map((node) => {
          const isSelected = selectedNodeIds.includes(node.id);

          return renderNode(node, viewport, isSelected, onNodeSelect, onNodeDrag, onNodeMove, onNodeResize, onNodeResizeEnd, onNodeUpdateData, startDragConnection);
        })}
      </CanvasViewport>

      {/* Canvas info overlay */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-500 pointer-events-none">
        {enableCulling && culledCount > 0 ? (
          <span>{visibleNodes.length} visible / {totalCount} total ({culledCount} culled)</span>
        ) : (
          <span>{nodes.length} nodes | {connections.length} connections</span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function renderNode(
  node: CanvasNode,
  viewport: ViewportType,
  isSelected: boolean,
  onSelect?: (nodeId: string, multi: boolean) => void,
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void,
  onMove?: (nodeId: string, position: { x: number; y: number }) => void,
  onResize?: (nodeId: string, size: { width: number; height: number }, position: { x: number; y: number }) => void,
  onResizeEnd?: (nodeId: string, size: { width: number; height: number }, position: { x: number; y: number }) => void,
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void,
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void,
): React.ReactNode {
  const commonProps = {
    viewport,
    isSelected,
    onSelect,
    onDrag,
    onMove,
    onResize,
    onResizeEnd,
    onConnectionStart,
    onUpdateData,
  };

  switch (node.type) {
    case 'media':
      return (
        <MediaNode
          key={node.id}
          node={node as MediaCanvasNode}
          {...commonProps}
        />
      );
    case 'storyboard':
      return (
        <StoryboardNode
          key={node.id}
          node={node as StoryboardCanvasNode}
          {...commonProps}
        />
      );
    case 'annotation':
      return (
        <AnnotationNode
          key={node.id}
          node={node as AnnotationCanvasNode}
          {...commonProps}
        />
      );
    case 'group':
      // Group node - render as a simple container for now
      return (
        <div
          key={node.id}
          className="absolute rounded-lg border-2 border-dashed"
          style={{
            left: node.position.x,
            top: node.position.y,
            width: node.size.width,
            height: node.size.height,
            zIndex: node.zIndex,
            borderColor: 'var(--node-border)',
            backgroundColor: 'var(--node-bg)',
            opacity: 0.3,
          }}
        >
          <div className="p-2 text-xs" style={{ color: 'var(--toolbar-fg-secondary)' }}>
            {node.data.label || 'Group'}
          </div>
        </div>
      );
    default:
      return null;
  }
}
