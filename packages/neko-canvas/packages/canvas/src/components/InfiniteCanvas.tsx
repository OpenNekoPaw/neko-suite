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
  onNodeMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onConnectionSelect?: (connectionId: string) => void;
  onCanvasClick?: () => void;
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
  onNodeMove,
  onConnectionSelect,
  onCanvasClick,
}: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Viewport transform hook
  const { state: viewportState, handlers: viewportHandlers } = useViewportTransform({
    viewport,
    onViewportChange,
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
      onWheel={viewportHandlers.onWheel}
    >
      {/* Background grid */}
      <CanvasGrid
        viewport={viewport}
        width={containerSize.width}
        height={containerSize.height}
      />

      {/* Viewport transform layer */}
      <CanvasViewport viewport={viewport}>
        {/* Connection layer */}
        <ConnectionLayer
          connections={connections}
          nodes={nodes}
          selectedConnectionIds={selectedConnectionIds}
          onConnectionSelect={onConnectionSelect}
        />

        {/* Node layer */}
        {nodes.map((node) => {
          const isSelected = selectedNodeIds.includes(node.id);

          return renderNode(node, viewport, isSelected, onNodeSelect, onNodeMove);
        })}
      </CanvasViewport>

      {/* Canvas info overlay */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-500 pointer-events-none">
        {nodes.length} nodes | {connections.length} connections
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
  onMove?: (nodeId: string, position: { x: number; y: number }) => void,
): React.ReactNode {
  const commonProps = {
    viewport,
    isSelected,
    onSelect,
    onMove,
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
          className="absolute rounded-lg border-2 border-dashed border-gray-600 bg-gray-800/30"
          style={{
            left: node.position.x,
            top: node.position.y,
            width: node.size.width,
            height: node.size.height,
            zIndex: node.zIndex,
          }}
        >
          <div className="p-2 text-xs text-gray-500">
            {node.data.label || 'Group'}
          </div>
        </div>
      );
    default:
      return null;
  }
}
