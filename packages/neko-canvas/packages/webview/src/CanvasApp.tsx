import { useEffect, useState, useCallback, useRef } from 'react';
import type { CanvasData, CanvasViewport } from '@neko/shared';
import { useCanvasStore } from './stores/canvasStore';
import { useClipboardStore } from './stores/clipboardStore';
import { useHistoryStore } from './stores/historyStore';
import { InfiniteCanvas, ZoomControls, MiniMap } from './components';
import { ContextMenu, buildCanvasMenuItems, buildNodeMenuItems } from './components/common/ContextMenu';
import type { MenuEntry } from './components/common/ContextMenu';
import { CanvasToolbar } from './components/toolbar/CanvasToolbar';
import { PropertyPanel } from './components/panels/PropertyPanel';
import { MIN_ZOOM, MAX_ZOOM } from './hooks';
import { t, setLocale } from './i18n';

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

// Expose on window so child components (e.g. MediaNode) can postMessage
if (vscode) {
  (window as unknown as Record<string, unknown>).vscode = vscode;
}

// Media type detection by file extension
const MEDIA_EXTENSIONS: Record<string, 'image' | 'video' | 'audio'> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video', m4v: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio',
};

function detectMediaType(fileName: string): 'image' | 'video' | 'audio' | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return MEDIA_EXTENSIONS[ext] ?? null;
}

/**
 * Canvas App - Main application component
 */
