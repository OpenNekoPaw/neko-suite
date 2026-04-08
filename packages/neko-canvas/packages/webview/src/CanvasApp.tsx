import { useEffect, useState, useCallback, useRef } from 'react';
import type { CanvasData, CanvasViewport } from '@neko/shared';
import { useCanvasStore } from './stores/canvasStore';
import { InfiniteCanvas, ZoomControls, MiniMap } from './components';
import { ContextMenu } from './components/common/ContextMenu';
import {
  GenerationPromptPanel,
  type GenerationPanelTarget,
  type GenerationParams,
} from './components/panels/GenerationPromptPanel';
import { CanvasToolbar } from './components/toolbar/CanvasToolbar';
import { MIN_ZOOM, MAX_ZOOM } from './hooks';
import { useVSCodeMessages } from './hooks/useVSCodeMessages';
import { useNodeHelpers } from './hooks/useNodeHelpers';
import { useClipboard } from './hooks/useClipboard';
import { useKeyboardActions } from './hooks/useKeyboardActions';
import { useDragDrop } from './hooks/useDragDrop';
import { useContextMenu } from './hooks/useContextMenu';
import type { VSCodeAPI } from './hooks/useVSCodeMessages';
import { buildCanvasNode } from './utils/nodeFactory';
import { setGlobalVSCodeApi } from './utils/vscode';
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
  setGlobalVSCodeApi(vscode);
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

  // Hand tool: drag-to-pan mode (toggle with H key)
  const [isPanMode, setIsPanMode] = useState(false);
  // Minimap width tracks ZoomControls width for alignment
  const zoomControlsRef = useRef<HTMLDivElement>(null);
  const [miniMapWidth, setMiniMapWidth] = useState(200);

  const rootRef = useRef<HTMLDivElement>(null);

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
    groupNodes,
    ungroupNodes,
    generationPanelState,
    openGenerationPanel,
    closeGenerationPanel,
  } = useCanvasStore();

  // Derive computed values from canvasData
  const nodes = canvasData?.nodes ?? [];
  const connections = canvasData?.connections ?? [];
  const viewport = canvasData?.viewport ?? { pan: { x: 0, y: 0 }, zoom: 1 };
  const selectedNodeIds = selection.nodeIds;
  const selectedConnectionIds = selection.connectionIds;

  // =========================================================================
  // Container size tracking  (moved after useVSCodeMessages — see below)
  // =========================================================================

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
  // AutoPrompt resolver — bridges postMessage round-trip into a Promise
  // Used by onBuildPromptResult to resolve pending buildPrompt requests
  // =========================================================================

  const buildPromptResolverRef = useRef<((prompt: string) => void) | null>(null);

  // =========================================================================
  // Node helpers
  // =========================================================================

  const { addTextAt, addSceneAt, addMediaAt, addShotAt, addSceneGroupAt, addGalleryAt } =
    useNodeHelpers({
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

  const handleAddShot = useCallback(() => {
    addShotAt(getViewportCenter());
  }, [addShotAt, getViewportCenter]);

  const handleAddSceneGroup = useCallback(() => {
    addSceneGroupAt(getViewportCenter());
  }, [addSceneGroupAt, getViewportCenter]);

  const handleAddGallery = useCallback(() => {
    addGalleryAt(getViewportCenter());
  }, [addGalleryAt, getViewportCenter]);

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

  const {
    isDragOver,
    dropPositionRef,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useDragDrop({
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
    onBuildPromptResult: (prompt) => {
      buildPromptResolverRef.current?.(prompt);
      buildPromptResolverRef.current = null;
    },
    onGenerationProgress: ({ nodeId, cellId, status, dataUrl }) => {
      const node = useCanvasStore.getState().canvasData?.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      if (node.type === 'shot') {
        if (status === 'done' && dataUrl) {
          const shotNode = node as import('@neko/shared').ShotCanvasNode;
          const history = [
            ...(shotNode.data.generationHistory ?? []),
            {
              id: `v-${Date.now()}`,
              dataUrl,
              prompt: '',
              timestamp: Date.now(),
              selected: true,
            },
          ];
          updateNodeData(nodeId, {
            generationStatus: 'done',
            generatedImage: dataUrl,
            generationHistory: history,
          });
        } else {
          updateNodeData(nodeId, { generationStatus: status });
        }
      } else if (node.type === 'gallery' && cellId) {
        const galleryNode = node as import('@neko/shared').GalleryCanvasNode;
        const cells = galleryNode.data.cells.map((c) =>
          c.id === cellId
            ? {
                ...c,
                generationStatus: status as import('@neko/shared').GalleryCell['generationStatus'],
                ...(status === 'done' && dataUrl ? { image: dataUrl } : {}),
              }
            : c,
        );
        updateNodeData(nodeId, { cells });
      }
    },
    onScriptIndexResult: (nodeId, scenes) => {
      updateNodeData(nodeId, { scenes });
    },
    onModelInstalledResult: (nodeId, installedVersion) => {
      updateNodeData(nodeId, { installedVersion: installedVersion ?? undefined });
    },
    onUpdateNodeImage: (nodeId, imageData, cellId) => {
      // Sketch round-trip: update the shot node's generatedImage and append to history
      const node = useCanvasStore.getState().canvasData?.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      if (node.type === 'shot') {
        const shotNode = node as import('@neko/shared').ShotCanvasNode;
        const history = [
          ...(shotNode.data.generationHistory ?? []),
          {
            id: `sketch-${Date.now()}`,
            dataUrl: imageData,
            prompt: '',
            timestamp: Date.now(),
            selected: true,
          },
        ];
        updateNodeData(nodeId, {
          generatedImage: imageData,
          generationHistory: history,
        });
      } else if (node.type === 'gallery' && cellId) {
        const galleryNode = node as import('@neko/shared').GalleryCanvasNode;
        const cells = galleryNode.data.cells.map((c) =>
          c.id === cellId ? { ...c, image: imageData } : c,
        );
        updateNodeData(nodeId, { cells });
      }
    },
    getNodes: (type) => {
      const allNodes = useCanvasStore.getState().canvasData?.nodes ?? [];
      return type ? allNodes.filter((n) => n.type === type) : allNodes;
    },
    getNode: (id) => useCanvasStore.getState().canvasData?.nodes.find((n) => n.id === id),
    updateNode: (id, data) => useCanvasStore.getState().updateNodeData(id, data),
    createNode: (nodeSpec) => {
      const currentNodes = useCanvasStore.getState().canvasData?.nodes ?? [];
      const node = buildCanvasNode({
        type: nodeSpec.type,
        position: nodeSpec.position,
        data: nodeSpec.data,
        zIndex: currentNodes.length,
      });
      return useCanvasStore.getState().addNode(node);
    },
  });

  // =========================================================================
  // Container size tracking
  // Must be after useVSCodeMessages so isReady is available.
  // Canvas container is only mounted once isReady=true, so deps=[isReady] ensures
  // the ResizeObserver is attached after the element appears in the DOM.
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
  }, [isReady]);

  // Track ZoomControls width so MiniMap stays aligned
  useEffect(() => {
    const el = zoomControlsRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMiniMapWidth(el.offsetWidth));
    ro.observe(el);
    setMiniMapWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, [isReady]);

  // =========================================================================
  // AI generation / agent handlers
  // =========================================================================

  /** Open GenerationPromptPanel for the selected ShotNode */
  const handleGenerateSelected = useCallback(() => {
    const nodeId = selectedNodeIds[0];
    if (!nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    const data = node?.data as Record<string, unknown> | undefined;
    openGenerationPanel(nodeId, undefined, (data?.['visualDescription'] as string) ?? '');
  }, [selectedNodeIds, nodes, openGenerationPanel]);

  /** Batch-generate all selected ShotNodes via Agent */
  const handleBatchGenerate = useCallback(() => {
    vscode?.postMessage({ type: 'sendToAgent', nodeIds: selectedNodeIds, action: 'batch' });
  }, [selectedNodeIds]);

  /** Send selected nodes as context to the Agent panel */
  const handleSendToAgent = useCallback(
    (intent?: string) => {
      vscode?.postMessage({
        type: 'sendToAgent',
        nodeIds: selectedNodeIds,
        action: 'context',
        intent,
      });
    },
    [selectedNodeIds],
  );

  /** Open GenerationPromptPanel in video mode for the selected ShotNode */
  const handleGenerateVideo = useCallback(() => {
    const nodeId = selectedNodeIds[0];
    if (!nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    const data = node?.data as Record<string, unknown> | undefined;
    const prompt = (data?.['visualDescription'] as string) ?? '';
    openGenerationPanel(nodeId, undefined, prompt, { generateVideo: true });
  }, [selectedNodeIds, nodes, openGenerationPanel]);

  /** Open GenerationPromptPanel with ControlNet pre-selected */
  const handleEditWithControlNet = useCallback(() => {
    const nodeId = selectedNodeIds[0];
    if (!nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    const data = node?.data as Record<string, unknown> | undefined;
    const prompt = (data?.['visualDescription'] as string) ?? '';
    openGenerationPanel(nodeId, undefined, prompt, { controlMode: 'depth' });
  }, [selectedNodeIds, nodes, openGenerationPanel]);

  /** Open the selected ShotNode's generated image in neko-sketch for editing */
  const handleEditInSketch = useCallback(() => {
    const nodeId = selectedNodeIds[0];
    if (!nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const data = node.data as Record<string, unknown>;
    const imageData = (data['generatedImage'] as string | undefined) ?? null;
    vscode?.postMessage({ type: 'editInSketch', nodeId, imageData });
  }, [selectedNodeIds, nodes]);

  const handleScriptLoadScenes = useCallback((nodeId: string, scriptPath: string) => {
    vscode?.postMessage({ type: 'getScriptIndex', nodeId, scriptPath });
  }, []);

  const handleScriptOpen = useCallback((scriptPath: string) => {
    vscode?.postMessage({ type: 'openDocument', docPath: scriptPath });
  }, []);

  const handleScriptNavigateToScene = useCallback(
    (linkedSceneGroupId: string) => {
      // Scroll the canvas viewport to center on the linked SceneGroupNode
      const target = nodes.find((n) => n.id === linkedSceneGroupId);
      if (!target) return;
      const cx = target.position.x + target.size.width / 2;
      const cy = target.position.y + target.size.height / 2;
      setViewport({
        pan: {
          x: containerSize.width / 2 - cx * viewport.zoom,
          y: containerSize.height / 2 - cy * viewport.zoom,
        },
      });
    },
    [nodes, viewport.zoom, containerSize, setViewport],
  );

  const handleDocumentOpen = useCallback((docPath: string) => {
    vscode?.postMessage({ type: 'openDocument', docPath });
  }, []);

  const handleModelCheckInstalled = useCallback((nodeId: string, modelPath: string) => {
    vscode?.postMessage({ type: 'checkModelInstalled', nodeId, modelPath });
  }, []);

  const handleSelectShotCandidate = useCallback(
    (nodeId: string, candidateId: string) => {
      const target = nodes.find((node) => node.id === nodeId);
      if (!target || target.type !== 'shot') return;

      const nextHistory = target.data.generationHistory.map((candidate) => ({
        ...candidate,
        selected: candidate.id === candidateId,
      }));
      const selected = nextHistory.find((candidate) => candidate.selected);

      updateNodeData(nodeId, {
        generationHistory: nextHistory,
        generatedImage: selected?.dataUrl,
      });
    },
    [nodes, updateNodeData],
  );

  // =========================================================================
  // Generation panel
  // =========================================================================

  const generationPanelTarget: GenerationPanelTarget | null =
    generationPanelState.visible && generationPanelState.nodeId
      ? {
          nodeId: generationPanelState.nodeId,
          cellId: generationPanelState.cellId ?? undefined,
          initialPrompt: generationPanelState.initialPrompt,
          initialControlMode: generationPanelState.initialControlMode,
          initialGenerateVideo: generationPanelState.initialGenerateVideo,
        }
      : null;

  const handlePanelGenerate = useCallback(
    (target: GenerationPanelTarget, params: GenerationParams) => {
      vscode?.postMessage({
        type: 'generateForNode',
        nodeId: target.nodeId,
        cellId: target.cellId,
        params,
      });
      closeGenerationPanel();
    },
    [closeGenerationPanel],
  );

  const handlePanelAutoPrompt = useCallback(
    (target: GenerationPanelTarget): Promise<string> => {
      const node = nodes.find((n) => n.id === target.nodeId);
      if (!node) return Promise.resolve('');
      return new Promise<string>((resolve) => {
        // Set resolver before sending request; the response handler in
        // useVSCodeMessages will call it via buildPromptResolverRef
        buildPromptResolverRef.current = resolve;
        vscode?.postMessage({ type: 'buildPrompt', nodeId: target.nodeId, shotData: node.data });
        // Timeout fallback: resolve with empty string after 15 seconds
        setTimeout(() => {
          if (buildPromptResolverRef.current === resolve) {
            buildPromptResolverRef.current = null;
            resolve('');
          }
        }, 15000);
      });
    },
    [nodes],
  );

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
    addShotAt,
    addGalleryAt,
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
    onGenerateSelected: handleGenerateSelected,
    onBatchGenerate: handleBatchGenerate,
    onSendToAgent: handleSendToAgent,
    onEditInSketch: handleEditInSketch,
    onGenerateVideo: handleGenerateVideo,
    onEditWithControlNet: handleEditWithControlNet,
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
    onGenerateSelected: handleGenerateSelected,
    reportAction,
  });

  // Keep ref in sync with latest handler (for VSCode message dispatch)
  keyboardActionRef.current = handleKeyboardAction;

  // H key toggles hand tool (drag-to-pan)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyH' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const active = document.activeElement;
        if (
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          (active as HTMLElement)?.isContentEditable
        )
          return;
        setIsPanMode((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
  // Notify extension of selection changes for ambient agent context
  // =========================================================================

  const lastSelectionRef = useRef<string>('');
  useEffect(() => {
    if (!vscode || !canvasData) return;
    const selKey = selectedNodeIds.join(',');
    if (selKey === lastSelectionRef.current) return;
    lastSelectionRef.current = selKey;
    const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));
    vscode.postMessage({ type: 'selectionChange', nodes: selectedNodes });
  }, [selectedNodeIds, nodes, canvasData]);

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
      {/* Main content area */}
      <div ref={rootRef} className="flex-1 flex overflow-hidden">
        <CanvasToolbar
          onAddText={handleAddText}
          onAddMedia={handleAddMedia}
          onUndo={undo}
          onRedo={redo}
          onAddShot={handleAddShot}
          onAddSceneGroup={handleAddSceneGroup}
          onAddGallery={handleAddGallery}
          isPanMode={isPanMode}
          onTogglePanMode={() => setIsPanMode((prev) => !prev)}
        />

        <div
          ref={canvasContainerRef}
          className="flex-1 relative overflow-hidden"
          style={{ backgroundColor: 'var(--canvas-bg)' }}
          onContextMenu={handleContextMenu}
          onDragEnter={handleDragEnter}
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
            onScriptLoadScenes={handleScriptLoadScenes}
            onScriptOpen={handleScriptOpen}
            onScriptNavigateToScene={handleScriptNavigateToScene}
            onDocumentOpen={handleDocumentOpen}
            onModelCheckInstalled={handleModelCheckInstalled}
            onSelectShotCandidate={handleSelectShotCandidate}
            isPanMode={isPanMode}
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

          {/* Bottom-left cluster: MiniMap + ZoomControls (always visible, widths aligned) */}
          <div className="absolute bottom-4 left-4 z-10 flex flex-col items-start gap-2">
            <MiniMap
              nodes={nodes}
              viewport={viewport}
              containerWidth={containerSize.width}
              containerHeight={containerSize.height}
              onViewportChange={handleViewportChange}
              width={miniMapWidth}
              height={Math.round(miniMapWidth * 0.7)}
            />
            <div ref={zoomControlsRef}>
              <ZoomControls
                zoom={viewport.zoom}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onZoomTo={handleZoomTo}
                onFitContent={handleFitContent}
                onResetViewport={handleResetViewport}
              />
            </div>
          </div>

          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={contextMenu.items}
              onClose={closeContextMenu}
            />
          )}

          {/* Generation Prompt Panel (E6: ControlNet / Video / image generation) */}
          <GenerationPromptPanel
            visible={generationPanelState.visible}
            target={generationPanelTarget}
            onGenerate={handlePanelGenerate}
            onClose={closeGenerationPanel}
            onRequestAutoPrompt={handlePanelAutoPrompt}
          />

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
      </div>
    </div>
  );
}
