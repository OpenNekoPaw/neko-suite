import { create } from 'zustand';
import type {
  CanvasData,
  CanvasNode,
  CanvasConnection,
  CanvasViewport,
  PortDefinition,
} from '@neko/shared';
import { getDefaultPorts, arePortTypesCompatible } from '@neko/shared';
import { useHistoryStore } from './historyStore';

// =============================================================================
// Types
// =============================================================================

export interface CanvasSelection {
  nodeIds: string[];
  connectionIds: string[];
}

export interface CanvasStore {
  // ==================== State ====================
  canvasData: CanvasData | null;
  selection: CanvasSelection;
  isConnecting: boolean;
  pendingConnectionSource: { nodeId: string; anchor: string } | null;
  /** Currently playing media node ID (only one at a time) */
  activePlayingNodeId: string | null;

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

  // ==================== Connection Actions ====================
  addConnection: (connection: Omit<CanvasConnection, 'id'>) => string;
  removeConnection: (id: string) => void;
  startConnection: (nodeId: string, anchor: string) => void;
  completeConnection: (nodeId: string, anchor: string) => void;
  cancelConnection: () => void;

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

    return id;
  },

  updateNode: (id, updates) => {
    const { canvasData } = get();
    if (!canvasData) return;

    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) =>
          node.id === id ? ({ ...node, ...updates } as CanvasNode) : node,
        ),
      },
    });
  },

  updateNodeData: (id, data) => {
    const { canvasData } = get();
    if (!canvasData) return;

    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) =>
          node.id === id ? ({ ...node, data: { ...node.data, ...data } } as CanvasNode) : node,
        ),
      },
    });
  },

  removeNode: (id) => {
    const { canvasData, selection } = get();
    if (!canvasData) return;

    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.filter((node) => node.id !== id),
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
  },

  moveNode: (id, position) => {
    const { canvasData } = get();
    if (!canvasData) return;

    // No history recording – called on every mousemove during drag

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) => (node.id === id ? { ...node, position } : node)),
      },
    });
  },

  moveNodeEnd: (id, position) => {
    const { canvasData } = get();
    if (!canvasData) return;

    // Record history before final position update (undo support)
    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) => (node.id === id ? { ...node, position } : node)),
      },
    });
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

    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) =>
          node.id === id ? { ...node, size, position } : node,
        ),
      },
    });
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

    return id;
  },

  removeConnection: (id) => {
    const { canvasData, selection } = get();
    if (!canvasData) return;

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