export function CanvasApp() {
  const [isReady, setIsReady] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isDragOver, setIsDragOver] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: MenuEntry[];
  } | null>(null);

  // Panel state
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false);
  const [isPropertyPanelOpen, setIsPropertyPanelOpen] = useState(true);

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

  // handleKeyboardAction is defined after clipboard handlers below
  // Keep a ref to the latest handler (assigned after definition)
  const keyboardActionRef = useRef<(action: string) => void>(() => {});

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
            setLocale(message.locale as 'en' | 'zh-cn');
            break;
          case 'addMedia':
            // Extension sends media file info to add to canvas
            handleAddMediaFromExtension(message.mediaType as string, message.uri as string, message.name as string);
            break;
          case 'dropMedia': {
            // Extension resolved dropped file URIs → add media nodes at drop position
            const pos = dropPositionRef.current ?? getViewportCenter();
            const files = message.files as Array<{ uri: string; name: string; mediaType: string }>;
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
            break;
          }
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
  // Sync status to extension (outline, status bar, timeline)
  // =========================================================================

  // Send canvas status to extension for status bar & outline updates
  const lastSyncRef = useRef<string>('');
  useEffect(() => {
    if (!vscode || !canvasData) return;

    // Build a lightweight fingerprint to avoid redundant messages
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

  /** Report a user action to extension for timeline recording */
  const reportAction = useCallback((action: string, label: string, detail?: string) => {
    if (!vscode) return;
    vscode.postMessage({ type: 'canvasAction', action, label, detail });
  }, []);

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

  // Real-time position update during drag (no history recording)
  const handleNodeDrag = useCallback((nodeId: string, position: { x: number; y: number }) => {
    moveNode(nodeId, position);
  }, [moveNode]);

  // Final position update on drag end (records history for undo)
  const handleNodeMove = useCallback((nodeId: string, position: { x: number; y: number }) => {
    moveNodeEnd(nodeId, position);
  }, [moveNodeEnd]);

  // Real-time resize update during resize (no history recording)
  const handleNodeResize = useCallback((nodeId: string, size: { width: number; height: number }, position: { x: number; y: number }) => {
    resizeNode(nodeId, size, position);
  }, [resizeNode]);

  // Final resize update on resize end (records history for undo)
  const handleNodeResizeEnd = useCallback((nodeId: string, size: { width: number; height: number }, position: { x: number; y: number }) => {
    resizeNodeEnd(nodeId, size, position);
  }, [resizeNodeEnd]);

  const handleConnectionSelect = useCallback((connectionId: string) => {
    selectConnection(connectionId);
  }, [selectConnection]);

  const handleNodeUpdateData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    updateNodeData(nodeId, data);
  }, [updateNodeData]);

  const handleConnectionStart = useCallback((nodeId: string, anchor: string) => {
    startConnection(nodeId, anchor);
  }, [startConnection]);

  const handleConnectionComplete = useCallback((sourceNodeId: string, sourceAnchor: string, targetNodeId: string, targetAnchor: string) => {
    // Start then immediately complete the connection via the store
    startConnection(sourceNodeId, sourceAnchor);
    completeConnection(targetNodeId, targetAnchor);
  }, [startConnection, completeConnection]);

  const handleConnectionCancel = useCallback(() => {
    cancelConnection();
  }, [cancelConnection]);

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
    reportAction('addNode', 'Add text note');
  }, [addNode, nodes.length, reportAction]);

  const addSceneAt = useCallback((pos: { x: number; y: number }) => {
    const w = 240, h = 160;
    addNode({
      type: 'storyboard',
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
      size: { width: w, height: h },
      zIndex: nodes.length,
      data: { title: t('node.newScene') },
    });
    reportAction('addNode', 'Add storyboard scene');
  }, [addNode, nodes.length, reportAction]);

  const addMediaAt = useCallback((pos: { x: number; y: number }, mediaType: 'image' | 'video' | 'audio', uri?: string, name?: string) => {
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
    reportAction('addNode', `Add ${mediaType}`, name);
  }, [addNode, nodes.length, reportAction]);

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
  // Drag & Drop from VSCode explorer
  // =========================================================================

  const dropPositionRef = useRef<{ x: number; y: number } | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only close if leaving the container (not entering a child)
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        setIsDragOver(false);
      }
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // Save drop position for when extension responds
    dropPositionRef.current = screenToCanvas(e.clientX, e.clientY);

    // First, check for AssetDragData from asset library (unified protocol)
    const jsonData = e.dataTransfer.getData('application/json');
    if (jsonData) {
      try {
        const data = JSON.parse(jsonData);
        if (data.type === 'asset' || data.type === 'assets' || data.type === 'media-file') {
          const items = data.type === 'assets' ? data.items :
                        data.type === 'media-file' ? data.files.map((f: any) => ({ files: [{ path: f.path }] })) :
                        [data];
          const pos = dropPositionRef.current ?? { x: 0, y: 0 };
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const file = item.files?.[0];
            if (file) {
              if (vscode) {
                // Send file URI to extension for webview URI resolution
                vscode.postMessage({
                  type: 'resolveDroppedFiles',
                  uris: [`file://${file.path}`],
                  dropX: e.clientX,
                  dropY: e.clientY,
                });
              } else {
                const mt = file.mediaType === 'video' ? 'video' : file.mediaType === 'audio' ? 'audio' : 'image';
                addMediaAt({ x: pos.x + i * 30, y: pos.y + i * 30 }, mt, file.path, file.name);
              }
            }
          }
          return;
        }
      } catch {
        // Not valid asset drag data, continue with other handlers
      }
    }

    // Try to get URIs from the drop data
    const uriList = e.dataTransfer.getData('text/uri-list');
    const textData = e.dataTransfer.getData('text/plain');
    const files = e.dataTransfer.files;

    if (vscode) {
      // In VSCode webview: send URIs to extension for resolution
      const uris = (uriList || textData || '')
        .split('\n')
        .map(u => u.trim())
        .filter(u => u && !u.startsWith('#'));

      if (uris.length > 0) {
        vscode.postMessage({
          type: 'resolveDroppedFiles',
          uris,
          dropX: e.clientX,
          dropY: e.clientY,
        });
      }
    } else {
      // Dev mode: handle File objects from native drag
      if (files.length > 0) {
        const pos = dropPositionRef.current;
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file) continue;
          const mediaType = detectMediaType(file.name);
          if (mediaType) {
            const offset = i * 30;
            addMediaAt(
              { x: (pos?.x ?? 0) + offset, y: (pos?.y ?? 0) + offset },
              mediaType,
              URL.createObjectURL(file),
              file.name,
            );
          }
        }
      }
    }
  }, [screenToCanvas, addMediaAt]);

  // =========================================================================
  // Clipboard handlers
  // =========================================================================

  const handleCopy = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    useClipboardStore.getState().copy(selectedNodeIds, nodes, connections);
  }, [selectedNodeIds, nodes, connections]);

  const handleCut = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    useClipboardStore.getState().cut(selectedNodeIds, nodes, connections);
    deleteSelected();
  }, [selectedNodeIds, nodes, connections, deleteSelected]);

  const handlePaste = useCallback(() => {
    const result = useClipboardStore.getState().paste();
    if (!result) return;

    const { canvasData: currentData } = useCanvasStore.getState();
    if (!currentData) return;

    // Record history before batch paste
    useHistoryStore.getState().pushState(currentData);

    // Batch add: directly update canvasData for efficiency
    const store = useCanvasStore.getState();
    if (store.canvasData) {
      const updatedData = {
        ...store.canvasData,
        nodes: [...store.canvasData.nodes, ...result.nodes],
        connections: [...store.canvasData.connections, ...result.connections],
      };
      store.setCanvasData(updatedData);

      // Select the pasted nodes
      const { selectNodes } = useCanvasStore.getState();
      selectNodes(result.nodes.map(n => n.id));
    }
  }, []);

  const handleDuplicate = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    const result = useClipboardStore.getState().duplicate(selectedNodeIds, nodes, connections);
    if (!result) return;

    const { canvasData: currentData } = useCanvasStore.getState();
    if (!currentData) return;

    useHistoryStore.getState().pushState(currentData);

    const store = useCanvasStore.getState();
    if (store.canvasData) {
      const updatedData = {
        ...store.canvasData,
        nodes: [...store.canvasData.nodes, ...result.nodes],
        connections: [...store.canvasData.connections, ...result.connections],
      };
      store.setCanvasData(updatedData);

      const { selectNodes } = useCanvasStore.getState();
      selectNodes(result.nodes.map(n => n.id));
    }
  }, [selectedNodeIds, nodes, connections]);

  // =========================================================================
  // Keyboard action handler (defined after clipboard handlers)
  // =========================================================================

  const handleKeyboardAction = useCallback((action: string) => {
    // Handle outline selection commands (selectNode:id, selectConnection:id)
    if (action.startsWith('selectNode:')) {
      const nodeId = action.slice('selectNode:'.length);
      selectNode(nodeId);
      return;
    }
    if (action.startsWith('selectConnection:')) {
      const connId = action.slice('selectConnection:'.length);
      selectConnection(connId);
      return;
    }

    switch (action) {
      case 'deleteSelected':
        if (selectedNodeIds.length > 0 || selectedConnectionIds.length > 0) {
          deleteSelected();
          reportAction('deleteNode', `Deleted ${selectedNodeIds.length} node(s)`);
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
        undo();
        reportAction('undo', 'Undo');
        break;
      case 'redo':
        redo();
        reportAction('redo', 'Redo');
        break;
      case 'copy':
        handleCopy();
        break;
      case 'cut':
        handleCut();
        reportAction('deleteNode', `Cut ${selectedNodeIds.length} node(s)`);
        break;
      case 'paste':
        handlePaste();
        reportAction('paste', 'Paste');
        break;
      case 'duplicate':
        handleDuplicate();
        reportAction('paste', 'Duplicate');
        break;
      case 'resetZoom':
        resetViewport();
        break;
    }
  }, [selectedNodeIds, selectedConnectionIds, deleteSelected, isConnecting, cancelConnection, clearSelection, nodes, contextMenu, undo, redo, handleCopy, handleCut, handlePaste, handleDuplicate, selectNode, selectConnection, resetViewport, reportAction]);

  // Keep ref in sync with latest handler
  keyboardActionRef.current = handleKeyboardAction;

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
      onCopy: handleCopy,
      onCut: handleCut,
      onPaste: handlePaste,
      onDuplicate: handleDuplicate,
      onUndo: undo,
      onRedo: redo,
      canPaste: useClipboardStore.getState().canPaste(),
      canUndo: useHistoryStore.getState().canUndo(),
      canRedo: useHistoryStore.getState().canRedo(),
    };

    const items = hasSelection
      ? buildNodeMenuItems(menuCtx)
      : buildCanvasMenuItems(menuCtx);

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  }, [screenToCanvas, selectedNodeIds, nodes, addTextAt, addSceneAt, handleAddMedia, deleteSelected, handleFitContent, handleResetViewport, handleCopy, handleCut, handlePaste, handleDuplicate, undo, redo]);

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
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleKeyboardAction('redo');
        } else {
          handleKeyboardAction('undo');
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        e.preventDefault();
        handleKeyboardAction('copy');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
        e.preventDefault();
        handleKeyboardAction('cut');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault();
        handleKeyboardAction('paste');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        handleKeyboardAction('duplicate');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyboardAction]);

  // =========================================================================
  // Property panel helpers
  // =========================================================================

  const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));

  const handleUpdateNode = useCallback((id: string, updates: Partial<import('@neko/shared').CanvasNode>) => {
    useCanvasStore.getState().updateNode(id, updates);
  }, []);

  const handleToggleLock = useCallback((id: string) => {
    const node = nodes.find(n => n.id === id);
    if (node) {
      useCanvasStore.getState().updateNode(id, { locked: !node.locked });
    }
  }, [nodes]);

  const handleDeleteNode = useCallback((id: string) => {
    useCanvasStore.getState().removeNode(id);
  }, []);

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
      {/* Top bar - matches VSCode tab/title bar */}
      <div
        className="h-9 flex items-center px-3 gap-2 shrink-0"
        style={{
          backgroundColor: 'var(--titlebar-bg)',
          borderBottom: '1px solid var(--titlebar-border)',
          color: 'var(--titlebar-fg)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" opacity={0.6}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M12 8v8" /><path d="M8 12h8" />
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

      {/* Main content area: toolbar + canvas + property panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar */}
        <CanvasToolbar
          onAddText={handleAddText}
          onAddScene={handleAddScene}
          onAddMedia={handleAddMedia}
          onUndo={undo}
          onRedo={redo}
          onToggleLayerPanel={() => setIsLayerPanelOpen(prev => !prev)}
          isLayerPanelOpen={isLayerPanelOpen}
        />

        {/* Canvas Area */}
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
            onNodeUpdateData={handleNodeUpdateData}
            onConnectionSelect={handleConnectionSelect}
            onConnectionStart={handleConnectionStart}
            onConnectionComplete={handleConnectionComplete}
            onConnectionCancel={handleConnectionCancel}
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

          {/* Drag-over overlay */}
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
        </div>

        {/* Right Property Panel */}
        {isPropertyPanelOpen && (
          <PropertyPanel
            selectedNodes={selectedNodes}
            onUpdateNode={handleUpdateNode}
            onUpdateNodeData={handleNodeUpdateData}
            onDeleteNode={handleDeleteNode}
            onToggleLock={handleToggleLock}
          />
        )}
      </div>

      {/* Status Bar - matches VSCode status bar */}
      <div
        className="h-[22px] flex items-center px-2 text-[11px] shrink-0 gap-0"
        style={{ backgroundColor: 'var(--statusbar-bg)', color: 'var(--statusbar-fg)' }}
      >
        <span className="px-1.5 hover:bg-white/10 cursor-default">{t('status.zoom', { level: (viewport.zoom * 100).toFixed(0) })}</span>
        <span className="px-1.5 hover:bg-white/10 cursor-default">{t('status.pan', { x: viewport.pan.x.toFixed(0), y: viewport.pan.y.toFixed(0) })}</span>
        {isConnecting && (
          <span className="px-1.5 animate-pulse">{t('status.connecting')}</span>
        )}
        {selectedNodeIds.length > 0 && (
          <span className="px-1.5 hover:bg-white/10 cursor-default">{t('status.selected', { count: selectedNodeIds.length })}</span>
        )}
        <div className="flex-1" />
        {/* Property panel toggle */}
        <button
          className="px-1.5 h-full flex items-center hover:bg-white/10 transition-colors"
          style={{ color: isPropertyPanelOpen ? 'var(--statusbar-fg)' : 'var(--statusbar-fg)', opacity: isPropertyPanelOpen ? 1 : 0.7 }}
          onClick={() => setIsPropertyPanelOpen(prev => !prev)}
          title="Toggle Properties Panel"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M15 3v18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
