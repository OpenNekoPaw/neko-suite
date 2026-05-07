import { create } from 'zustand';
import type {
  CanvasData,
  CanvasNode,
  CanvasConnection,
  CanvasViewport,
  PortDefinition,
  SceneGroupCanvasNode,
  ShotCanvasNode,
} from '@neko/shared';
import {
  getDefaultPorts,
  arePortTypesCompatible,
  isSceneGroupNode,
  isShotNode,
} from '@neko/shared';
import { useHistoryStore } from './historyStore';
import { useCanvasOperationStore } from './canvasOperationStore';

// =============================================================================
// Types
// =============================================================================

export interface CanvasSelection {
  nodeIds: string[];
  connectionIds: string[];
}

export interface GenerationPanelState {
  visible: boolean;
  /** Target ShotNode or GalleryNode ID */
  nodeId: string | null;
  /** Target GalleryCell ID (null = shot-level generation) */
  cellId?: string | null;
  /** Pre-filled prompt from AutoPrompt or shot.visualDescription */
  initialPrompt?: string;
  /** Pre-fill ControlNet mode (from "ControlNet Edit" menu) */
  initialControlMode?: string;
  /** Pre-fill video generation mode (from "Generate Video" menu) */
  initialGenerateVideo?: boolean;
}

export interface CanvasStore {
  // ==================== State ====================
  canvasData: CanvasData | null;
  selection: CanvasSelection;
  isConnecting: boolean;
  pendingConnectionSource: { nodeId: string; anchor: string } | null;
  /** Currently playing media node ID (only one at a time) */
  activePlayingNodeId: string | null;
  /** Generation prompt panel state */
  generationPanelState: GenerationPanelState;

  // ==================== Generation Panel Actions ====================
  openGenerationPanel: (
    nodeId: string,
    cellId?: string,
    initialPrompt?: string,
    opts?: { controlMode?: string; generateVideo?: boolean },
  ) => void;
  closeGenerationPanel: () => void;

  // ==================== Data Actions ====================
  setCanvasData: (data: CanvasData) => void;
  updateCanvasData: (updates: Partial<CanvasData>) => void;

