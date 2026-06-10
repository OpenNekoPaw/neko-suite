import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  getKeyboardBoundaryMetadata,
  useFocusedWebviewRoot,
  useReportWebviewKeyboardEditable,
  useReportWebviewKeyboardFocus,
} from '@neko/ui/keyboard';
import { CreativeWorkbenchShell } from '@neko/ui/workbench';
import type {
  CanvasData,
  CanvasDroppedAsset,
  CanvasNodeType,
  CanvasSubsystemId,
  CanvasViewport,
  ProjectedCanvasStatus,
} from '@neko/shared';
import { createCanvasAgentActiveContext } from './utils/canvasAgentOperations';
import { useCanvasStore } from './stores/canvasStore';
import { useRuntimeViewportStore } from './stores/runtimeViewportStore';
import { InfiniteCanvas, ZoomControls, MiniMap } from './components';
import { ContextMenu } from './components/common/ContextMenu';
import {
  GenerationPromptPanel,
  type GenerationPanelTarget,
  type GenerationParams,
} from './components/panels/GenerationPromptPanel';
import { ContentOverlay } from './components/panels/ContentOverlay';
import { CanvasToolbar } from './components/toolbar/CanvasToolbar';
import { NodeLibraryPanel } from './components/panels/NodeLibraryPanel';
import { FloatingPanelHost } from './components/panels/FloatingPanelHost';
import { MIN_ZOOM, MAX_ZOOM } from './hooks';
import { useNodeExpand } from './hooks/useNodeExpand';
import { useVSCodeMessages } from './hooks/useVSCodeMessages';
import { useNodeHelpers } from './hooks/useNodeHelpers';
import { useClipboard } from './hooks/useClipboard';
import {
  useCanvasKeyboardController,
  type CanvasKeyboardState,
} from './hooks/useCanvasKeyboardController';
import { useKeyboardActions } from './hooks/useKeyboardActions';
import { useDragDrop } from './hooks/useDragDrop';
import { useContextMenu } from './hooks/useContextMenu';
import { useThrottledCanvasViewport } from './hooks/useThrottledCanvasViewport';
import type { VSCodeAPI } from './hooks/useVSCodeMessages';
import { buildCanvasNode } from './utils/nodeFactory';
import {
  getNodeLibraryPickerMessageType,
  isNodeLibraryDirectCreateType,
  type NodeLibraryPickerMessageType,
} from './utils/nodeLibraryPolicy';
import { appendSelectedGenerationCandidate } from './utils/generationHistory';
import { getImportedGeneratedAssetNodeInput } from './utils/importedGeneratedAsset';
import { setGlobalVSCodeApi } from './utils/vscode';
import { createBuiltInWebviewSubsystemRegistry } from './subsystems';
import type { FloatingPanelDefinition } from './subsystems';
import type { NodeTypeDescriptorRegistry } from './components/nodes/nodeTypeDescriptor';
import { DEFAULT_RUNTIME_VIEWPORT } from './stores/runtimeViewportStore';
import {
  screenToCanvas as screenToCanvasMath,
  getViewportCenter as getViewportCenterMath,
} from './utils/viewportMath';
import { createCanvasDocumentSaveFingerprint } from './utils/canvasPersistence';
import {
  createViewportSnapshotPolicy,
  type ViewportSnapshotPolicy,
} from './utils/viewportSnapshotPolicy';
import {
  createCanvasViewportSnapshotKey,
  readCanvasViewportSnapshot,
  writeCanvasViewportSnapshot,
} from './utils/viewportWebviewState';
import { resolveCanvasRenderRefreshDecision } from './utils/renderRefreshTiering';
import { t } from './i18n';
import { getLogger } from './utils/logger';

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

