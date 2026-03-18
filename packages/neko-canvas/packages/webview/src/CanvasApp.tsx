import { useEffect, useState, useCallback, useRef } from 'react';
import type { CanvasData, CanvasViewport } from '@neko/shared';
import { useCanvasStore } from './stores/canvasStore';
import { InfiniteCanvas, ZoomControls, MiniMap } from './components';
import { ContextMenu } from './components/common/ContextMenu';
import { CanvasToolbar } from './components/toolbar/CanvasToolbar';
import { PropertyPanel } from './components/panels/PropertyPanel';
import { LayerPanel } from './components/controls/LayerPanel';
import { MIN_ZOOM, MAX_ZOOM } from './hooks';
import { useVSCodeMessages } from './hooks/useVSCodeMessages';
import { useNodeHelpers } from './hooks/useNodeHelpers';
import { useClipboard } from './hooks/useClipboard';
import { useKeyboardActions } from './hooks/useKeyboardActions';
import { useDragDrop } from './hooks/useDragDrop';
import { useContextMenu } from './hooks/useContextMenu';
import type { VSCodeAPI } from './hooks/useVSCodeMessages';
import {
  screenToCanvas as screenToCanvasMath,
  getViewportCenter as getViewportCenterMath,
} from './utils/viewportMath';
import { t } from './i18n';

// =============================================================================
// Constants & VSCode API
// =============================================================================

const DEFAULT_CANVAS_DATA: CanvasData = {
  version: '1.0',
  name: 'Untitled Canvas',
  viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  nodes: [],
  connections: [],
};

declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

// Get VSCode API if available (in webview context)
const vscode: VSCodeAPI = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

