import { useEffect, useState, useCallback, useRef } from 'react';
import type { CanvasData, CanvasViewport } from '@neko/shared';
import { useCanvasStore } from './stores/canvasStore';
import { InfiniteCanvas, ZoomControls, MiniMap } from './components';
import { ContextMenu, buildCanvasMenuItems, buildNodeMenuItems } from './components/common/ContextMenu';
import type { MenuEntry } from './components/common/ContextMenu';
import { MIN_ZOOM, MAX_ZOOM } from './hooks';
import { t, setLocale, detectLocale } from './i18n';

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

// Initialize locale
setLocale(detectLocale());

/**
 * Canvas App - Main application component
 */
export function CanvasApp() {
  const [isReady, setIsReady] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: MenuEntry[];
  } | null>(null);

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
  } = useCanvasStore();

  // Derive computed values from canvasData
  const nodes = canvasData?.nodes ?? [];
  const connections = canvasData?.connections ?? [];
  const viewport = canvasData?.viewport ?? { pan: { x: 0, y: 0 }, zoom: 1 };
  const selectedNodeIds = selection.nodeIds;
  const selectedConnectionIds = selection.connectionIds;

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

  // Keyboard action handler (called from extension via postMessage)
  const handleKeyboardAction = useCallback((action: string) => {
    switch (action) {
      case 'deleteSelected':
        if (selectedNodeIds.length > 0 || selectedConnectionIds.length > 0) {
          deleteSelected();
        }
        break;
      case 'escape':
        if (contextMenu) {
          setContextMenu(null);
        } else if (isConnecting) {
          cancelConnection();
        } else {
          clearSelection();
        }
        break;
      case 'selectAll':
        if (nodes.length > 0) {
          const { selectNodes } = useCanvasStore.getState();
          selectNodes(nodes.map(n => n.id));
        }
        break;
      case 'undo':
      case 'redo':
        break;
    }
  }, [selectedNodeIds, selectedConnectionIds, deleteSelected, isConnecting, cancelConnection, clearSelection, nodes, contextMenu]);

  // Keep a ref to the latest handler
  const keyboardActionRef = useRef(handleKeyboardAction);
  keyboardActionRef.current = handleKeyboardAction;

  // Initialize from VSCode or use default data
  useEffect(() => {
    if (vscode) {
      const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        switch (message.type) {
          case 'update':
            if (message.data) {
              setCanvasData(message.data as CanvasData);
            }
            setIsReady(true);
            break;
          case 'keyboardAction':
            keyboardActionRef.current(message.action as string);
            break;
          case 'setLocale':
            setLocale(message.locale as string);
            break;
          case 'addMedia':
            // Extension sends media file info to add to canvas
            handleAddMediaFromExtension(message.mediaType as string, message.uri as string, message.name as string);
            break;
        }
      };

      window.addEventListener('message', handleMessage);
      vscode.postMessage({ type: 'ready' });

      return () => {
        window.removeEventListener('message', handleMessage);
      };
    } else {
      setCanvasData(DEFAULT_CANVAS_DATA);
      setIsReady(true);
    }
  }, [setCanvasData]);

  // Debounced save
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDataRef = useRef<string | null>(null);

  useEffect(() => {
    if (!vscode || !isReady || !canvasData) return;

    const currentDataStr = JSON.stringify(canvasData);
    if (currentDataStr === lastSavedDataRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

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

  // =========================================================================
  // Viewport helpers
  // =========================================================================

  const handleViewportChange = useCallback((partial: Partial<CanvasViewport>) => {
    setViewport(partial);
  }, [setViewport]);

  const handleNodeSelect = useCallback((nodeId: string, multi: boolean) => {
    selectNode(nodeId, multi);
  }, [selectNode]);

  const handleCanvasClick = useCallback(() => {
    setContextMenu(null);
    if (isConnecting) {
      cancelConnection();
    } else {
      clearSelection();
    }
  }, [isConnecting, cancelConnection, clearSelection]);

  const handleNodeMove = useCallback((nodeId: string, position: { x: number; y: number }) => {
    moveNode(nodeId, position);
  }, [moveNode]);

  const handleConnectionSelect = useCallback((connectionId: string) => {
    selectConnection(connectionId);
  }, [selectConnection]);

  const handleNodeUpdateData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    updateNodeData(nodeId, data);
  }, [updateNodeData]);

  const handleConnectionStart = useCallback((nodeId: string, anchor: string) => {
    if (isConnecting) {
      completeConnection(nodeId, anchor);
    } else {
      startConnection(nodeId, anchor);
    }
  }, [isConnecting, startConnection, completeConnection]);

  // =========================================================================
  // Zoom handlers
  // =========================================================================

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

  // =========================================================================
  // Screen → Canvas coordinate conversion
  // =========================================================================

  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    const container = canvasContainerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const cx = (screenX - rect.left - viewport.pan.x) / viewport.zoom;
    const cy = (screenY - rect.top - viewport.pan.y) / viewport.zoom;
    return { x: Math.round(cx), y: Math.round(cy) };
  }, [viewport]);

  /** Get canvas center position (for toolbar add buttons) */
  const getViewportCenter = useCallback(() => {
    const cx = (containerSize.width / 2 - viewport.pan.x) / viewport.zoom;
    const cy = (containerSize.height / 2 - viewport.pan.y) / viewport.zoom;
    return { x: Math.round(cx), y: Math.round(cy) };
  }, [containerSize, viewport]);

  // =========================================================================
  // Add node helpers (centered on given position)
  // =========================================================================

  const addTextAt = useCallback((pos: { x: number; y: number }) => {
    const w = 200, h = 100;
    addNode({
      type: 'annotation',
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
      size: { width: w, height: h },
      zIndex: nodes.length,
      data: { content: t('node.newText') },
    });
  }, [addNode, nodes.length]);

  const addSceneAt = useCallback((pos: { x: number; y: number }) => {
    const w = 240, h = 160;
    addNode({
      type: 'storyboard',
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
      size: { width: w, height: h },
      zIndex: nodes.length,
      data: { title: t('node.newScene') },
    });
  }, [addNode, nodes.length]);

  const addMediaAt = useCallback((pos: { x: number; y: number }, mediaType: 'image' | 'video' | 'audio', uri?: string, _name?: string) => {
    const w = mediaType === 'audio' ? 280 : 280;
    const h = mediaType === 'audio' ? 80 : 200;
    addNode({
      type: 'media',
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
      size: { width: w, height: h },
      zIndex: nodes.length,
      data: {
        assetPath: uri || '',
        mediaType,
        thumbnailPath: undefined,
        duration: undefined,
      },
    });
  }, [addNode, nodes.length]);

  // Toolbar add handlers (add at viewport center)
  const handleAddText = useCallback(() => {
    addTextAt(getViewportCenter());
  }, [addTextAt, getViewportCenter]);

  const handleAddScene = useCallback(() => {
    addSceneAt(getViewportCenter());
  }, [addSceneAt, getViewportCenter]);

  // Handle media added from extension (file picker)
  const handleAddMediaFromExtension = useCallback((mediaType: string, uri: string, name: string) => {
    const pos = getViewportCenter();
    addMediaAt(pos, mediaType as 'image' | 'video' | 'audio', uri, name);
  }, [addMediaAt, getViewportCenter]);

  // Request extension to open file picker for media
  const handleAddMedia = useCallback((type: 'image' | 'video' | 'audio') => {
    if (vscode) {
      vscode.postMessage({ type: 'pickMedia', mediaType: type });
    } else {
      // Dev mode: add placeholder
      addMediaAt(getViewportCenter(), type);
    }
  }, [addMediaAt, getViewportCenter]);

  // =========================================================================
  // Context menu
  // =========================================================================

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    const hasSelection = selectedNodeIds.length > 0;

    const menuCtx = {
      canvasPosition: canvasPos,
      hasSelection,
      selectedCount: selectedNodeIds.length,
      onAddText: addTextAt,
      onAddScene: addSceneAt,
      onAddMedia: handleAddMedia,
      onDelete: deleteSelected,
      onSelectAll: () => {
        const { selectNodes } = useCanvasStore.getState();
        selectNodes(nodes.map(n => n.id));
      },
      onFitContent: handleFitContent,
      onResetView: handleResetViewport,
    };

    const items = hasSelection
      ? buildNodeMenuItems(menuCtx)
      : buildCanvasMenuItems(menuCtx);

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  }, [screenToCanvas, selectedNodeIds, nodes, addTextAt, addSceneAt, handleAddMedia, deleteSelected, handleFitContent, handleResetViewport]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // =========================================================================
  // Keyboard shortcuts (dev mode fallback)
  // =========================================================================

  useEffect(() => {
    if (vscode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleKeyboardAction('escape');
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        handleKeyboardAction('deleteSelected');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        handleKeyboardAction('selectAll');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyboardAction]);

  // =========================================================================
  // Render
  // =========================================================================

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--canvas-bg)' }}>
        <div style={{ color: 'var(--toolbar-fg-secondary)' }}>{t('loading')}</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Toolbar */}
      <div
        className="h-10 flex items-center px-4 gap-2"
        style={{ backgroundColor: 'var(--toolbar-bg)', borderBottom: '1px solid var(--toolbar-border)' }}
      >
        <span className="text-sm" style={{ color: 'var(--toolbar-fg)' }}>
          {canvasData?.name || 'Untitled Canvas'}
        </span>
        <span className="text-xs" style={{ color: 'var(--toolbar-fg-secondary)' }}>
          {t('toolbar.nodes', nodes.length)}
        </span>

        <div className="w-px h-5 mx-2" style={{ backgroundColor: 'var(--toolbar-border)' }} />

        {/* Add Text */}
        <button
          onClick={handleAddText}
          className="h-7 px-2 flex items-center gap-1 rounded text-xs transition-colors"
          style={{ color: 'var(--control-fg)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--control-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          title={t('toolbar.addText')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
          </svg>
          <span>{t('toolbar.text')}</span>
        </button>

        {/* Add Scene */}
        <button
          onClick={handleAddScene}
          className="h-7 px-2 flex items-center gap-1 rounded text-xs transition-colors"
          style={{ color: 'var(--control-fg)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--control-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          title={t('toolbar.addScene')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
          </svg>
          <span>{t('toolbar.scene')}</span>
        </button>

        <div className="w-px h-5 mx-2" style={{ backgroundColor: 'var(--toolbar-border)' }} />

        {/* Add Media buttons */}
        <button
          onClick={() => handleAddMedia('image')}
          className="h-7 px-2 flex items-center gap-1 rounded text-xs transition-colors"
          style={{ color: 'var(--control-fg)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--control-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          title={t('menu.addImage')}
        >
          <span>🖼️</span>
        </button>

        <button
          onClick={() => handleAddMedia('video')}
          className="h-7 px-2 flex items-center gap-1 rounded text-xs transition-colors"
          style={{ color: 'var(--control-fg)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--control-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          title={t('menu.addVideo')}
        >
          <span>🎥</span>
        </button>

        <button
          onClick={() => handleAddMedia('audio')}
          className="h-7 px-2 flex items-center gap-1 rounded text-xs transition-colors"
          style={{ color: 'var(--control-fg)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--control-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          title={t('menu.addAudio')}
        >
          <span>🎵</span>
        </button>
      </div>

      {/* Canvas Area */}
      <div
        ref={canvasContainerRef}
        className="flex-1 relative overflow-hidden"
        style={{ backgroundColor: 'var(--canvas-bg)' }}
        onContextMenu={handleContextMenu}
      >
        <InfiniteCanvas
          nodes={nodes}
          connections={connections}
          viewport={viewport}
          selectedNodeIds={selectedNodeIds}
          selectedConnectionIds={selectedConnectionIds}
          onViewportChange={handleViewportChange}
          onNodeSelect={handleNodeSelect}
          onNodeMove={handleNodeMove}
          onNodeUpdateData={handleNodeUpdateData}
          onConnectionSelect={handleConnectionSelect}
          onConnectionStart={handleConnectionStart}
          onCanvasClick={handleCanvasClick}
        />

        {/* Empty state hint */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center" style={{ color: 'var(--toolbar-fg-secondary)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 opacity-40">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M12 8v8" /><path d="M8 12h8" />
              </svg>
              <p className="text-sm opacity-60">{t('empty.hint')}</p>
              <p className="text-xs opacity-40 mt-1">{t('empty.zoom')}</p>
            </div>
          </div>
        )}

        {/* Zoom Controls */}
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

        {/* MiniMap */}
        <div className="absolute bottom-4 right-4 z-10">
          <MiniMap
            nodes={nodes}
            viewport={viewport}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            onViewportChange={handleViewportChange}
          />
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={closeContextMenu}
          />
        )}
      </div>

      {/* Status Bar */}
      <div
        className="h-6 flex items-center px-4 text-xs"
        style={{ backgroundColor: 'var(--statusbar-bg)', color: 'var(--statusbar-fg)' }}
      >
        <span>{t('status.zoom', (viewport.zoom * 100).toFixed(0))}</span>
        <span className="mx-2">|</span>
        <span>{t('status.pan', viewport.pan.x.toFixed(0), viewport.pan.y.toFixed(0))}</span>
        {isConnecting && (
          <>
            <span className="mx-2">|</span>
            <span className="animate-pulse">{t('status.connecting')}</span>
          </>
        )}
        {selectedNodeIds.length > 0 && (
          <>
            <span className="mx-2">|</span>
            <span>{t('status.selected', selectedNodeIds.length)}</span>
          </>
        )}
      </div>
    </div>
  );
}