const WEBVIEW_SUBSYSTEM_REGISTRY = createBuiltInWebviewSubsystemRegistry();
const logger = getLogger('CanvasApp');

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

  // Interaction tool: select/marquee by default, hand tool pans on drag.
  const [interactionTool, setInteractionTool] = useState<'select' | 'pan'>('select');
  const [isSpacePanActive, setIsSpacePanActive] = useState(false);
  const [isRightNodeTreeVisible, setIsRightNodeTreeVisible] = useState(false);
  const [isHudVisible, setIsHudVisible] = useState(true);
  // Minimap width tracks ZoomControls width for alignment
  const zoomControlsRef = useRef<HTMLDivElement>(null);
  const [miniMapWidth, setMiniMapWidth] = useState(200);
  const [subsystemNodeTypeDescriptors, setSubsystemNodeTypeDescriptors] =
    useState<NodeTypeDescriptorRegistry>({});
  const [floatingPanels, setFloatingPanels] = useState<readonly FloatingPanelDefinition[]>([]);

  const rootRef = useRef<HTMLDivElement>(null);
  const { isKeyboardFocused, isKeyboardFocusedRef, setKeyboardFocused } = useFocusedWebviewRoot(
    rootRef,
    vscode ? false : true,
  );
  useReportWebviewKeyboardFocus(rootRef, vscode);
  useReportWebviewKeyboardEditable(vscode);

  const canvasData = useCanvasStore((state) => state.canvasData);
  const selection = useCanvasStore((state) => state.selection);
  const isConnecting = useCanvasStore((state) => state.isConnecting);
  const generationPanelState = useCanvasStore((state) => state.generationPanelState);
  const contentOverlayState = useCanvasStore((state) => state.contentOverlayState);
  const setCanvasData = useCanvasStore((state) => state.setCanvasData);
  const selectNode = useCanvasStore((state) => state.selectNode);
  const selectConnection = useCanvasStore((state) => state.selectConnection);
  const clearSelection = useCanvasStore((state) => state.clearSelection);
  const addNode = useCanvasStore((state) => state.addNode);
  const createComposite = useCanvasStore((state) => state.createComposite);
  const updateNode = useCanvasStore((state) => state.updateNode);
  const updateConnection = useCanvasStore((state) => state.updateConnection);
  const deleteSelected = useCanvasStore((state) => state.deleteSelected);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const startConnection = useCanvasStore((state) => state.startConnection);
  const completeConnection = useCanvasStore((state) => state.completeConnection);
  const cancelConnection = useCanvasStore((state) => state.cancelConnection);
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);
  const moveNodeEnd = useCanvasStore((state) => state.moveNodeEnd);
  const resizeNodeEnd = useCanvasStore((state) => state.resizeNodeEnd);
  const rotateNodeEnd = useCanvasStore((state) => state.rotateNodeEnd);
  const removeChildFromContainer = useCanvasStore((state) => state.removeChildFromContainer);
  const selectNodes = useCanvasStore((state) => state.selectNodes);
  const groupNodes = useCanvasStore((state) => state.groupNodes);
  const ungroupNodes = useCanvasStore((state) => state.ungroupNodes);
  const openGenerationPanel = useCanvasStore((state) => state.openGenerationPanel);
  const closeGenerationPanel = useCanvasStore((state) => state.closeGenerationPanel);
  const closeContentOverlay = useCanvasStore((state) => state.closeContentOverlay);
  const viewport = useRuntimeViewportStore((state) => state.viewport);
  const setViewport = useRuntimeViewportStore((state) => state.setViewport);
  const zoomCanvas = useRuntimeViewportStore((state) => state.zoomCanvas);
  const resetViewport = useRuntimeViewportStore((state) => state.resetViewport);
  const seedViewportFromDocument = useRuntimeViewportStore(
    (state) => state.seedViewportFromDocument,
  );

  // Derive computed values from canvasData
  const nodes = canvasData?.nodes ?? [];
  const connections = canvasData?.connections ?? [];
  const selectedNodeIds = selection.nodeIds;
  const selectedConnectionIds = selection.connectionIds;
  const { expandedNodeId } = useNodeExpand();
  const activeSubsystemIds = useMemo(
    () => WEBVIEW_SUBSYSTEM_REGISTRY.getActiveSubsystems({ nodes }),
    [nodes],
  );
  const activeSubsystemKey = activeSubsystemIds.join('|');
  const isPanMode = interactionTool === 'pan';
  const togglePanMode = useCallback(
    () => setInteractionTool((tool) => (tool === 'pan' ? 'select' : 'pan')),
    [],
  );
  const nodeTypeSummary = useMemo(
    () => WEBVIEW_SUBSYSTEM_REGISTRY.getNodeTypeSummary({ nodes }),
    [nodes],
  );
  const coreNodeTypeDescriptors = useMemo(
    () => WEBVIEW_SUBSYSTEM_REGISTRY.getCoreNodeTypeDescriptors(),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const requestedSubsystemIds = new Set(activeSubsystemKey.split('|').filter(Boolean));
    const subsystemIds = WEBVIEW_SUBSYSTEM_REGISTRY.manifests
      .map((manifest) => manifest.id)
      .filter((id) => requestedSubsystemIds.has(id));

    Promise.all(subsystemIds.map((id) => WEBVIEW_SUBSYSTEM_REGISTRY.load(id)))
      .then((registrations) => {
        if (cancelled) return;
        setSubsystemNodeTypeDescriptors(
          Object.assign(
            {},
            ...registrations.map((registration) => registration.nodeTypeDescriptors),
          ),
        );
        setFloatingPanels(
          registrations.flatMap((registration) => registration.floatingPanels ?? []),
        );
      })
      .catch((error: unknown) => {
        logger.warn('Failed to load active Canvas subsystems', error);
        if (!cancelled) {
          setSubsystemNodeTypeDescriptors({});
          setFloatingPanels([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSubsystemKey]);

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

  const reportAction = useCallback(
    (action: string, label: string, detail?: string, data?: unknown) => {
      if (!vscode) return;
      vscode.postMessage({ type: 'canvasAction', action, label, detail, data });
    },
    [],
  );

  // =========================================================================
  // AutoPrompt resolver — bridges postMessage round-trip into a Promise
  // Used by onBuildPromptResult to resolve pending buildPrompt requests
  // =========================================================================

  const buildPromptResolverRef = useRef<((prompt: string) => void) | null>(null);
  const isComposingRef = useRef(false);
  const viewportSnapshotPolicyRef = useRef<ViewportSnapshotPolicy | null>(null);
  const projectionRequestIdRef = useRef(0);
  const projectionResolversRef = useRef(
    new Map<
      number,
      {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
      }
    >(),
  );

  const requestProjectionWriteBack = useCallback(
    (changes: unknown[]): Promise<unknown> => {
      if (!vscode || !canvasData?.projected) {
        return Promise.reject(new Error('Projected Canvas is not active'));
      }
      const source = (canvasData as { projectionSource?: unknown }).projectionSource;
      const requestId = ++projectionRequestIdRef.current;
      return new Promise((resolve, reject) => {
        projectionResolversRef.current.set(requestId, { resolve, reject });
        vscode.postMessage({
          type: 'projection.writeBack',
          _requestId: requestId,
          source,
          changes,
        });
        setTimeout(() => {
          const pending = projectionResolversRef.current.get(requestId);
          if (pending) {
            projectionResolversRef.current.delete(requestId);
            pending.reject(new Error('Projection write-back timeout'));
          }
        }, 30000);
      });
    },
    [canvasData],
  );

  // =========================================================================
  // Node helpers
  // =========================================================================

  const {
    addTextAt,
    addMediaAt,
    addShotAt,
    addSceneGroupAt,
    addGalleryAt,
    addTableAt,
    addScriptAt,
    addDocumentAt,
    addModelAt,
    addCanvasEmbedAt,
    addProjectAt,
  } = useNodeHelpers({
    addNode,
    createComposite,
    updateNode,
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

  const handleAddMediaFromExtension = useCallback(
    (mediaType: string, uri: string, name: string) => {
      addMediaAt(getViewportCenter(), mediaType as 'image' | 'video' | 'audio', uri, name);
    },
    [addMediaAt, getViewportCenter],
  );

  const handleImportFile = useCallback(() => {
    if (vscode) {
      vscode.postMessage({ type: 'pickFile' });
    }
  }, []);

  const handlePickLibraryNodeSource = useCallback(
    (_type: CanvasNodeType, pickerMessageType: NodeLibraryPickerMessageType) => {
      if (vscode) {
        vscode.postMessage({ type: pickerMessageType });
      }
    },
    [],
  );

  const createLibraryNodeAt = useCallback(
    (type: CanvasNodeType, position: { x: number; y: number }) => {
      if (!isNodeLibraryDirectCreateType(type)) {
        const pickerMessageType = getNodeLibraryPickerMessageType(type);
        if (pickerMessageType && vscode) {
          vscode.postMessage({ type: pickerMessageType });
        }
        return;
      }
      const currentNodes = useCanvasStore.getState().canvasData?.nodes ?? [];
      const node = buildCanvasNode({
        type,
        position,
        data: {},
        zIndex: currentNodes.length,
      });
      const id = addNode(node);
      if (id) {
        selectNode(id);
        reportAction('node.create', type);
      }
    },
    [addNode, reportAction, selectNode],
  );

  const handleCreateLibraryNode = useCallback(
    (type: CanvasNodeType) => {
      createLibraryNodeAt(type, getViewportCenter());
    },
    [createLibraryNodeAt, getViewportCenter],
  );

  const handleDropLibraryNode = useCallback(
    (type: CanvasNodeType, position: { x: number; y: number }) => {
      createLibraryNodeAt(type, position);
    },
    [createLibraryNodeAt],
  );

  const handleLoadSubsystem = useCallback((subsystemId: CanvasSubsystemId) => {
    void WEBVIEW_SUBSYSTEM_REGISTRY.load(subsystemId)
      .then((registration) => {
        setSubsystemNodeTypeDescriptors((current) => ({
          ...current,
          ...(registration.nodeTypeDescriptors ?? {}),
        }));
      })
      .catch((error: unknown) => {
        logger.warn(`Failed to load Canvas subsystem "${subsystemId}"`, error);
      });
  }, []);

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
    onDropNodeType: handleDropLibraryNode,
  });

  // =========================================================================
  // VSCode messages
  // =========================================================================

  const { isReady, keyboardActionRef } = useVSCodeMessages({
    vscode,
    defaultCanvasData: DEFAULT_CANVAS_DATA,
    setCanvasData,
    onCanvasDataLoaded: (data) => {
      const documentKey = createCanvasViewportSnapshotKey(data);
      seedViewportFromDocument(
        documentKey,
        readCanvasViewportSnapshot(vscode, documentKey) ??
          data.viewport ??
          DEFAULT_RUNTIME_VIEWPORT,
      );
    },
    onAddMediaFromExtension: handleAddMediaFromExtension,
    onImportGeneratedAsset: (asset) => {
      const nodeInput = getImportedGeneratedAssetNodeInput(asset);
      addMediaAt(getViewportCenter(), asset.mediaType, nodeInput.assetPath, asset.name, {
        ...(nodeInput.documentResourceRef
          ? { documentResourceRef: nodeInput.documentResourceRef }
          : {}),
        ...(nodeInput.resourceRef ? { resourceRef: nodeInput.resourceRef } : {}),
        ...(nodeInput.runtimeAssetPath ? { runtimeAssetPath: nodeInput.runtimeAssetPath } : {}),
      });
    },
    onDropAssets: (assets: CanvasDroppedAsset[]) => {
      const pos = dropPositionRef.current ?? getViewportCenter();
      assets.forEach((asset, i) => {
        const offset = i * 30;
        const dropPos = { x: pos.x + offset, y: pos.y + offset };
        switch (asset.kind) {
          case 'media':
            addMediaAt(dropPos, asset.mediaType, asset.path, asset.name);
            break;
          case 'script':
            addScriptAt(dropPos, asset.path, asset.title);
            break;
          case 'document':
            addDocumentAt(dropPos, asset.path, asset.title, asset.docType);
            break;
          case 'model':
            addModelAt(dropPos, asset.path, asset.modelName, asset.modelType, asset.role);
            break;
          case 'canvas':
            addCanvasEmbedAt(dropPos, asset.path, asset.title);
            break;
          case 'project':
            addProjectAt(dropPos, asset.path, asset.title, asset.projectType);
            break;
        }
      });
      dropPositionRef.current = null;
    },
    onBuildPromptResult: (prompt) => {
      buildPromptResolverRef.current?.(prompt);
      buildPromptResolverRef.current = null;
    },
    onProjectionStatus: (status: ProjectedCanvasStatus) => {
      const state = useCanvasStore.getState();
      if (!state.canvasData) return;
      state.updateCanvasData({
        projectionStatus: {
          ...((state.canvasData as { projectionStatus?: ProjectedCanvasStatus })
            .projectionStatus ?? { state: 'clean' }),
          ...status,
        },
      } as Partial<CanvasData>);
    },
    onProjectionSourceChanged: () => {
      const state = useCanvasStore.getState();
      if (!state.canvasData?.projected) return;
      state.updateCanvasData({
        projectionStatus: {
          ...((state.canvasData as { projectionStatus?: ProjectedCanvasStatus })
            .projectionStatus ?? { state: 'clean' }),
          state: 'source-changed',
          updatedAt: Date.now(),
        },
      } as Partial<CanvasData>);
    },
    onGenerationProgress: ({ nodeId, childNodeId, status, dataUrl }) => {
      const node = useCanvasStore.getState().canvasData?.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      if (node.type === 'shot') {
        if (status === 'done' && dataUrl) {
          const shotNode = node as import('@neko/shared').ShotCanvasNode;
          const history = appendSelectedGenerationCandidate(shotNode.data.generationHistory ?? [], {
            id: `v-${Date.now()}`,
            dataUrl,
            prompt: '',
            timestamp: Date.now(),
            selected: true,
          });
          updateNodeData(nodeId, {
            generationStatus: 'done',
            generatedImage: dataUrl,
            generationHistory: history,
          });
        } else {
          updateNodeData(nodeId, { generationStatus: status });
        }
      } else if (node.type === 'gallery' && childNodeId) {
        // Legacy cells path — will be replaced by childPlacements metadata update
        const galleryNode = node as import('@neko/shared').GalleryCanvasNode;
        const cells = galleryNode.data.cells?.map((c) =>
          c.id === childNodeId
            ? (() => {
                if (status === 'done' && dataUrl) {
                  const history = appendSelectedGenerationCandidate(c.generationHistory ?? [], {
                    id: `gallery-${childNodeId}-${Date.now()}`,
                    dataUrl,
                    prompt: '',
                    timestamp: Date.now(),
                    selected: true,
                  });
                  return {
                    ...c,
                    generationStatus: 'done' as const,
                    image: dataUrl,
                    generationHistory: history,
                  };
                }
                return {
                  ...c,
                  generationStatus:
                    status as import('@neko/shared').GalleryCell['generationStatus'],
                };
              })()
            : c,
        );
        if (cells) updateNodeData(nodeId, { cells });
      }
    },
    onScriptIndexResult: (nodeId, scenes) => {
      updateNodeData(nodeId, { scenes });
    },
    onModelInstalledResult: (nodeId, installedVersion) => {
      updateNodeData(nodeId, { installedVersion: installedVersion ?? undefined });
    },
    onTimelineSync: (payload) => {
      payload.shots.forEach(({ shotId, projectName, importedAt }) => {
        const node = useCanvasStore.getState().canvasData?.nodes.find((n) => n.id === shotId);
        if (node?.type !== 'shot') return;
        updateNodeData(shotId, {
          lastImportedToTimelineAt: importedAt ?? node.data.lastImportedToTimelineAt,
          lastImportedToTimelineProject: projectName ?? node.data.lastImportedToTimelineProject,
        });
      });
    },
    onUpdateNodeImage: (nodeId, imageData, childNodeId) => {
      // Sketch round-trip: update the shot node's generatedImage and append to history
      const node = useCanvasStore.getState().canvasData?.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      if (node.type === 'shot') {
        const shotNode = node as import('@neko/shared').ShotCanvasNode;
        const history = appendSelectedGenerationCandidate(shotNode.data.generationHistory ?? [], {
          id: `sketch-${Date.now()}`,
          dataUrl: imageData,
          prompt: '',
          timestamp: Date.now(),
          selected: true,
        });
        updateNodeData(nodeId, {
          generatedImage: imageData,
          generationHistory: history,
        });
      } else if (node.type === 'gallery' && childNodeId) {
        // Legacy cells path — will be replaced by childPlacements metadata update
        const galleryNode = node as import('@neko/shared').GalleryCanvasNode;
        const cells = galleryNode.data.cells?.map((c) =>
          c.id === childNodeId
            ? {
                ...c,
                image: imageData,
                generationHistory: appendSelectedGenerationCandidate(c.generationHistory ?? [], {
                  id: `gallery-sketch-${childNodeId}-${Date.now()}`,
                  dataUrl: imageData,
                  prompt: '',
                  timestamp: Date.now(),
                  selected: true,
                }),
              }
            : c,
        );
        if (cells) updateNodeData(nodeId, { cells });
      }
    },
    onKeyboardFocusChange: setKeyboardFocused,
    isKeyboardFocusedRef,
    isComposingRef,
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
        preset: nodeSpec.preset,
      });
      return useCanvasStore.getState().addNode(node);
    },
    deriveNode: (request) => useCanvasStore.getState().deriveNode(request),
    createConnection: (request) => {
      if (!request.sourceId || !request.targetId) {
        throw new Error('Connection sourceId and targetId are required');
      }
      const connectionId = useCanvasStore.getState().addConnection({
        sourceId: request.sourceId,
        sourceAnchor: request.sourceAnchor ?? 'right',
        targetId: request.targetId,
        targetAnchor: request.targetAnchor ?? 'left',
        ...(request.type ? { type: request.type } : {}),
        ...(request.label ? { label: request.label } : {}),
        ...(request.priority !== undefined ? { priority: request.priority } : {}),
        ...(request.extension ? { extension: request.extension } : {}),
        sourceEndpoint: { nodeId: request.sourceId, scope: 'node' },
        targetEndpoint: { nodeId: request.targetId, scope: 'node' },
      });
      const connection = useCanvasStore
        .getState()
        .canvasData?.connections.find((item) => item.id === connectionId);
      return { connectionId, connection };
    },
    createComposite: (request) => useCanvasStore.getState().createComposite(request),
    updateBlock: (request) => useCanvasStore.getState().updateBlock(request),
    extractStructuredContent: (request) =>
      useCanvasStore.getState().extractStructuredContent(request),
    getActiveContext: (request) => {
      const state = useCanvasStore.getState();
      return createCanvasAgentActiveContext({
        nodes: state.canvasData?.nodes ?? [],
        connections: state.canvasData?.connections ?? [],
        canvasData: state.canvasData
          ? {
              narrative: state.canvasData.narrative,
              behavior: state.canvasData.behavior,
              entityGraph: state.canvasData.entityGraph,
              memoryGraph: state.canvasData.memoryGraph,
            }
          : undefined,
        selectedNodeIds: state.selection.nodeIds,
        viewport: state.canvasData?.viewport,
        insertionPoint: getViewportCenter(),
        request,
      });
    },
    applyAgentContent: (payload) => useCanvasStore.getState().applyAgentContent(payload),
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
    if (!isHudVisible) return;
    const el = zoomControlsRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMiniMapWidth(el.offsetWidth));
    ro.observe(el);
    setMiniMapWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, [isReady, isHudVisible]);

  const minimapRefreshDecision = useMemo(
    () =>
      resolveCanvasRenderRefreshDecision({
        nodes,
        connections,
        phase: isHudVisible ? 'fast-viewport' : 'idle',
      }),
    [connections, isHudVisible, nodes],
  );
  const minimapViewport = useThrottledCanvasViewport(viewport, {
    enabled: minimapRefreshDecision.shouldThrottleViewportProjection,
    intervalMs: 100,
  });

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

  const handleCanvasEmbedOpen = useCallback((canvasPath: string) => {
    vscode?.postMessage({ type: 'openDocument', docPath: canvasPath });
  }, []);

  const handleModelCheckInstalled = useCallback((nodeId: string, modelPath: string) => {
    vscode?.postMessage({ type: 'checkModelInstalled', nodeId, modelPath });
  }, []);

  const handleRemoveContainerChild = useCallback(
    (containerId: string, childId: string) => {
      removeChildFromContainer(containerId, childId);
    },
    [removeChildFromContainer],
  );

  // =========================================================================
  // Generation panel
  // =========================================================================

  const generationPanelTarget: GenerationPanelTarget | null =
    generationPanelState.visible && generationPanelState.nodeId
      ? {
          nodeId: generationPanelState.nodeId,
          childNodeId: generationPanelState.childNodeId ?? undefined,
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
        childNodeId: target.childNodeId,
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
    addSceneGroupAt,
    addShotAt,
    addGalleryAt,
    addTableAt,
    handleImportFile,
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

  const closeTransientKeyboardSurface = useCallback(() => {
    if (generationPanelState.visible) {
      closeGenerationPanel();
      return true;
    }
    if (contentOverlayState.visible) {
      closeContentOverlay();
      return true;
    }
    return false;
  }, [
    closeContentOverlay,
    closeGenerationPanel,
    contentOverlayState.visible,
    generationPanelState.visible,
  ]);

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
    closeTransientSurface: closeTransientKeyboardSurface,
    reportAction,
    isKeyboardFocusedRef,
    isComposingRef,
  });

  const keyboardState = useMemo<CanvasKeyboardState>(
    () => ({
      canDeleteSelection: selectedNodeIds.length > 0 || selectedConnectionIds.length > 0,
      canGenerateSelection: selectedNodeIds.length > 0,
      hasNodes: nodes.length > 0,
      isKeyboardFocused,
    }),
    [isKeyboardFocused, nodes.length, selectedConnectionIds.length, selectedNodeIds.length],
  );

  useCanvasKeyboardController({
    state: keyboardState,
    onDeleteSelected: () => handleKeyboardAction('deleteSelected'),
    onEscape: () => handleKeyboardAction('escape'),
    onSelectAll: () => handleKeyboardAction('selectAll'),
    onUndo: () => handleKeyboardAction('undo'),
    onRedo: () => handleKeyboardAction('redo'),
    onCopy: () => handleKeyboardAction('copy'),
    onCut: () => handleKeyboardAction('cut'),
    onPaste: () => handleKeyboardAction('paste'),
    onPasteInPlace: () => handleKeyboardAction('pasteInPlace'),
    onDuplicate: () => handleKeyboardAction('duplicate'),
    onGenerateSelected: () => handleKeyboardAction('generateSelected'),
    onSpacePanStart: () => setIsSpacePanActive(true),
    onSpacePanEnd: () => setIsSpacePanActive(false),
    onTogglePanMode: togglePanMode,
  });

  // Keep ref in sync with latest handler (for VSCode message dispatch)
  keyboardActionRef.current = handleKeyboardAction;

  useEffect(() => {
    if (!vscode || !canvasData) {
      viewportSnapshotPolicyRef.current?.cancel();
      viewportSnapshotPolicyRef.current = null;
      return;
    }

    const documentKey = createCanvasViewportSnapshotKey(canvasData);
    viewportSnapshotPolicyRef.current?.cancel();
    viewportSnapshotPolicyRef.current = createViewportSnapshotPolicy({
      writer: {
        writeSnapshot: (snapshot) => writeCanvasViewportSnapshot(vscode, documentKey, snapshot),
      },
    });

    return () => {
      viewportSnapshotPolicyRef.current?.flush('close');
      viewportSnapshotPolicyRef.current = null;
    };
  }, [canvasData, vscode]);

  useEffect(() => {
    viewportSnapshotPolicyRef.current?.schedule(viewport);
  }, [viewport]);

  useEffect(() => {
    if (!vscode) return;
    const flushViewportSnapshot = () => viewportSnapshotPolicyRef.current?.flush('blur');
    window.addEventListener('blur', flushViewportSnapshot);
    return () => window.removeEventListener('blur', flushViewportSnapshot);
  }, [vscode]);

  // =========================================================================
  // Debounced save
  // =========================================================================

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDataRef = useRef<string | null>(null);

  useEffect(() => {
    if (!vscode || !isReady || !canvasData) return;
    const currentDataFingerprint = createCanvasDocumentSaveFingerprint(canvasData);
    if (currentDataFingerprint === lastSavedDataRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      lastSavedDataRef.current = currentDataFingerprint;
      viewportSnapshotPolicyRef.current?.flush('save');
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
    if (!vscode) return;
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as { type?: unknown; _requestId?: unknown; error?: unknown };
      if (message.type !== '_response' || typeof message._requestId !== 'number') return;
      const pending = projectionResolversRef.current.get(message._requestId);
      if (!pending) return;
      projectionResolversRef.current.delete(message._requestId);
      if (typeof message.error === 'string') {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(event.data);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!vscode || !canvasData) return;
    const projectionStatus = (canvasData as { projectionStatus?: ProjectedCanvasStatus })
      .projectionStatus;
    const narrativeSnapshotFingerprint = JSON.stringify({
      name: canvasData.name,
      nodes: canvasData.nodes,
      connections: canvasData.connections,
      narrative: canvasData.narrative,
    });
    const fingerprint = `${narrativeSnapshotFingerprint}:${selectedNodeIds.join(',')}:${activeSubsystemKey}:${projectionStatus?.state ?? 'none'}:${projectionStatus?.message ?? ''}`;
    if (fingerprint === lastSyncRef.current) return;
    lastSyncRef.current = fingerprint;
    vscode.postMessage({
      type: 'canvasStatus',
      data: {
        version: canvasData.version,
        name: canvasData.name,
        nodes: canvasData.nodes,
        connections: canvasData.connections,
        viewport,
        narrative: canvasData.narrative,
        _selection: { nodeIds: selectedNodeIds },
        _subsystemStatus: {
          activeSubsystems: activeSubsystemIds,
          nodeTypeSummary,
        },
        projectionStatus,
      },
    });
  }, [
    nodes.length,
    connections.length,
    selectedNodeIds,
    canvasData,
    activeSubsystemIds,
    activeSubsystemKey,
    nodeTypeSummary,
  ]);

  const projectionHealthKey = canvasData?.projected
    ? JSON.stringify((canvasData as { projectionSource?: unknown }).projectionSource ?? null)
    : '';

  useEffect(() => {
    if (!projectionHealthKey) return;
    void requestProjectionWriteBack([]).then(
      () => {
        useCanvasStore.getState().updateCanvasData({
          projectionStatus: { state: 'clean', updatedAt: Date.now() },
        } as Partial<CanvasData>);
      },
      (error) => {
        useCanvasStore.getState().updateCanvasData({
          projectionStatus: {
            state: 'writeback-error',
            message: error instanceof Error ? error.message : String(error),
            updatedAt: Date.now(),
          },
        } as Partial<CanvasData>);
      },
    );
  }, [projectionHealthKey, requestProjectionWriteBack]);

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
  const handleNodeMove = useCallback(
    (nodeId: string, position: { x: number; y: number }) => moveNodeEnd(nodeId, position),
    [moveNodeEnd],
  );
  const handleNodeResizeEnd = useCallback(
    (nodeId: string, size: { width: number; height: number }, position: { x: number; y: number }) =>
      resizeNodeEnd(nodeId, size, position),
    [resizeNodeEnd],
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
    <div
      ref={rootRef}
      className="canvas-workbench-root"
      data-neko-keyboard-focused={isKeyboardFocused ? 'true' : 'false'}
    >
      <CreativeWorkbenchShell
        className="canvas-workbench-shell"
        bodyClassName="canvas-workbench-body"
        mainClassName="canvas-main-panel"
        mainKind="canvas"
        leftRail={
          <CanvasToolbar
            onUndo={undo}
            onRedo={redo}
            isNodeLibraryVisible={isRightNodeTreeVisible}
            onToggleNodeLibrary={() => setIsRightNodeTreeVisible((visible) => !visible)}
            onOpenNarrativePreview={() => {
              reportAction('openNarrativePreview', t('toolbar.narrativePreview'));
            }}
            onOpenExport={() => {
              reportAction('openExport', t('toolbar.export'));
            }}
            onOpenPackage={() => {
              reportAction('openPackage', t('toolbar.package'), undefined, canvasData);
            }}
            isHudVisible={isHudVisible}
            onToggleHud={() => setIsHudVisible((visible) => !visible)}
            isPanMode={isPanMode}
            onTogglePanMode={togglePanMode}
          />
        }
        main={
          <div
            ref={canvasContainerRef}
            className="canvas-main-surface"
            style={{ backgroundColor: 'var(--canvas-bg)' }}
            {...getKeyboardBoundaryMetadata({
              scope: 'editor',
              ownerId: 'canvas-editor',
              priority: 0,
            })}
            tabIndex={-1}
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
              onNodeMove={handleNodeMove}
              onNodeResizeEnd={handleNodeResizeEnd}
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
              onCanvasEmbedOpen={handleCanvasEmbedOpen}
              onModelCheckInstalled={handleModelCheckInstalled}
              onRemoveContainerChild={handleRemoveContainerChild}
              onConnectionUpdate={updateConnection}
              expandedNodeId={expandedNodeId}
              isPanMode={isPanMode}
              isSpacePanActive={isSpacePanActive}
            />

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

            {isHudVisible && (
              <div
                id="canvas-hud-controls"
                className="absolute bottom-4 left-4 z-10 flex flex-col items-start gap-2"
              >
                <MiniMap
                  nodes={nodes}
                  viewport={minimapViewport}
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
            )}

            {contextMenu && (
              <ContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                items={contextMenu.items}
                onClose={closeContextMenu}
              />
            )}

            <FloatingPanelHost panels={floatingPanels} />

            <GenerationPromptPanel
              visible={generationPanelState.visible}
              target={generationPanelTarget}
              onGenerate={handlePanelGenerate}
              onClose={closeGenerationPanel}
              onRequestAutoPrompt={handlePanelAutoPrompt}
            />

            {contentOverlayState.visible && contentOverlayState.nodeId && (
              <ContentOverlay nodeId={contentOverlayState.nodeId} onClose={closeContentOverlay} />
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
        }
        rightPanel={
          isRightNodeTreeVisible ? (
            <NodeLibraryPanel
              coreDescriptors={coreNodeTypeDescriptors}
              subsystemManifests={WEBVIEW_SUBSYSTEM_REGISTRY.manifests}
              nodeTypeDescriptors={subsystemNodeTypeDescriptors}
              activeSubsystemIds={activeSubsystemIds}
              onCreateNode={handleCreateLibraryNode}
              onPickNodeSource={handlePickLibraryNodeSource}
              onLoadSubsystem={handleLoadSubsystem}
            />
          ) : undefined
        }
      />
    </div>
  );
}