// Expose on window so child components (e.g. MediaNode) can postMessage
if (vscode) {
  (window as unknown as Record<string, unknown>).vscode = vscode;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Canvas App - Main application component (orchestrator)
 */
export function CanvasApp() {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Panel state
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false);
  const [isPropertyPanelOpen, setIsPropertyPanelOpen] = useState(true);
  const [propertyPanelWidth, setPropertyPanelWidth] = useState(240);

  // Horizontal resize for PropertyPanel
  const [isHResizing, setIsHResizing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleHResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsHResizing(true);
  }, []);

  const handleHResizeMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isHResizing || !rootRef.current) return;
      const rootRect = rootRef.current.getBoundingClientRect();
      const newWidth = Math.max(200, Math.min(400, rootRect.right - e.clientX));
      setPropertyPanelWidth(newWidth);
    },
    [isHResizing],
  );

  const handleHResizeEnd = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setIsHResizing(false);
  }, []);

  const {
    setCanvasData,
    canvasData,
    selection,
    setViewport,
    zoomCanvas,
    resetViewport,
    selectNode,
    selectConnection,
    clearSelection,
    moveNode,
    addNode,
    deleteSelected,
    updateNodeData,
    startConnection,
    completeConnection,
    cancelConnection,
    isConnecting,
    undo,
    redo,
    moveNodeEnd,
    resizeNode,
    resizeNodeEnd,
    rotateNode,
    rotateNodeEnd,
    selectNodes,
    updateNodePorts,
    updateConnection,
    reorderNode,
    removeNode,
    groupNodes,
    ungroupNodes,
  } = useCanvasStore();

  // Derive computed values from canvasData
  const nodes = canvasData?.nodes ?? [];
  const connections = canvasData?.connections ?? [];
  const viewport = canvasData?.viewport ?? { pan: { x: 0, y: 0 }, zoom: 1 };
  const selectedNodeIds = selection.nodeIds;
  const selectedConnectionIds = selection.connectionIds;

  // =========================================================================
  // Container size tracking
  // =========================================================================

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const updateSize = () => {
      setContainerSize({ width: container.clientWidth, height: container.clientHeight });
    };
    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // =========================================================================
  // Coordinate conversion (wrapping pure utils with container ref)
  // =========================================================================

  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      const container = canvasContainerRef.current;
      if (!container) return { x: 0, y: 0 };
      return screenToCanvasMath(screenX, screenY, viewport, container.getBoundingClientRect());
    },
    [viewport],
  );

  const getViewportCenter = useCallback(
    () => getViewportCenterMath(containerSize.width, containerSize.height, viewport),
    [containerSize, viewport],
  );

  // =========================================================================
  // Report action to extension
  // =========================================================================

  const reportAction = useCallback((action: string, label: string, detail?: string) => {
    if (!vscode) return;
    vscode.postMessage({ type: 'canvasAction', action, label, detail });
  }, []);

  // =========================================================================
  // Node helpers
  // =========================================================================

  const { addTextAt, addSceneAt, addMediaAt } = useNodeHelpers({
    addNode,
    nodeCount: nodes.length,
    reportAction,
  });

  // =========================================================================
  // Clipboard
  // =========================================================================

  const { handleCopy, handleCut, handlePaste, handlePasteInPlace, handleDuplicate } = useClipboard({
    selectedNodeIds,
    nodes,
    connections,
    deleteSelected,
  });

  // =========================================================================
  // Media add handlers (toolbar / extension)
  // =========================================================================

  const handleAddText = useCallback(() => {
    addTextAt(getViewportCenter());
  }, [addTextAt, getViewportCenter]);

  const handleAddScene = useCallback(() => {
    addSceneAt(getViewportCenter());
  }, [addSceneAt, getViewportCenter]);

  const handleAddMediaFromExtension = useCallback(
    (mediaType: string, uri: string, name: string) => {
      addMediaAt(getViewportCenter(), mediaType as 'image' | 'video' | 'audio', uri, name);
    },
    [addMediaAt, getViewportCenter],
  );

  const handleAddMedia = useCallback(
    (type: 'image' | 'video' | 'audio') => {
      if (vscode) {
        vscode.postMessage({ type: 'pickMedia', mediaType: type });
      } else {
        addMediaAt(getViewportCenter(), type);
      }
    },
    [addMediaAt, getViewportCenter],
  );

  // =========================================================================
  // Drag & Drop
  // =========================================================================

  const { isDragOver, dropPositionRef, handleDragOver, handleDragLeave, handleDrop } = useDragDrop({
    vscode,
    canvasContainerRef,
    screenToCanvas,
    addMediaAt,
  });

  // =========================================================================
  // VSCode messages
  // =========================================================================

  const { isReady, keyboardActionRef } = useVSCodeMessages({
    vscode,
    defaultCanvasData: DEFAULT_CANVAS_DATA,
    setCanvasData,
    onAddMediaFromExtension: handleAddMediaFromExtension,
    onDropMedia: (files) => {
      const pos = dropPositionRef.current ?? getViewportCenter();
      files.forEach((file, i) => {
        const offset = i * 30;
        addMediaAt(
          { x: pos.x + offset, y: pos.y + offset },
          file.mediaType as 'image' | 'video' | 'audio',
          file.uri,
          file.name,
        );
      });
      dropPositionRef.current = null;
    },
  });

  // =========================================================================
  // Context menu
  // =========================================================================

  const handleGroup = useCallback(() => {
    if (selectedNodeIds.length >= 2) {
      groupNodes(selectedNodeIds);
    }
  }, [selectedNodeIds, groupNodes]);

  const handleUngroup = useCallback(() => {
    if (selectedNodeIds.length === 1) {
      ungroupNodes(selectedNodeIds[0]!);
    }
  }, [selectedNodeIds, ungroupNodes]);

  const { contextMenu, setContextMenu, handleContextMenu, closeContextMenu } = useContextMenu({
    selectedNodeIds,
    nodes,
    screenToCanvas,
    addTextAt,
    addSceneAt,
    handleAddMedia,
    deleteSelected,
    handleFitContent,
    handleResetViewport,
    handleCopy,
    handleCut,
    handlePaste,
    handlePasteInPlace,
    handleDuplicate,
    handleGroup,
    handleUngroup,
    undo,
    redo,
  });

  // =========================================================================
  // Keyboard actions
  // =========================================================================

  const { handleKeyboardAction } = useKeyboardActions({
    vscode,
    selectedNodeIds,
    selectedConnectionIds,
    nodes,
    isConnecting,
    contextMenu,
    setContextMenu: () => setContextMenu(null),
    selectNode,
    selectConnection,
    deleteSelected,
    cancelConnection,
    clearSelection,
    resetViewport,
    undo,
    redo,
    handleCopy,
    handleCut,
    handlePaste,
    handlePasteInPlace,
    handleDuplicate,
    reportAction,
  });

  // Keep ref in sync with latest handler (for VSCode message dispatch)
  keyboardActionRef.current = handleKeyboardAction;

  // =========================================================================
  // Debounced save
  // =========================================================================

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDataRef = useRef<string | null>(null);

  useEffect(() => {
    if (!vscode || !isReady || !canvasData) return;
    const currentDataStr = JSON.stringify(canvasData);
    if (currentDataStr === lastSavedDataRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      lastSavedDataRef.current = currentDataStr;
      vscode.postMessage({ type: 'save', data: canvasData });
    }, 300);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [canvasData, isReady]);

  // =========================================================================
  // Sync status to extension
  // =========================================================================

  const lastSyncRef = useRef<string>('');
  useEffect(() => {
    if (!vscode || !canvasData) return;
    const fingerprint = `${nodes.length}:${connections.length}:${viewport.zoom.toFixed(2)}:${selectedNodeIds.join(',')}`;
    if (fingerprint === lastSyncRef.current) return;
    lastSyncRef.current = fingerprint;
    vscode.postMessage({
      type: 'canvasStatus',
      data: {
        nodes: canvasData.nodes,
        connections: canvasData.connections,
        viewport: canvasData.viewport,
        _selection: { nodeIds: selectedNodeIds },
      },
    });
  }, [nodes.length, connections.length, viewport.zoom, selectedNodeIds, canvasData]);

  // =========================================================================
  // Viewport & node event handlers (thin wrappers)
  // =========================================================================

  const handleViewportChange = useCallback(
    (partial: Partial<CanvasViewport>) => setViewport(partial),
    [setViewport],
  );
  const handleNodeSelect = useCallback(
    (nodeId: string, multi: boolean) => selectNode(nodeId, multi),
    [selectNode],
  );
  const handleCanvasClick = useCallback(() => {
    setContextMenu(null);
    if (isConnecting) cancelConnection();
    else clearSelection();
  }, [isConnecting, cancelConnection, clearSelection, setContextMenu]);
  const handleNodeDrag = useCallback(
    (nodeId: string, position: { x: number; y: number }) => moveNode(nodeId, position),
    [moveNode],
  );
  const handleNodeMove = useCallback(
    (nodeId: string, position: { x: number; y: number }) => moveNodeEnd(nodeId, position),
    [moveNodeEnd],
  );
  const handleNodeResize = useCallback(
    (nodeId: string, size: { width: number; height: number }, position: { x: number; y: number }) =>
      resizeNode(nodeId, size, position),
    [resizeNode],
  );
  const handleNodeResizeEnd = useCallback(
    (nodeId: string, size: { width: number; height: number }, position: { x: number; y: number }) =>
      resizeNodeEnd(nodeId, size, position),
    [resizeNodeEnd],
  );
  const handleNodeRotate = useCallback(
    (nodeId: string, rotation: number) => rotateNode(nodeId, rotation),
    [rotateNode],
  );
  const handleNodeRotateEnd = useCallback(
    (nodeId: string, rotation: number) => rotateNodeEnd(nodeId, rotation),
    [rotateNodeEnd],
  );
  const handleConnectionSelect = useCallback(
    (connectionId: string) => selectConnection(connectionId),
    [selectConnection],
  );
  const handleNodeUpdateData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => updateNodeData(nodeId, data),
    [updateNodeData],
  );
  const handleConnectionStart = useCallback(
    (nodeId: string, anchor: string) => startConnection(nodeId, anchor),
    [startConnection],
  );
  const handleConnectionComplete = useCallback(
    (sourceNodeId: string, sourceAnchor: string, targetNodeId: string, targetAnchor: string) => {
      startConnection(sourceNodeId, sourceAnchor);
      completeConnection(targetNodeId, targetAnchor);
    },
    [startConnection, completeConnection],
  );
  const handleConnectionCancel = useCallback(() => cancelConnection(), [cancelConnection]);
  const handleMarqueeSelect = useCallback(
    (nodeIds: string[], additive: boolean) => {
      if (additive) {
        // Merge with existing selection
        const existing = new Set(selection.nodeIds);
        for (const id of nodeIds) existing.add(id);
        selectNodes(Array.from(existing));
      } else {
        selectNodes(nodeIds);
      }
    },
    [selection.nodeIds, selectNodes],
  );

  // =========================================================================
  // Zoom handlers
  // =========================================================================

  const handleZoomIn = useCallback(() => {
    zoomCanvas(Math.min(viewport.zoom * 1.2, MAX_ZOOM));
  }, [viewport.zoom, zoomCanvas]);

  const handleZoomOut = useCallback(() => {
    zoomCanvas(Math.max(viewport.zoom / 1.2, MIN_ZOOM));
  }, [viewport.zoom, zoomCanvas]);

  const handleZoomTo = useCallback((zoom: number) => zoomCanvas(zoom), [zoomCanvas]);

  function handleFitContent() {
    if (nodes.length === 0) {
      resetViewport();
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + node.size.width);
      maxY = Math.max(maxY, node.position.y + node.size.height);
    }
    const contentWidth = maxX - minX + 100;
    const contentHeight = maxY - minY + 100;
    const scaleX = containerSize.width / contentWidth;
    const scaleY = containerSize.height / contentHeight;
    const newZoom = Math.min(scaleX, scaleY, 1);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setViewport({
      zoom: newZoom,
      pan: {
        x: containerSize.width / 2 - centerX * newZoom,
        y: containerSize.height / 2 - centerY * newZoom,
      },
    });
  }

  function handleResetViewport() {
    resetViewport();
  }

  // =========================================================================
  // Property panel helpers
  // =========================================================================

  const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));
  const selectedConnections = connections.filter((c) => selectedConnectionIds.includes(c.id));

  const handleUpdateNode = useCallback(
    (id: string, updates: Partial<import('@neko/shared').CanvasNode>) => {
      useCanvasStore.getState().updateNode(id, updates);
    },
    [],
  );
  const handleToggleLock = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (node) useCanvasStore.getState().updateNode(id, { locked: !node.locked });
    },
    [nodes],
  );
  const handleDeleteNode = useCallback((id: string) => {
    useCanvasStore.getState().removeNode(id);
  }, []);

  // =========================================================================
  // Render
  // =========================================================================

  if (!isReady) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ backgroundColor: 'var(--canvas-bg)' }}
      >
        <div style={{ color: 'var(--toolbar-fg-secondary)' }}>{t('loading')}</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Top bar */}
      <div
        className="h-9 flex items-center px-3 gap-2 shrink-0"
        style={{
          backgroundColor: 'var(--titlebar-bg)',
          borderBottom: '1px solid var(--titlebar-border)',
          color: 'var(--titlebar-fg)',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity={0.6}
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </svg>
        <span className="text-xs font-medium" style={{ color: 'var(--titlebar-fg)' }}>
          {canvasData?.name || 'Untitled Canvas'}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded-sm"
          style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--badge-fg)', fontSize: 10 }}
        >
          {nodes.length}
        </span>
      </div>

      {/* Main content area */}
      <div ref={rootRef} className="flex-1 flex overflow-hidden">
        <CanvasToolbar
          onAddText={handleAddText}
          onAddScene={handleAddScene}
          onAddMedia={handleAddMedia}
          onUndo={undo}
          onRedo={redo}
          onToggleLayerPanel={() => setIsLayerPanelOpen((prev) => !prev)}
          isLayerPanelOpen={isLayerPanelOpen}
          onTogglePropertyPanel={() => setIsPropertyPanelOpen((prev) => !prev)}
          isPropertyPanelOpen={isPropertyPanelOpen}
        />

        {isLayerPanelOpen && (
          <div className="w-[200px] flex-shrink-0">
            <LayerPanel
              nodes={nodes}
              selectedNodeIds={selectedNodeIds}
              onSelectNode={handleNodeSelect}
              onReorderNode={reorderNode}
              onToggleLock={handleToggleLock}
              onDeleteNode={removeNode}
            />
          </div>
        )}

        <div
          ref={canvasContainerRef}
          className="flex-1 relative overflow-hidden"
          style={{ backgroundColor: 'var(--canvas-bg)' }}
          onContextMenu={handleContextMenu}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <InfiniteCanvas
            nodes={nodes}
            connections={connections}
            viewport={viewport}
            selectedNodeIds={selectedNodeIds}
            selectedConnectionIds={selectedConnectionIds}
            onViewportChange={handleViewportChange}
            onNodeSelect={handleNodeSelect}
            onNodeDrag={handleNodeDrag}
            onNodeMove={handleNodeMove}
            onNodeResize={handleNodeResize}
            onNodeResizeEnd={handleNodeResizeEnd}
            onNodeRotate={handleNodeRotate}
            onNodeRotateEnd={handleNodeRotateEnd}
            onNodeUpdateData={handleNodeUpdateData}
            onConnectionSelect={handleConnectionSelect}
            onConnectionStart={handleConnectionStart}
            onConnectionComplete={handleConnectionComplete}
            onConnectionCancel={handleConnectionCancel}
            onCanvasClick={handleCanvasClick}
            onMarqueeSelect={handleMarqueeSelect}
          />

          {/* Empty state hint */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center" style={{ color: 'var(--toolbar-fg-secondary)' }}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="mx-auto mb-3 opacity-40"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M12 8v8" />
                  <path d="M8 12h8" />
                </svg>
                <p className="text-sm opacity-60">{t('empty.hint')}</p>
                <p className="text-xs opacity-40 mt-1">{t('empty.zoom')}</p>
              </div>
            </div>
          )}

          <div className="absolute bottom-4 left-4 z-10">
            <ZoomControls
              zoom={viewport.zoom}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onZoomTo={handleZoomTo}
              onFitContent={handleFitContent}
              onResetViewport={handleResetViewport}
            />
          </div>

          <div className="absolute bottom-4 right-4 z-10">
            <MiniMap
              nodes={nodes}
              viewport={viewport}
              containerWidth={containerSize.width}
              containerHeight={containerSize.height}
              onViewportChange={handleViewportChange}
            />
          </div>

          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={contextMenu.items}
              onClose={closeContextMenu}
            />
          )}

          {isDragOver && (
            <div
              className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
              style={{
                backgroundColor: 'rgba(0, 120, 212, 0.08)',
                border: '2px dashed var(--node-selected)',
                borderRadius: 4,
              }}
            >
              <div
                className="px-4 py-2 rounded-lg text-sm"
                style={{
                  backgroundColor: 'var(--toolbar-bg)',
                  color: 'var(--toolbar-fg)',
                  border: '1px solid var(--toolbar-border)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}
              >
                {t('canvas.dropHint')}
              </div>
            </div>
          )}

          {/* Connection hint overlay */}
          {isConnecting && (
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded text-xs pointer-events-none animate-pulse"
              style={{
                backgroundColor: 'var(--toolbar-bg)',
                color: 'var(--toolbar-fg)',
                border: '1px solid var(--toolbar-border)',
              }}
            >
              {t('status.connecting')}
            </div>
          )}
        </div>

        {isPropertyPanelOpen && (
          <>
            {/* Horizontal Resize Handle */}
            <div
              onPointerDown={handleHResizeStart}
              onPointerMove={handleHResizeMove}
              onPointerUp={handleHResizeEnd}
              className={`w-1 flex-shrink-0 cursor-ew-resize border-l border-vscode-panel-border transition-colors ${
                isHResizing ? 'bg-vscode-accent' : 'hover:bg-vscode-accent/50'
              }`}
              style={{ touchAction: 'none' }}
            />
            <PropertyPanel
              selectedNodes={selectedNodes}
              selectedConnections={selectedConnections}
              onUpdateNode={handleUpdateNode}
              onUpdateNodeData={handleNodeUpdateData}
              onUpdateConnection={updateConnection}
              onUpdatePorts={updateNodePorts}
              onDeleteNode={handleDeleteNode}
              onToggleLock={handleToggleLock}
              width={propertyPanelWidth}
            />
          </>
        )}
      </div>
    </div>
  );
}
