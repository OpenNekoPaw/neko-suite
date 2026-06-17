import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  getKeyboardBoundaryMetadata,
  useFocusedWebviewRoot,
  useReportWebviewKeyboardEditable,
  useReportWebviewKeyboardFocus,
} from '@neko/ui/keyboard';
import { CreativeWorkbenchShell } from '@neko/ui/workbench';
import { projectCanvasShotPrompt, validateCanvasBoardRef } from '@neko/shared';
import type {
  CanvasBoardNavigationDiagnostic,
  CanvasBoardRef,
  CanvasData,
  CanvasDroppedAsset,
  CanvasNode,
  CanvasNodeType,
  CanvasSubsystemId,
  CanvasViewport,
  GeneratedImageVersion,
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
import { createStoryboardNodeTypeDescriptors } from './subsystems/storyboard/descriptors';
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
const BASIC_CANVAS_SUBSYSTEM_IDS: readonly CanvasSubsystemId[] = ['storyboard'];
const logger = getLogger('CanvasApp');
type CanvasRightDockMode = 'basic' | 'professional';

function resolveNodeGenerationPrompt(node: CanvasData['nodes'][number] | undefined): string {
  return node ? (projectCanvasShotPrompt(node)?.prompt ?? '') : '';
}

function updateGalleryChildGeneration(
  galleryId: string,
  childNodeId: string,
  update: {
    status?: string;
    imageData?: string;
    historyIdPrefix: string;
  },
): void {
  const state = useCanvasStore.getState();
  const canvasData = state.canvasData;
  if (!canvasData) return;

  const gallery = canvasData.nodes.find((node) => node.id === galleryId);
  const child = canvasData.nodes.find((node) => node.id === childNodeId);
  if (gallery?.type !== 'gallery' || child?.type !== 'media') return;

  const previousMetadata = gallery.container?.childPlacements?.[childNodeId]?.metadata ?? {};
  const previousHistory: GeneratedImageVersion[] = Array.isArray(
    previousMetadata['generationHistory'],
  )
    ? previousMetadata['generationHistory'].filter(
        (entry): entry is GeneratedImageVersion =>
          typeof entry === 'object' && entry !== null && !Array.isArray(entry),
      )
    : [];
  const generationHistory = update.imageData
    ? appendSelectedGenerationCandidate(previousHistory, {
        id: `${update.historyIdPrefix}-${childNodeId}-${Date.now()}`,
        dataUrl: update.imageData,
        prompt: '',
        timestamp: Date.now(),
        selected: true,
      })
    : previousHistory;

  const nextNodes = canvasData.nodes.map((node): CanvasNode => {
    if (node.id === childNodeId && node.type === 'media' && update.imageData) {
      return {
        ...node,
        data: {
          ...node.data,
          assetPath: update.imageData,
          mediaType: 'image',
        },
      };
    }

    if (node.id === galleryId && node.type === 'gallery') {
      return {
        ...node,
        container: {
          policy: 'gallery',
          childIds: [],
          ...(node.container ?? {}),
          childPlacements: {
            ...(node.container?.childPlacements ?? {}),
            [childNodeId]: {
              childId: childNodeId,
              ...(node.container?.childPlacements?.[childNodeId] ?? {}),
              metadata: {
                ...previousMetadata,
                ...(update.status ? { generationStatus: update.status } : {}),
                ...(update.imageData ? { generationHistory } : {}),
              },
            },
          },
        },
      };
    }

    return node;
  });

  state.updateCanvasData({ nodes: nextNodes });
}

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
  const [rightDockMode, setRightDockMode] = useState<CanvasRightDockMode>('basic');
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
  const setPlaybackEntry = useCanvasStore((state) => state.setPlaybackEntry);
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
  const basicNodeLibrarySubsystemManifests = useMemo(
    () =>
      BASIC_CANVAS_SUBSYSTEM_IDS.flatMap((id) => {
        const manifest = WEBVIEW_SUBSYSTEM_REGISTRY.getManifest(id);
        return manifest ? [manifest] : [];
      }),
    [],
  );
  const basicNodeLibraryDescriptors = useMemo(() => createStoryboardNodeTypeDescriptors(), []);

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
    (
      mediaType: string,
      uri: string,
      name: string,
      options?: { runtimeAssetPath?: string; originalPath?: string },
    ) => {
      addMediaAt(getViewportCenter(), mediaType as 'image' | 'video' | 'audio', uri, name, {
        ...(options?.runtimeAssetPath ? { runtimeAssetPath: options.runtimeAssetPath } : {}),
      });
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
            addMediaAt(dropPos, asset.mediaType, asset.path, asset.name, {
              ...(asset.runtimeAssetPath ? { runtimeAssetPath: asset.runtimeAssetPath } : {}),
            });
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
        updateGalleryChildGeneration(nodeId, childNodeId, {
          status,
          imageData: status === 'done' ? dataUrl : undefined,
          historyIdPrefix: 'gallery',
        });
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
        updateGalleryChildGeneration(nodeId, childNodeId, {
          imageData,
          historyIdPrefix: 'gallery-sketch',
        });
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
        targetId: request.targetId,
        ...(request.type ? { type: request.type } : {}),
        ...(request.label ? { label: request.label } : {}),
        ...(request.priority !== undefined ? { priority: request.priority } : {}),
        ...(request.extension ? { extension: request.extension } : {}),
        sourceEndpoint: request.sourceEndpoint ?? { nodeId: request.sourceId, scope: 'node' },
        targetEndpoint: request.targetEndpoint ?? { nodeId: request.targetId, scope: 'node' },
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
              name: state.canvasData.name,
              creativeScope: state.canvasData.creativeScope,
              relatedBoards: state.canvasData.relatedBoards,
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
    upsertNarrativeProductionBinding: (request) =>
      useCanvasStore.getState().upsertNarrativeProductionBinding(request),
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
    openGenerationPanel(nodeId, undefined, resolveNodeGenerationPrompt(node));
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
    openGenerationPanel(nodeId, undefined, resolveNodeGenerationPrompt(node), {
      generateVideo: true,
    });
  }, [selectedNodeIds, nodes, openGenerationPanel]);

  /** Open GenerationPromptPanel with ControlNet pre-selected */
  const handleEditWithControlNet = useCallback(() => {
    const nodeId = selectedNodeIds[0];
    if (!nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    openGenerationPanel(nodeId, undefined, resolveNodeGenerationPrompt(node), {
      controlMode: 'depth',
    });
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

  const handleCanvasBoardRefOpen = useCallback((ref: CanvasBoardRef) => {
    vscode?.postMessage({ type: 'openCanvasBoardRef', ref });
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
    onSetPlaybackEntry: setPlaybackEntry,
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
    (nodeId: string, handleId: string) => startConnection(nodeId, handleId),
    [startConnection],
  );
  const handleConnectionComplete = useCallback(
    (
      sourceNodeId: string,
      sourceHandleId: string,
      targetNodeId: string,
      targetHandleId: string,
    ) => {
      startConnection(sourceNodeId, sourceHandleId);
      completeConnection(targetNodeId, targetHandleId);
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
            {canvasData && (
              <CanvasBoardNavigationBar
                canvasData={canvasData}
                onOpenBoardRef={handleCanvasBoardRefOpen}
              />
            )}
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
                className="canvas-hud-controls absolute bottom-4 left-4 z-10 flex flex-col items-start gap-2"
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
        rightDock={
          isRightNodeTreeVisible
            ? {
                id: 'canvas-right-node-tree-panel',
                panelId: 'canvas.nodeLibraryDock',
                defaultSize: 280,
                minSize: 220,
                maxSize: 420,
                label: t('library.title'),
                className: 'canvas-right-node-tree-panel',
                contentClassName: 'canvas-right-node-tree-panel-content',
                resizeHandleClassName: 'canvas-right-node-tree-resize-handle',
                resizePersistence: { api: vscode },
                groups: {
                  label: t('rightDock.mode.label'),
                  activeId: rightDockMode,
                  onActiveIdChange: (id) => setRightDockMode(toCanvasRightDockMode(id)),
                  items: [
                    {
                      id: 'basic',
                      label: t('rightDock.mode.basic'),
                      description: t('rightDock.mode.basic.description'),
                    },
                    {
                      id: 'professional',
                      label: t('rightDock.mode.professional'),
                      description: t('rightDock.mode.professional.description'),
                    },
                  ],
                },
                containerProps: {
                  'data-canvas-right-node-tree': 'true',
                  ...getKeyboardBoundaryMetadata({
                    scope: 'property-panel',
                    ownerId: 'canvas-node-library',
                    priority: 10,
                    ownedKeys: [
                      'Enter',
                      'Escape',
                      'Space',
                      'Tab',
                      'ArrowUp',
                      'ArrowDown',
                      'ArrowLeft',
                      'ArrowRight',
                    ],
                  }),
                },
                children: (
                  <NodeLibraryPanel
                    coreDescriptors={coreNodeTypeDescriptors}
                    subsystemManifests={
                      rightDockMode === 'professional'
                        ? WEBVIEW_SUBSYSTEM_REGISTRY.manifests
                        : basicNodeLibrarySubsystemManifests
                    }
                    nodeTypeDescriptors={
                      rightDockMode === 'professional'
                        ? subsystemNodeTypeDescriptors
                        : basicNodeLibraryDescriptors
                    }
                    activeSubsystemIds={rightDockMode === 'professional' ? activeSubsystemIds : []}
                    onCreateNode={handleCreateLibraryNode}
                    onPickNodeSource={handlePickLibraryNodeSource}
                    onLoadSubsystem={handleLoadSubsystem}
                  />
                ),
              }
            : undefined
        }
      />
    </div>
  );
}

function toCanvasRightDockMode(id: string): CanvasRightDockMode {
  return id === 'professional' ? 'professional' : 'basic';
}

function CanvasBoardNavigationBar({
  canvasData,
  onOpenBoardRef,
}: {
  canvasData: CanvasData;
  onOpenBoardRef: (ref: CanvasBoardRef) => void;
}) {
  const relatedBoards = canvasData.relatedBoards ?? [];
  const diagnostics = relatedBoards.flatMap((board) =>
    validateCanvasBoardRef(board.ref).map((diagnostic) => ({
      ...diagnostic,
      boardId: board.boardId,
      role: board.role,
    })),
  );

  if (relatedBoards.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex min-w-0 flex-wrap items-center gap-2">
      {relatedBoards.slice(0, 6).map((board, index) => {
        const boardDiagnostics = validateCanvasBoardRef(board.ref);
        const disabled = boardDiagnostics.some((diagnostic) => diagnostic.severity === 'error');
        const label = board.label || board.scope?.title || board.boardId || board.role;
        return (
          <button
            key={`${board.boardId ?? board.role}:${index}`}
            type="button"
            className="pointer-events-auto min-w-0 max-w-[180px] truncate rounded-md border border-[var(--toolbar-border)] bg-[var(--toolbar-bg)] px-2 py-1 text-xs text-[var(--toolbar-fg)] shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
            title={
              disabled ? boardDiagnostics.map((diagnostic) => diagnostic.message).join('\n') : label
            }
            onClick={(event) => {
              event.stopPropagation();
              onOpenBoardRef(board.ref);
            }}
          >
            {label}
          </button>
        );
      })}

      {diagnostics.length > 0 && <CanvasBoardDiagnostics diagnostics={diagnostics} />}
    </div>
  );
}

function CanvasBoardDiagnostics({
  diagnostics,
}: {
  diagnostics: readonly CanvasBoardNavigationDiagnostic[];
}) {
  return (
    <div
      className="pointer-events-auto rounded-md border border-[var(--color-warning-border)] bg-[var(--toolbar-bg)] px-2 py-1 text-[10px] text-[var(--toolbar-fg-secondary)] shadow-sm"
      title={diagnostics.map((diagnostic) => diagnostic.message).join('\n')}
    >
      {t('scopeNavigation.issueCount', { count: diagnostics.length })}
    </div>
  );
}
