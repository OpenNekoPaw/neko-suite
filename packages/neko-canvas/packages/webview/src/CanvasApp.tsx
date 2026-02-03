import { useEffect, useState, useCallback, useRef } from 'react';
import type { CanvasData, CanvasViewport } from '@neko/shared';
import { useCanvasStore } from './stores/canvasStore';
import { InfiniteCanvas, ZoomControls, MiniMap } from './components';
import { MIN_ZOOM, MAX_ZOOM } from './hooks';

// Default canvas data for new files
const DEFAULT_CANVAS_DATA: CanvasData = {
  version: '1.0',
  name: 'Untitled Canvas',
  viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  nodes: [],
  connections: [],
};

// VSCode API type
declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

// Get VSCode API if available (in webview context)
const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

/**
 * Canvas App - Main application component
 */
export function CanvasApp() {
  const [isReady, setIsReady] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const {
    setCanvasData,
    canvasData,
    nodes,
    connections,
    viewport,
    selectedNodeIds,
    selectedConnectionIds,
    setViewport,
    zoomCanvas,
    resetViewport,
    selectNode,
    selectConnection,
    clearSelection,
    moveNode,
  } = useCanvasStore();

  // Track container size for MiniMap
  useEffect(() => {
    const container = canvasContainerRef.current;
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

    return () => resizeObserver.disconnect();
  }, []);

  // Initialize from VSCode or use default data
  useEffect(() => {
    if (vscode) {
      // Listen for messages from extension
      const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        switch (message.type) {
          case 'update':
            if (message.data) {
              setCanvasData(message.data as CanvasData);
            }
            setIsReady(true);
            break;
        }
      };

      window.addEventListener('message', handleMessage);

      // Signal ready to extension
      vscode.postMessage({ type: 'ready' });

      return () => {
        window.removeEventListener('message', handleMessage);
      };
    } else {
      // Development mode - use default data
      setCanvasData(DEFAULT_CANVAS_DATA);
      setIsReady(true);
    }
  }, [setCanvasData]);

  // Debounced save - prevent rapid consecutive saves
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDataRef = useRef<string | null>(null);

  // Save changes back to extension with debounce
  useEffect(() => {
    if (!vscode || !isReady || !canvasData) return;

    // Serialize current data for comparison
    const currentDataStr = JSON.stringify(canvasData);

    // Skip if data hasn't changed
    if (currentDataStr === lastSavedDataRef.current) return;

    // Clear pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save by 300ms
    saveTimeoutRef.current = setTimeout(() => {
      lastSavedDataRef.current = currentDataStr;
      vscode.postMessage({ type: 'save', data: canvasData });
    }, 300);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [canvasData, isReady]);

  // Viewport change handler
  const handleViewportChange = useCallback((partial: Partial<CanvasViewport>) => {
    setViewport(partial);
  }, [setViewport]);

  // Node selection handler
  const handleNodeSelect = useCallback((nodeId: string, multi: boolean) => {
    selectNode(nodeId, multi);
  }, [selectNode]);

  // Canvas click handler (deselect)
  const handleCanvasClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Node move handler
  const handleNodeMove = useCallback((nodeId: string, position: { x: number; y: number }) => {
    moveNode(nodeId, position);
  }, [moveNode]);

  // Connection selection handler
  const handleConnectionSelect = useCallback((connectionId: string) => {
    selectConnection(connectionId);
  }, [selectConnection]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(viewport.zoom * 1.2, MAX_ZOOM);
    zoomCanvas(newZoom);
  }, [viewport.zoom, zoomCanvas]);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(viewport.zoom / 1.2, MIN_ZOOM);
    zoomCanvas(newZoom);
  }, [viewport.zoom, zoomCanvas]);

  const handleZoomTo = useCallback((zoom: number) => {
    zoomCanvas(zoom);
  }, [zoomCanvas]);

  const handleFitContent = useCallback(() => {
    if (nodes.length === 0) {
      resetViewport();
      return;
    }

    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
    const newPanX = containerSize.width / 2 - centerX * newZoom;
    const newPanY = containerSize.height / 2 - centerY * newZoom;

    setViewport({ zoom: newZoom, pan: { x: newPanX, y: newPanY } });
  }, [nodes, containerSize, setViewport, resetViewport]);

  const handleResetViewport = useCallback(() => {
    resetViewport();
  }, [resetViewport]);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Loading canvas...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-10 bg-[#252526] border-b border-[#3c3c3c] flex items-center px-4 gap-2">
        <span className="text-sm text-gray-300">{canvasData?.name || 'Untitled Canvas'}</span>
        <span className="text-xs text-gray-500">
          {canvasData?.nodes.length || 0} nodes
        </span>
      </div>

      {/* Canvas Area */}
      <div ref={canvasContainerRef} className="flex-1 relative overflow-hidden bg-[#1e1e1e]">
        <InfiniteCanvas
          nodes={nodes}
          connections={connections}
          viewport={viewport}
          selectedNodeIds={selectedNodeIds}
          selectedConnectionIds={selectedConnectionIds}
          onViewportChange={handleViewportChange}
          onNodeSelect={handleNodeSelect}
          onNodeMove={handleNodeMove}
          onConnectionSelect={handleConnectionSelect}
          onCanvasClick={handleCanvasClick}
        />

        {/* Zoom Controls - Bottom Left */}
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

        {/* MiniMap - Bottom Right */}
        <div className="absolute bottom-4 right-4 z-10">
          <MiniMap
            nodes={nodes}
            viewport={viewport}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            onViewportChange={handleViewportChange}
          />
        </div>
      </div>

      {/* Status Bar */}
      <div className="h-6 bg-[#007acc] flex items-center px-4 text-xs text-white">
        <span>Zoom: {(viewport.zoom * 100).toFixed(0)}%</span>
        <span className="mx-2">|</span>
        <span>
          Pan: ({viewport.pan.x.toFixed(0)}, {viewport.pan.y.toFixed(0)})
        </span>
      </div>
    </div>
  );
}
