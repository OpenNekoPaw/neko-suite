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
  ShotCanvasNode,
  SceneGroupCanvasNode,
  GalleryCanvasNode,
  ScriptCanvasNode,
  DocumentCanvasNode,
  ModelCanvasNode,
} from '@neko/shared';
import { CanvasGrid } from './CanvasGrid';
import { CanvasViewport } from './CanvasViewport';
import {
  MediaNode,
  StoryboardNode,
  AnnotationNode,
  TextNode,
  ArtboardNode,
  GroupNode,
  ShotNode,
  SceneGroupNode,
  GalleryNode,
  ScriptNode,
  DocumentNode,
  ModelNode,
} from './nodes';
import { ConnectionLayer } from './connections';
import type { TextCanvasNode } from '../types/extendedCanvas';
import type { ArtboardCanvasNode } from '../types/extendedCanvas';
import { useViewportTransform } from '../hooks/useViewportTransform';
import { useViewportCulling } from '../hooks/useViewportCulling';
import { useConnectionDrag } from '../hooks/useConnectionDrag';
import { useMarqueeSelect } from '../hooks/useMarqueeSelect';

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
  onNodeResize?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  /** Called on mouseup when node resize ends */
  onNodeResizeEnd?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onNodeUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  /** Called on every mousemove during node rotation */
  onNodeRotate?: (nodeId: string, rotation: number) => void;
  /** Called on mouseup when node rotation ends */
  onNodeRotateEnd?: (nodeId: string, rotation: number) => void;
  onConnectionSelect?: (connectionId: string) => void;
  onConnectionStart?: (nodeId: string, anchor: string) => void;
  onConnectionComplete?: (
    sourceNodeId: string,
    sourceAnchor: string,
    targetNodeId: string,
    targetAnchor: string,
  ) => void;
  onConnectionCancel?: () => void;
  onCanvasClick?: () => void;
  /** Called when marquee selection completes */
  onMarqueeSelect?: (nodeIds: string[], additive: boolean) => void;
  /** 是否启用视口裁剪（默认启用） */
  enableCulling?: boolean;
  /** Hand tool: left-drag pans canvas instead of marquee-selecting */
  isPanMode?: boolean;

  // ── ScriptNode callbacks ───────────────────────────────────────────────────
  /** Called to load scene TOC from neko-story */
  onScriptLoadScenes?: (nodeId: string, scriptPath: string) => void;
  /** Called when user opens a script file */
  onScriptOpen?: (scriptPath: string) => void;
  /** Called when user navigates to a linked SceneGroupNode */
  onScriptNavigateToScene?: (linkedSceneGroupId: string) => void;

  // ── DocumentNode callbacks ─────────────────────────────────────────────────
  /** Called when user opens a document */
  onDocumentOpen?: (docPath: string) => void;

  // ── ModelNode callbacks ────────────────────────────────────────────────────
  /** Called to check if a model is installed */
  onModelCheckInstalled?: (nodeId: string, modelPath: string) => void;
  /** Called when a ShotNode candidate is selected */
  onSelectShotCandidate?: (nodeId: string, candidateId: string) => void;
  /** Called when selected shots should be attached to a scene */
  onAssignSelectedShotsToScene?: (sceneId: string) => void;
  /** Called to auto-layout the shots inside a scene */
  onAutoLayoutSceneShots?: (sceneId: string) => void;
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
  onNodeRotate,
  onNodeRotateEnd,
  onConnectionSelect,
  onConnectionStart,
  onConnectionComplete,
  onConnectionCancel,
  onCanvasClick,
  onMarqueeSelect,
  enableCulling = true,
  isPanMode = false,
  onScriptLoadScenes,
  onScriptOpen,
  onScriptNavigateToScene,
  onDocumentOpen,
  onModelCheckInstalled,
  onSelectShotCandidate,
  onAssignSelectedShotsToScene,
  onAutoLayoutSceneShots,
}: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Viewport transform hook
  const { state: viewportState, handlers: viewportHandlers } = useViewportTransform({
    viewport,
    onViewportChange,
    containerRef,
    isPanMode,
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

  // Marquee selection hook
  const {
    marqueeRect,
    isSelecting: isMarqueeSelecting,
    handlers: marqueeHandlers,
  } = useMarqueeSelect({
    viewport,
    containerRef: containerRef as React.RefObject<HTMLElement | null>,
    nodes,
    onSelect: onMarqueeSelect,
    enabled: !viewportState.isPanning && !isDraggingConnection && !isPanMode,
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
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // Only handle clicks on the canvas itself, not on nodes
      if (
        e.target === e.currentTarget ||
        (e.target as HTMLElement).closest('[data-canvas-background]')
      ) {
        onCanvasClick?.();
      }
    },
    [onCanvasClick],
  );

  // Cursor style based on state
  const getCursor = () => {
    if (viewportState.isPanning) return 'grabbing';
    if (isDraggingConnection) return 'crosshair';
    if (isMarqueeSelecting) return 'crosshair';
    if (isPanMode) return 'grab';
    return 'default';
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ cursor: getCursor() }}
      onMouseDown={(e) => {
        viewportHandlers.onMouseDown(e);
        marqueeHandlers.onMouseDown(e);
        handleCanvasClick(e);
      }}
      onMouseMove={(e) => {
        viewportHandlers.onMouseMove(e);
        marqueeHandlers.onMouseMove(e);
      }}
      onMouseUp={(e) => {
        viewportHandlers.onMouseUp();
        marqueeHandlers.onMouseUp(e);
      }}
      onMouseLeave={viewportHandlers.onMouseLeave}
    >
      {/* Background grid */}
      <CanvasGrid viewport={viewport} width={containerSize.width} height={containerSize.height} />

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

          return renderNode(
            node,
            nodes,
            viewport,
            isSelected,
            containerRef as React.RefObject<HTMLElement | null>,
            onNodeSelect,
            onNodeDrag,
            onNodeMove,
            onNodeResize,
            onNodeResizeEnd,
            onNodeRotate,
            onNodeRotateEnd,
            onNodeUpdateData,
            startDragConnection,
            onScriptLoadScenes,
            onScriptOpen,
            onScriptNavigateToScene,
            onDocumentOpen,
            onModelCheckInstalled,
            onSelectShotCandidate,
            onAssignSelectedShotsToScene,
            onAutoLayoutSceneShots,
            selectedNodeIds,
          );
        })}
      </CanvasViewport>

      {/* Marquee selection rectangle */}
      {marqueeRect && (
        <div
          className="absolute pointer-events-none z-50"
          style={{
            left: marqueeRect.x - (containerRef.current?.getBoundingClientRect().left ?? 0),
            top: marqueeRect.y - (containerRef.current?.getBoundingClientRect().top ?? 0),
            width: marqueeRect.width,
            height: marqueeRect.height,
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.6)',
            borderRadius: 2,
          }}
        />
      )}

      {/* Canvas info overlay */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-500 pointer-events-none">
        {enableCulling && culledCount > 0 ? (
          <span>
            {visibleNodes.length} visible / {totalCount} total ({culledCount} culled)
          </span>
        ) : (
          <span>
            {nodes.length} nodes | {connections.length} connections
          </span>
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
  allNodes: CanvasNode[],
  viewport: ViewportType,
  isSelected: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  onSelect?: (nodeId: string, multi: boolean) => void,
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void,
  onMove?: (nodeId: string, position: { x: number; y: number }) => void,
  onResize?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void,
  onResizeEnd?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void,
  onRotate?: (nodeId: string, rotation: number) => void,
  onRotateEnd?: (nodeId: string, rotation: number) => void,
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void,
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void,
  onScriptLoadScenes?: (nodeId: string, scriptPath: string) => void,
  onScriptOpen?: (scriptPath: string) => void,
  onScriptNavigateToScene?: (linkedSceneGroupId: string) => void,
  onDocumentOpen?: (docPath: string) => void,
  onModelCheckInstalled?: (nodeId: string, modelPath: string) => void,
  onSelectShotCandidate?: (nodeId: string, candidateId: string) => void,
  onAssignSelectedShotsToScene?: (sceneId: string) => void,
  onAutoLayoutSceneShots?: (sceneId: string) => void,
  selectedNodeIds: string[] = [],
): React.ReactNode {
  const commonProps = {
    viewport,
    isSelected,
    containerRef,
    onSelect,
    onDrag,
    onMove,
    onResize,
    onResizeEnd,
    onRotate,
    onRotateEnd,
    onConnectionStart,
    onUpdateData,
  };

  const nodeType = node.type as string;
  switch (nodeType) {
    case 'media':
      return <MediaNode key={node.id} node={node as MediaCanvasNode} {...commonProps} />;
    case 'storyboard':
      return <StoryboardNode key={node.id} node={node as StoryboardCanvasNode} {...commonProps} />;
    case 'annotation':
      return <AnnotationNode key={node.id} node={node as AnnotationCanvasNode} {...commonProps} />;
    case 'text':
      return (
        <TextNode
          key={node.id}
          node={node as unknown as TextCanvasNode}
          {...commonProps}
          onContentChange={(nodeId, content) => onUpdateData?.(nodeId, { content })}
          onStyleChange={(nodeId, style) => onUpdateData?.(nodeId, { style })}
        />
      );
    case 'artboard':
      return (
        <ArtboardNode key={node.id} node={node as unknown as ArtboardCanvasNode} {...commonProps} />
      );
    case 'group':
      return (
        <GroupNode
          key={node.id}
          node={node as import('@neko/shared').GroupCanvasNode}
          allNodes={allNodes}
          {...commonProps}
        />
      );
    case 'shot':
      return (
        <ShotNode
          key={node.id}
          node={node as ShotCanvasNode}
          {...commonProps}
          onSelectCandidate={onSelectShotCandidate}
        />
      );
    case 'scene':
      return (
        <SceneGroupNode
          key={node.id}
          node={node as SceneGroupCanvasNode}
          {...commonProps}
          selectedShotCount={allNodes.filter((candidate) => selectedNodeIds.includes(candidate.id) && candidate.type === 'shot').length}
          onAssignSelectedShots={onAssignSelectedShotsToScene}
          onAutoLayoutShots={onAutoLayoutSceneShots}
        />
      );
    case 'gallery':
      return <GalleryNode key={node.id} node={node as GalleryCanvasNode} {...commonProps} />;
    case 'script':
      return (
        <ScriptNode
          key={node.id}
          node={node as ScriptCanvasNode}
          {...commonProps}
          onLoadScenes={onScriptLoadScenes}
          onOpenScript={onScriptOpen}
          onNavigateToScene={onScriptNavigateToScene}
        />
      );
    case 'document':
      return (
        <DocumentNode
          key={node.id}
          node={node as DocumentCanvasNode}
          {...commonProps}
          onOpenDocument={onDocumentOpen}
        />
      );
    case 'model':
      return (
        <ModelNode
          key={node.id}
          node={node as ModelCanvasNode}
          {...commonProps}
          onCheckInstalled={onModelCheckInstalled}
        />
      );
    default:
      return null;
  }
}