  // ==================== Node Actions ====================
  addNode: (node: Omit<CanvasNode, 'id'>) => string;
  updateNode: (id: string, updates: Partial<CanvasNode>) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, position: { x: number; y: number }) => void;
  /** Record history + update position (call on drag end) */
  moveNodeEnd: (id: string, position: { x: number; y: number }) => void;
  /** Real-time resize update (no history) */
  resizeNode: (
    id: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  /** Record history + final resize (call on resize end) */
  resizeNodeEnd: (
    id: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  /** Real-time rotation update (no history) */
  rotateNode: (id: string, rotation: number) => void;
  /** Record history + final rotation (call on rotate end) */
  rotateNodeEnd: (id: string, rotation: number) => void;
  /** Assign existing ShotNodes into a SceneGroupNode and optionally auto-layout them */
  assignShotsToScene: (sceneId: string, shotIds: string[], autoLayout?: boolean) => void;
  /** Reorder existing ShotNodes within a SceneGroupNode */
  reorderSceneShots: (sceneId: string, shotIds: string[], autoLayout?: boolean) => void;
  /** Auto-layout all shots owned by a scene using the current shotIds order */
  autoLayoutSceneShots: (sceneId: string) => void;
  /** Detach a ShotNode from its parent SceneGroupNode (keeps the shot on canvas) */
  detachShotFromScene: (sceneId: string, shotId: string) => void;

  /** Update node port definitions (records history) */
  updateNodePorts: (id: string, ports: PortDefinition[]) => void;

  // ==================== Reorder Actions ====================
  /** Reorder a node to a new zIndex (for layer panel drag) */
  reorderNode: (id: string, newZIndex: number) => void;

  // ==================== Group Actions ====================
  /** Group selected nodes into an existing or new group */
  groupNodes: (childIds: string[]) => string;
  /** Ungroup: remove group node, release children */
  ungroupNodes: (groupId: string) => void;

  // ==================== Connection Actions ====================
  addConnection: (connection: Omit<CanvasConnection, 'id'>) => string;
  updateConnection: (id: string, updates: Partial<CanvasConnection>) => void;
  removeConnection: (id: string) => void;
  startConnection: (nodeId: string, anchor: string) => void;
  completeConnection: (nodeId: string, anchor: string) => void;
  cancelConnection: () => void;

  // ==================== Derive Actions ====================
  /** Create a successor node positioned to the right, auto-connected. Uses targetType if given, else same type as source. */
  deriveSuccessorNode: (sourceNodeId: string, targetType?: string) => string | null;

  // ==================== Viewport Actions ====================
  setViewport: (viewport: Partial<CanvasViewport>) => void;
  panCanvas: (delta: { x: number; y: number }) => void;
  zoomCanvas: (zoom: number, center?: { x: number; y: number }) => void;
  resetViewport: () => void;

  // ==================== Selection Actions ====================
  selectNode: (id: string, multi?: boolean) => void;
  selectConnection: (id: string, multi?: boolean) => void;
  selectNodes: (ids: string[]) => void;
  clearSelection: () => void;
  deleteSelected: () => void;

  // ==================== Media Playback ====================
  /** Set the currently playing media node (null to clear) */
  setActivePlayingNode: (nodeId: string | null) => void;

  // ==================== History Actions ====================
  undo: () => void;
  redo: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/** Record current state to history before a mutation */
function recordHistory(canvasData: CanvasData | null): void {
  if (!canvasData) return;
  useHistoryStore.getState().pushState(canvasData);
}

const SCENE_LAYOUT_PADDING_X = 24;
const SCENE_LAYOUT_PADDING_TOP = 64;
const SCENE_LAYOUT_GAP_X = 24;
const SCENE_LAYOUT_GAP_Y = 24;
const SCENE_LAYOUT_MIN_COLUMN_WIDTH = 220;

function isShotInsideScene(scene: SceneGroupCanvasNode, shot: ShotCanvasNode): boolean {
  const centerX = shot.position.x + shot.size.width / 2;
  const centerY = shot.position.y + shot.size.height / 2;

  return (
    centerX >= scene.position.x &&
    centerX <= scene.position.x + scene.size.width &&
    centerY >= scene.position.y + SCENE_LAYOUT_PADDING_TOP / 2 &&
    centerY <= scene.position.y + scene.size.height
  );
}

function getSceneOwnedShots(nodes: CanvasNode[], sceneId: string): ShotCanvasNode[] {
  return nodes.filter(isShotNode).filter((node) => node.data.sceneGroupId === sceneId);
}

function sortShotsByCanvasOrder(shots: ShotCanvasNode[]): ShotCanvasNode[] {
  return [...shots].sort((a, b) => {
    if (a.position.y !== b.position.y) {
      return a.position.y - b.position.y;
    }
    return a.position.x - b.position.x;
  });
}

function getSceneShotOrder(scene: SceneGroupCanvasNode, nodes: CanvasNode[]): string[] {
  const ownedShots = getSceneOwnedShots(nodes, scene.id);
  const orderById = new Map(ownedShots.map((shot) => [shot.id, shot]));
  const explicitOrder = scene.data.shotIds.filter((shotId) => orderById.has(shotId));
  const remainingShots = ownedShots.filter((shot) => !explicitOrder.includes(shot.id));
  return [...explicitOrder, ...sortShotsByCanvasOrder(remainingShots).map((shot) => shot.id)];
}

function relinkSceneShotIds(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map((node) => {
    if (!isSceneGroupNode(node)) return node;
    const nextShotIds = getSceneShotOrder(node, nodes);
    return {
      ...node,
      data: {
        ...node.data,
        shotIds: nextShotIds,
      },
    };
  });
}

function layoutSceneShots(nodes: CanvasNode[], sceneId: string): CanvasNode[] {
  const scene = nodes.find((node) => isSceneGroupNode(node) && node.id === sceneId);
  if (!scene || !isSceneGroupNode(scene)) return nodes;

  const orderedShotIds = getSceneShotOrder(scene, nodes);
  if (orderedShotIds.length === 0) return nodes;

  const sceneWidth = Math.max(
    scene.size.width - SCENE_LAYOUT_PADDING_X * 2,
    SCENE_LAYOUT_MIN_COLUMN_WIDTH,
  );
  const shots = orderedShotIds
    .map((shotId) => nodes.find((node) => isShotNode(node) && node.id === shotId))
    .filter((node): node is ShotCanvasNode => Boolean(node));
  if (shots.length === 0) return nodes;
  const maxShotWidth = Math.max(...shots.map((shot) => shot.size.width));
  const columns = Math.max(
    1,
    Math.floor((sceneWidth + SCENE_LAYOUT_GAP_X) / (maxShotWidth + SCENE_LAYOUT_GAP_X)),
  );

  return nodes.map((node) => {
    if (!isShotNode(node)) return node;
    const shotIndex = orderedShotIds.indexOf(node.id);
    if (shotIndex < 0) return node;

    const col = shotIndex % columns;
    const row = Math.floor(shotIndex / columns);
    return {
      ...node,
      position: {
        x: scene.position.x + SCENE_LAYOUT_PADDING_X + col * (node.size.width + SCENE_LAYOUT_GAP_X),
        y:
          scene.position.y +
          SCENE_LAYOUT_PADDING_TOP +
          row * (node.size.height + SCENE_LAYOUT_GAP_Y),
      },
    };
  });
}

function syncShotSceneMembership(nodes: CanvasNode[], shotId: string): CanvasNode[] {
  const shot = nodes.find((node) => isShotNode(node) && node.id === shotId);
  if (!shot || !isShotNode(shot)) return nodes;

  const targetScene = nodes
    .filter(isSceneGroupNode)
    .find((scene) => isShotInsideScene(scene, shot));

  const nextNodes = nodes.map((node) => {
    if (!isShotNode(node) || node.id !== shotId) return node;
    return {
      ...node,
      data: {
        ...node.data,
        sceneGroupId: targetScene?.id,
      },
    };
  });

  return relinkSceneShotIds(nextNodes);
}

function createNodeIndex(nodes: CanvasNode[]): Map<string, CanvasNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function recordChangedNodesForAudit(previousNodes: CanvasNode[], nextNodes: CanvasNode[]): void {
  const previousIndex = createNodeIndex(previousNodes);

  for (const nextNode of nextNodes) {
    const previousNode = previousIndex.get(nextNode.id);
    if (!previousNode) continue;

    const previousFingerprint = JSON.stringify({
      position: previousNode.position,
      data: previousNode.data,
    });
    const nextFingerprint = JSON.stringify({
      position: nextNode.position,
      data: nextNode.data,
    });

    if (previousFingerprint === nextFingerprint) continue;

    useCanvasOperationStore.getState().recordNodeUpdate(
      nextNode.id,
      {
        position: nextNode.position,
        data: nextNode.data,
      },
      {
        position: previousNode.position,
        data: previousNode.data,
      },
    );
  }
}

// =============================================================================
// Store
// =============================================================================

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  // ==================== Initial State ====================
  canvasData: null,
  selection: { nodeIds: [], connectionIds: [] },
  isConnecting: false,
  pendingConnectionSource: null,
  activePlayingNodeId: null,
  generationPanelState: { visible: false, nodeId: null, cellId: null },

  openGenerationPanel: (nodeId, cellId, initialPrompt, opts) =>
    set({
      generationPanelState: {
        visible: true,
        nodeId,
        cellId: cellId ?? null,
        initialPrompt,
        initialControlMode: opts?.controlMode,
        initialGenerateVideo: opts?.generateVideo,
      },
    }),

  closeGenerationPanel: () =>
    set({ generationPanelState: { visible: false, nodeId: null, cellId: null } }),

  // ==================== Data Actions ====================
  setCanvasData: (data) => {
    set({ canvasData: data });
  },

  updateCanvasData: (updates) => {
    const { canvasData } = get();
    if (!canvasData) return;
    set({ canvasData: { ...canvasData, ...updates } });
  },

  // ==================== Node Actions ====================
  addNode: (node) => {
    const { canvasData } = get();
    if (!canvasData) return '';

    recordHistory(canvasData);

    const id = generateId();
    const newNode = { ...node, id } as CanvasNode;

    set({
      canvasData: {
        ...canvasData,
        nodes: [...canvasData.nodes, newNode],
      },
    });

    useCanvasOperationStore.getState().recordNodeAdd(newNode);
    return id;
  },

  updateNode: (id, updates) => {
    const { canvasData } = get();
    if (!canvasData) return;

    recordHistory(canvasData);

    const oldNode = canvasData.nodes.find((n) => n.id === id);
    const before: Partial<CanvasNode> = {};
    if (oldNode) {
      for (const key of Object.keys(updates) as Array<keyof CanvasNode>) {
        (before as any)[key] = (oldNode as any)[key];
      }
    }

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) =>
          node.id === id ? ({ ...node, ...updates } as CanvasNode) : node,
        ),
      },
    });

    useCanvasOperationStore.getState().recordNodeUpdate(id, updates, before);
  },

  updateNodeData: (id, data) => {
    const { canvasData } = get();
    if (!canvasData) return;

    recordHistory(canvasData);

    const oldNode = canvasData.nodes.find((n) => n.id === id);
    const before: Partial<CanvasNode> = {};
    if (oldNode) {
      before.data = oldNode.data;
    }

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) =>
          node.id === id ? ({ ...node, data: { ...node.data, ...data } } as CanvasNode) : node,
        ),
      },
    });

    useCanvasOperationStore
      .getState()
      .recordNodeUpdate(id, { data: { ...oldNode?.data, ...data } } as any, before);
  },

  removeNode: (id) => {
    const { canvasData, selection } = get();
    if (!canvasData) return;

    recordHistory(canvasData);

    const removedNode = canvasData.nodes.find((n) => n.id === id);
    const removedConnections = canvasData.connections.filter(
      (conn) => conn.sourceId === id || conn.targetId === id,
    );

    const filteredNodes = canvasData.nodes.filter((node) => node.id !== id);
    const nodesWithDetachedShots =
      removedNode && isSceneGroupNode(removedNode)
        ? filteredNodes.map((node) =>
            isShotNode(node) && node.data.sceneGroupId === id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    sceneGroupId: undefined,
                  },
                }
              : node,
          )
        : filteredNodes;
    const relinkedNodes = relinkSceneShotIds(nodesWithDetachedShots);

    set({
      canvasData: {
        ...canvasData,
        nodes: relinkedNodes,
        // Also remove connections involving this node
        connections: canvasData.connections.filter(
          (conn) => conn.sourceId !== id && conn.targetId !== id,
        ),
      },
      selection: {
        ...selection,
        nodeIds: selection.nodeIds.filter((nodeId) => nodeId !== id),
      },
    });

    if (removedNode) {
      useCanvasOperationStore.getState().recordNodeRemove(id, removedNode, removedConnections);
    }
  },

  moveNode: (id, position) => {
    const { canvasData } = get();
    if (!canvasData) return;

    // No history recording – called on every mousemove during drag
    const target = canvasData.nodes.find((n) => n.id === id);
    if (!target) return;

    if (isSceneGroupNode(target)) {
      const dx = position.x - target.position.x;
      const dy = position.y - target.position.y;
      const childShotIds = new Set(getSceneOwnedShots(canvasData.nodes, id).map((s) => s.id));
      set({
        canvasData: {
          ...canvasData,
          nodes: canvasData.nodes.map((node) => {
            if (node.id === id) return { ...node, position };
            if (childShotIds.has(node.id)) {
              return {
                ...node,
                position: { x: node.position.x + dx, y: node.position.y + dy },
              };
            }
            return node;
          }),
        },
      });
    } else {
      set({
        canvasData: {
          ...canvasData,
          nodes: canvasData.nodes.map((node) => (node.id === id ? { ...node, position } : node)),
        },
      });
    }
  },

  moveNodeEnd: (id, position) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const oldNode = canvasData.nodes.find((n) => n.id === id);
    recordHistory(canvasData);

    if (oldNode && isSceneGroupNode(oldNode)) {
      const dx = position.x - oldNode.position.x;
      const dy = position.y - oldNode.position.y;
      const childShotIds = new Set(getSceneOwnedShots(canvasData.nodes, id).map((s) => s.id));
      const nextNodes = canvasData.nodes.map((node) => {
        if (node.id === id) return { ...node, position };
        if (childShotIds.has(node.id)) {
          return {
            ...node,
            position: { x: node.position.x + dx, y: node.position.y + dy },
          };
        }
        return node;
      });
      set({ canvasData: { ...canvasData, nodes: nextNodes } });
    } else {
      const movedNodes = canvasData.nodes.map((node) =>
        node.id === id ? { ...node, position } : node,
      );
      const nextNodes =
        oldNode && isShotNode(oldNode) ? syncShotSceneMembership(movedNodes, id) : movedNodes;
      set({ canvasData: { ...canvasData, nodes: nextNodes } });
    }

    if (oldNode) {
      useCanvasOperationStore
        .getState()
        .recordNodeUpdate(id, { position } as any, { position: oldNode.position } as any);
    }
  },

  resizeNode: (id, size, position) => {
    const { canvasData } = get();
    if (!canvasData) return;

    // No history recording – called on every mousemove during resize
    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) =>
          node.id === id ? { ...node, size, position } : node,
        ),
      },
    });
  },

  resizeNodeEnd: (id, size, position) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const oldNode = canvasData.nodes.find((n) => n.id === id);
    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) =>
          node.id === id ? { ...node, size, position } : node,
        ),
      },
    });

    if (oldNode) {
      useCanvasOperationStore
        .getState()
        .recordNodeUpdate(
          id,
          { size, position } as any,
          { size: oldNode.size, position: oldNode.position } as any,
        );
    }
  },

  rotateNode: (id, rotation) => {
    const { canvasData } = get();
    if (!canvasData) return;

    // No history recording – called on every mousemove during rotation
    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) => (node.id === id ? { ...node, rotation } : node)),
      },
    });
  },

  rotateNodeEnd: (id, rotation) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const oldNode = canvasData.nodes.find((n) => n.id === id);
    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) => (node.id === id ? { ...node, rotation } : node)),
      },
    });

    if (oldNode) {
      useCanvasOperationStore
        .getState()
        .recordNodeUpdate(id, { rotation } as any, { rotation: oldNode.rotation } as any);
    }
  },

  assignShotsToScene: (sceneId, shotIds, autoLayout = true) => {
    const { canvasData } = get();
    if (!canvasData || shotIds.length === 0) return;

    const uniqueShotIds = [...new Set(shotIds)];
    const scene = canvasData.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === sceneId,
    );
    if (!scene) return;

    recordHistory(canvasData);

    const assignedNodes = canvasData.nodes.map((node) => {
      if (!isShotNode(node) || !uniqueShotIds.includes(node.id)) return node;
      return {
        ...node,
        data: {
          ...node.data,
          sceneGroupId: sceneId,
        },
      };
    });

    const relinkedNodes = relinkSceneShotIds(
      assignedNodes.map((node) =>
        isSceneGroupNode(node) && node.id === sceneId
          ? {
              ...node,
              data: {
                ...node.data,
                shotIds: [
                  ...node.data.shotIds.filter((shotId) => !uniqueShotIds.includes(shotId)),
                  ...uniqueShotIds,
                ],
              },
            }
          : node,
      ),
    );

    const nextNodes = autoLayout ? layoutSceneShots(relinkedNodes, sceneId) : relinkedNodes;

    set({
      canvasData: {
        ...canvasData,
        nodes: nextNodes,
      },
    });

    recordChangedNodesForAudit(canvasData.nodes, nextNodes);
  },

  reorderSceneShots: (sceneId, shotIds, autoLayout = true) => {
    const { canvasData } = get();
    if (!canvasData || shotIds.length === 0) return;

    const scene = canvasData.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === sceneId,
    );
    if (!scene) return;

    const dedupedShotIds = shotIds.filter((shotId, index) => shotIds.indexOf(shotId) === index);
    const ownedShots = getSceneOwnedShots(canvasData.nodes, sceneId).map((shot) => shot.id);
    if (
      dedupedShotIds.length !== ownedShots.length ||
      dedupedShotIds.some((shotId) => !ownedShots.includes(shotId))
    ) {
      return;
    }

    if (
      scene.data.shotIds.length === dedupedShotIds.length &&
      scene.data.shotIds.every((shotId, index) => shotId === dedupedShotIds[index])
    ) {
      return;
    }

    recordHistory(canvasData);

    const nextNodes = canvasData.nodes.map((node) =>
      isSceneGroupNode(node) && node.id === sceneId
        ? {
            ...node,
            data: {
              ...node.data,
              shotIds: dedupedShotIds,
            },
          }
        : node,
    );

    const resolvedNodes = autoLayout ? layoutSceneShots(nextNodes, sceneId) : nextNodes;

    set({
      canvasData: {
        ...canvasData,
        nodes: resolvedNodes,
      },
    });

    recordChangedNodesForAudit(canvasData.nodes, resolvedNodes);
  },

  autoLayoutSceneShots: (sceneId) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const sceneExists = canvasData.nodes.some(
      (node) => isSceneGroupNode(node) && node.id === sceneId,
    );
    if (!sceneExists) return;

    recordHistory(canvasData);
    const nextNodes = layoutSceneShots(relinkSceneShotIds(canvasData.nodes), sceneId);

    set({
      canvasData: {
        ...canvasData,
        nodes: nextNodes,
      },
    });

    recordChangedNodesForAudit(canvasData.nodes, nextNodes);
  },

  detachShotFromScene: (sceneId, shotId) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const scene = canvasData.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === sceneId,
    );
    if (!scene || !scene.data.shotIds.includes(shotId)) return;

    recordHistory(canvasData);

    const nextNodes = relinkSceneShotIds(
      canvasData.nodes.map((node) => {
        if (isShotNode(node) && node.id === shotId) {
          return { ...node, data: { ...node.data, sceneGroupId: undefined } };
        }
        if (isSceneGroupNode(node) && node.id === sceneId) {
          return {
            ...node,
            data: { ...node.data, shotIds: node.data.shotIds.filter((id) => id !== shotId) },
          };
        }
        return node;
      }),
    );

    set({ canvasData: { ...canvasData, nodes: nextNodes } });
    recordChangedNodesForAudit(canvasData.nodes, nextNodes);
  },

  updateNodePorts: (id, ports) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const oldNode = canvasData.nodes.find((n) => n.id === id);
    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) => (node.id === id ? { ...node, ports } : node)),
      },
    });

    if (oldNode) {
      useCanvasOperationStore
        .getState()
        .recordNodeUpdate(id, { ports } as any, { ports: oldNode.ports } as any);
    }
  },

  // ==================== Reorder Actions ====================
  reorderNode: (id, newZIndex) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const oldNode = canvasData.nodes.find((n) => n.id === id);
    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) =>
          node.id === id ? { ...node, zIndex: newZIndex } : node,
        ),
      },
    });

    if (oldNode) {
      useCanvasOperationStore.getState().recordNodeReorder(id, newZIndex, oldNode.zIndex);
    }
  },

  // ==================== Group Actions ====================
  groupNodes: (childIds) => {
    const { canvasData } = get();
    if (!canvasData || childIds.length === 0) return '';

    recordHistory(canvasData);

    // Calculate bounding box of children
    const children = canvasData.nodes.filter((n) => childIds.includes(n.id));
    if (children.length === 0) return '';

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const child of children) {
      minX = Math.min(minX, child.position.x);
      minY = Math.min(minY, child.position.y);
      maxX = Math.max(maxX, child.position.x + child.size.width);
      maxY = Math.max(maxY, child.position.y + child.size.height);
    }

    const padding = 20;
    const id = generateId();
    const maxZ = Math.max(...canvasData.nodes.map((n) => n.zIndex), 0);

    const groupNode = {
      id,
      type: 'group' as const,
      position: { x: minX - padding, y: minY - padding },
      size: { width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 },
      zIndex: maxZ + 1,
      locked: false,
      data: {
        childIds,
        label: 'Group',
      },
    };

    set({
      canvasData: {
        ...canvasData,
        nodes: [...canvasData.nodes, groupNode],
      },
      selection: { nodeIds: [id], connectionIds: [] },
    });

    useCanvasOperationStore.getState().recordNodeGroup(groupNode as CanvasNode, childIds);
    return id;
  },

  ungroupNodes: (groupId) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const groupNode = canvasData.nodes.find((n) => n.id === groupId);
    if (!groupNode || (groupNode.type as string) !== 'group') return;

    recordHistory(canvasData);

    const groupData = groupNode.data as { childIds: string[] };
    const childIds = groupData.childIds ?? [];

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.filter((n) => n.id !== groupId),
        // Remove connections to/from the group node
        connections: canvasData.connections.filter(
          (c) => c.sourceId !== groupId && c.targetId !== groupId,
        ),
      },
      selection: { nodeIds: childIds, connectionIds: [] },
    });

    useCanvasOperationStore.getState().recordNodeUngroup(groupId, groupNode, childIds);
  },

  // ==================== Connection Actions ====================
  addConnection: (connection) => {
    const { canvasData } = get();
    if (!canvasData) return '';

    recordHistory(canvasData);

    const id = generateId();
    const newConnection: CanvasConnection = { ...connection, id };

    set({
      canvasData: {
        ...canvasData,
        connections: [...canvasData.connections, newConnection],
      },
    });

    useCanvasOperationStore.getState().recordConnectionAdd(newConnection);
    return id;
  },

  updateConnection: (id, updates) => {
    const { canvasData } = get();
    if (!canvasData) return;

    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        connections: canvasData.connections.map((conn) =>
          conn.id === id ? { ...conn, ...updates } : conn,
        ),
      },
    });
  },

  removeConnection: (id) => {
    const { canvasData, selection } = get();
    if (!canvasData) return;

    const removedConnection = canvasData.connections.find((c) => c.id === id);
    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        connections: canvasData.connections.filter((conn) => conn.id !== id),
      },
      selection: {
        ...selection,
        connectionIds: selection.connectionIds.filter((connId) => connId !== id),
      },
    });

    if (removedConnection) {
      useCanvasOperationStore.getState().recordConnectionRemove(id, removedConnection);
    }
  },

  startConnection: (nodeId, anchor) => {
    set({
      isConnecting: true,
      pendingConnectionSource: { nodeId, anchor },
    });
  },

  completeConnection: (nodeId, anchor) => {
    const { pendingConnectionSource, canvasData } = get();
    if (!pendingConnectionSource || !canvasData) {
      set({ isConnecting: false, pendingConnectionSource: null });
      return;
    }

    // Don't connect to self
    if (pendingConnectionSource.nodeId === nodeId) {
      set({ isConnecting: false, pendingConnectionSource: null });
      return;
    }

    const sourceNode = canvasData.nodes.find((n) => n.id === pendingConnectionSource.nodeId);
    const targetNode = canvasData.nodes.find((n) => n.id === nodeId);

    if (!sourceNode || !targetNode) {
      set({ isConnecting: false, pendingConnectionSource: null });
      return;
    }

    // Resolve ports for validation
    const sourcePorts = sourceNode.ports ?? getDefaultPorts(sourceNode.type);
    const targetPorts = targetNode.ports ?? getDefaultPorts(targetNode.type);
    const sourcePort = sourcePorts.find(
      (p: PortDefinition) => p.id === pendingConnectionSource.anchor,
    );
    const targetPort = targetPorts.find((p: PortDefinition) => p.id === anchor);

    // Port-based validation (when both nodes have ports)
    if (sourcePort && targetPort) {
      // Must connect output → input
      if (sourcePort.type !== 'output' || targetPort.type !== 'input') {
        set({ isConnecting: false, pendingConnectionSource: null });
        return;
      }

      // Check data type compatibility
      if (!arePortTypesCompatible(sourcePort.dataType, targetPort.dataType)) {
        set({ isConnecting: false, pendingConnectionSource: null });
        return;
      }

      // Check max connections on target input port
      const maxConn = targetPort.maxConnections ?? 1;
      const existingCount = canvasData.connections.filter(
        (c) => c.targetId === nodeId && c.targetPort === anchor,
      ).length;
      if (existingCount >= maxConn) {
        set({ isConnecting: false, pendingConnectionSource: null });
        return;
      }
    }

    // Check if exact connection already exists
    const exists = canvasData.connections.some(
      (conn) =>
        conn.sourceId === pendingConnectionSource.nodeId &&
        conn.targetId === nodeId &&
        conn.sourcePort === pendingConnectionSource.anchor &&
        conn.targetPort === anchor,
    );

    if (!exists) {
      // Determine anchor positions from ports or use directly
      const sourceAnchor = sourcePort?.position ?? pendingConnectionSource.anchor;
      const targetAnchor = targetPort?.position ?? anchor;

      get().addConnection({
        sourceId: pendingConnectionSource.nodeId,
        sourceAnchor: sourceAnchor as CanvasConnection['sourceAnchor'],
        targetId: nodeId,
        targetAnchor: targetAnchor as CanvasConnection['targetAnchor'],
        type: 'default',
        sourcePort: sourcePort ? pendingConnectionSource.anchor : undefined,
        targetPort: targetPort ? anchor : undefined,
      });
    }

    set({ isConnecting: false, pendingConnectionSource: null });
  },

  cancelConnection: () => {
    set({ isConnecting: false, pendingConnectionSource: null });
  },

  // ==================== Derive Actions ====================
  deriveSuccessorNode: (sourceNodeId, targetType?) => {
    const { canvasData } = get();
    if (!canvasData) return null;

    const sourceNode = canvasData.nodes.find((n) => n.id === sourceNodeId);
    if (!sourceNode) return null;

    const nodeType = targetType ?? sourceNode.type;

    // Position new node to the right of source with gap
    const gap = 60;
    const newPosition = {
      x: sourceNode.position.x + sourceNode.size.width + gap,
      y: sourceNode.position.y,
    };

    // Build new node data based on target type
    let newData: Record<string, unknown> = {};
    let newSize = { ...sourceNode.size };

    if (nodeType === 'shot') {
      const srcData =
        sourceNode.type === 'shot' ? (sourceNode.data as Record<string, unknown>) : {};
      // Auto-increment shot number
      const allShotNumbers = canvasData.nodes
        .filter((n) => n.type === 'shot')
        .map((n) => (n.data as Record<string, unknown>).shotNumber as number)
        .filter((n) => typeof n === 'number');
      const nextNumber = allShotNumbers.length > 0 ? Math.max(...allShotNumbers) + 1 : 1;
      newData = {
        shotNumber: nextNumber,
        shotScale: srcData.shotScale ?? 'MS',
        cameraMovement: srcData.cameraMovement,
        cameraAngle: srcData.cameraAngle,
        duration: srcData.duration ?? 3,
        characters: [],
        emotion: [],
        generationStatus: 'idle',
        generationHistory: [],
      };
      newSize = { width: 280, height: 320 };
    } else if (nodeType === 'scene') {
      newData = { sceneTitle: '', subtitle: '', shotIds: [] };
      newSize = { width: 300, height: 200 };
    } else if (nodeType === 'gallery') {
      newData = {
        preset: 'character-3view',
        rows: 1,
        cols: 3,
        cells: [
          { id: 'cell-0', label: '正面', generationStatus: 'idle' },
          { id: 'cell-1', label: '侧面', generationStatus: 'idle' },
          { id: 'cell-2', label: '背面', generationStatus: 'idle' },
        ],
      };
      newSize = { width: 320, height: 260 };
    } else if (nodeType === 'annotation') {
      newData = { text: '' };
      newSize = { width: 200, height: 120 };
    }

    // Create the new node
    const newNodeId = get().addNode({
      type: nodeType,
      position: newPosition,
      size: newSize,
      zIndex: (canvasData.nodes.length + 1) * 10,
      data: newData,
    } as Omit<CanvasNode, 'id'>);

    // Auto-connect source → new node
    if (newNodeId) {
      get().addConnection({
        sourceId: sourceNodeId,
        targetId: newNodeId,
        sourceAnchor: 'right',
        targetAnchor: 'left',
      });

      // Select the new node
      get().selectNode(newNodeId);
    }

    return newNodeId;
  },

  // ==================== Viewport Actions ====================
  setViewport: (viewport) => {
    const { canvasData } = get();
    if (!canvasData) return;

    set({
      canvasData: {
        ...canvasData,
        viewport: { ...canvasData.viewport, ...viewport } as CanvasViewport,
      },
    });
  },

  panCanvas: (delta) => {
    const { canvasData } = get();
    if (!canvasData?.viewport) return;

    set({
      canvasData: {
        ...canvasData,
        viewport: {
          ...canvasData.viewport,
          pan: {
            x: canvasData.viewport.pan.x + delta.x,
            y: canvasData.viewport.pan.y + delta.y,
          },
        },
      },
    });
  },

  zoomCanvas: (zoom, _center) => {
    const { canvasData } = get();
    if (!canvasData?.viewport) return;

    // Clamp zoom between 5% and 1600%
    const clampedZoom = Math.max(0.05, Math.min(16, zoom));

    set({
      canvasData: {
        ...canvasData,
        viewport: {
          ...canvasData.viewport,
          zoom: clampedZoom,
        },
      },
    });
  },

  resetViewport: () => {
    const { canvasData } = get();
    if (!canvasData) return;

    set({
      canvasData: {
        ...canvasData,
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      },
    });
  },

  // ==================== Selection Actions ====================
  selectNode: (id, multi = false) => {
    const { selection } = get();

    if (multi) {
      const isSelected = selection.nodeIds.includes(id);
      set({
        selection: {
          ...selection,
          nodeIds: isSelected
            ? selection.nodeIds.filter((nodeId) => nodeId !== id)
            : [...selection.nodeIds, id],
        },
      });
    } else {
      set({
        selection: { nodeIds: [id], connectionIds: [] },
      });
    }
  },

  selectConnection: (id, multi = false) => {
    const { selection } = get();

    if (multi) {
      const isSelected = selection.connectionIds.includes(id);
      set({
        selection: {
          ...selection,
          connectionIds: isSelected
            ? selection.connectionIds.filter((connId) => connId !== id)
            : [...selection.connectionIds, id],
        },
      });
    } else {
      set({
        selection: { nodeIds: [], connectionIds: [id] },
      });
    }
  },

  selectNodes: (ids) => {
    set({
      selection: { nodeIds: ids, connectionIds: [] },
    });
  },

  clearSelection: () => {
    set({
      selection: { nodeIds: [], connectionIds: [] },
    });
  },

  deleteSelected: () => {
    const { selection, canvasData } = get();
    if (!canvasData) return;

    recordHistory(canvasData);

    // Remove selected nodes and their connections
    const nodesToRemove = new Set(selection.nodeIds);
    const connectionsToRemove = new Set(selection.connectionIds);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.filter((node) => !nodesToRemove.has(node.id)),
        connections: canvasData.connections.filter(
          (conn) =>
            !connectionsToRemove.has(conn.id) &&
            !nodesToRemove.has(conn.sourceId) &&
            !nodesToRemove.has(conn.targetId),
        ),
      },
      selection: { nodeIds: [], connectionIds: [] },
    });
  },

  // ==================== Media Playback ====================
  setActivePlayingNode: (nodeId) => {
    set({ activePlayingNodeId: nodeId });
  },

  // ==================== History Actions ====================
  undo: () => {
    const { canvasData } = get();
    if (!canvasData) return;

    const previousState = useHistoryStore.getState().undo(canvasData);
    if (previousState) {
      set({
        canvasData: previousState,
        selection: { nodeIds: [], connectionIds: [] },
      });
    }
  },

  redo: () => {
    const { canvasData } = get();
    if (!canvasData) return;

    const nextState = useHistoryStore.getState().redo(canvasData);
    if (nextState) {
      set({
        canvasData: nextState,
        selection: { nodeIds: [], connectionIds: [] },
      });
    }
  },
}));
