/**
 * InfiniteCanvas - Main canvas component
 * Provides infinite pan/zoom canvas with grid background
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import type { CanvasNode, CanvasConnection, CanvasViewport as ViewportType } from '@neko/shared';
import { CanvasGrid } from './CanvasGrid';
import { CanvasViewport } from './CanvasViewport';
import { renderCanvasNode } from './nodes';
import type { NodeRendererRegistry } from './nodes';
import type { NodeTypeDescriptorRegistry } from './nodes/nodeTypeDescriptor';
import { ConnectionLayer, InlineConnectionEditor } from './connections';
import { useViewportTransform } from '../hooks/useViewportTransform';
import { useViewportCulling } from '../hooks/useViewportCulling';
import { useConnectionDrag } from '../hooks/useConnectionDrag';
import { useMarqueeSelect } from '../hooks/useMarqueeSelect';
import { isNodeDrawnInsideContainer } from '../utils/canvasOrganization';
import { createBuiltInWebviewSubsystemRegistry } from '../subsystems';

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
  onConnectionUpdate?: (connectionId: string, updates: Partial<CanvasConnection>) => void;
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
  /** Spacebar-hold pan mode, owned by the Canvas root keyboard dispatcher. */
  isSpacePanActive?: boolean;

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
  /** Called when user opens an embedded canvas */
  onCanvasEmbedOpen?: (canvasPath: string) => void;

  // ── ModelNode callbacks ────────────────────────────────────────────────────
  /** Called to check if a model is installed */
  onModelCheckInstalled?: (nodeId: string, modelPath: string) => void;
  /** Called to remove a child node from its container */
  onRemoveContainerChild?: (containerId: string, childId: string) => void;
  expandedNodeId?: string | null;
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
  onConnectionUpdate,
  onConnectionStart,
  onConnectionComplete,
  onConnectionCancel,
  onCanvasClick,
  onMarqueeSelect,
  enableCulling = true,
  isPanMode = false,
  isSpacePanActive = false,
  onScriptLoadScenes,
  onScriptOpen,
  onScriptNavigateToScene,
  onDocumentOpen,
  onCanvasEmbedOpen,
  onModelCheckInstalled,
  onRemoveContainerChild,
  expandedNodeId,
}: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const webviewSubsystemRegistryRef = useRef(createBuiltInWebviewSubsystemRegistry());
  const [nodeRendererRegistry, setNodeRendererRegistry] = useState<NodeRendererRegistry>({});
  const [nodeTypeDescriptorRegistry, setNodeTypeDescriptorRegistry] =
    useState<NodeTypeDescriptorRegistry>(() =>
      webviewSubsystemRegistryRef.current.getCoreNodeTypeDescriptors(),
    );
  const activeSubsystemKey = webviewSubsystemRegistryRef.current
    .getActiveSubsystems({ nodes })
    .join('|');

  // Viewport transform hook
  const { state: viewportState, handlers: viewportHandlers } = useViewportTransform({
    viewport,
    onViewportChange,
    containerRef,
    isPanMode,
    isSpacePanActive,
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

  useEffect(() => {
    let cancelled = false;

    webviewSubsystemRegistryRef.current
      .loadForCanvas({ nodes })
      .then((registrations) => {
        if (cancelled) return;

        const nextRegistry: NodeRendererRegistry = {};
        for (const registration of registrations) {
          Object.assign(nextRegistry, registration.nodeRenderers);
        }
        setNodeRendererRegistry(nextRegistry);
        setNodeTypeDescriptorRegistry({
          ...webviewSubsystemRegistryRef.current.getCoreNodeTypeDescriptors(),
          ...Object.assign(
            {},
            ...registrations.map((registration) => registration.nodeTypeDescriptors),
          ),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setNodeRendererRegistry({});
          setNodeTypeDescriptorRegistry(
            webviewSubsystemRegistryRef.current.getCoreNodeTypeDescriptors(),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSubsystemKey, nodes]);

  // Handle canvas click (deselect)
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // Only handle clicks on the canvas itself, not on nodes
      if (
        e.target === e.currentTarget ||
        (e.target as HTMLElement).hasAttribute('data-canvas-viewport-layer') ||
        (e.target as HTMLElement).closest('[data-canvas-background]')
      ) {
        containerRef.current?.focus();
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
    if (isPanMode || isSpacePanActive) return 'grab';
    return 'default';
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ cursor: getCursor() }}
      {...getKeyboardBoundaryMetadata({
        scope: 'viewport',
        ownerId: 'canvas-viewport',
        priority: 0,
      })}
      tabIndex={-1}
      onMouseDown={(e) => {
        if (
          e.target === e.currentTarget ||
          (e.target as HTMLElement).hasAttribute('data-canvas-viewport-layer') ||
          (e.target as HTMLElement).closest('[data-canvas-background]')
        ) {
          e.currentTarget.focus();
        }
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

        <InlineConnectionEditor
          connection={
            selectedConnectionIds.length === 1
              ? (connections.find((connection) => connection.id === selectedConnectionIds[0]) ??
                null)
              : null
          }
          nodes={nodes}
          onUpdateConnection={(connectionId, updates) =>
            onConnectionUpdate?.(connectionId, updates)
          }
        />

        {/* Node layer - 使用裁剪后的可见节点; container-managed children are summarized by containers */}
        {visibleNodes
          .filter((node) => !isNodeDrawnInsideContainer(node))
          .map((node) => {
            const isSelected = selectedNodeIds.includes(node.id);

            return renderNode(nodeRendererRegistry, {
              node,
              allNodes: nodes,
              viewport,
              isSelected,
              containerRef: containerRef as React.RefObject<HTMLElement | null>,
              onSelect: onNodeSelect,
              onDrag: onNodeDrag,
              onMove: onNodeMove,
              onResize: onNodeResize,
              onResizeEnd: onNodeResizeEnd,
              onRotate: onNodeRotate,
              onRotateEnd: onNodeRotateEnd,
              onUpdateData: onNodeUpdateData,
              onConnectionStart: startDragConnection,
              onScriptLoadScenes,
              onScriptOpen,
              onScriptNavigateToScene,
              onDocumentOpen,
              onCanvasEmbedOpen,
              onModelCheckInstalled,
              onRemoveContainerChild,
              isExpanded: expandedNodeId === node.id,
              selectedNodeIds,
              nodeTypeDescriptors: nodeTypeDescriptorRegistry,
            });
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
  registry: NodeRendererRegistry,
  context: Parameters<typeof renderCanvasNode>[1],
): React.ReactNode {
  return renderCanvasNode(registry, context);
}
