import { create } from 'zustand';
import type {
  CanvasData,
  CanvasNode,
  CanvasConnection,
  CanvasViewport,
} from '@uniedit/shared';

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

  // ==================== Computed Getters ====================
  readonly nodes: CanvasNode[];
  readonly connections: CanvasConnection[];
  readonly viewport: CanvasViewport;
  readonly selectedNodeIds: string[];
  readonly selectedConnectionIds: string[];

  // ==================== Data Actions ====================
  setCanvasData: (data: CanvasData) => void;
  updateCanvasData: (updates: Partial<CanvasData>) => void;

  // ==================== Node Actions ====================
  addNode: (node: Omit<CanvasNode, 'id'>) => string;
  updateNode: (id: string, updates: Partial<CanvasNode>) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, position: { x: number; y: number }) => void;

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
}

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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

  // ==================== Computed Getters ====================
  get nodes() {
    return get().canvasData?.nodes ?? [];
  },
  get connections() {
    return get().canvasData?.connections ?? [];
  },
  get viewport() {
    return get().canvasData?.viewport ?? { pan: { x: 0, y: 0 }, zoom: 1 };
  },
  get selectedNodeIds() {
    return get().selection.nodeIds;
  },
  get selectedConnectionIds() {
    return get().selection.connectionIds;
  },

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

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) =>
          node.id === id ? { ...node, ...updates } as CanvasNode : node
        ),
      },
    });
  },

  removeNode: (id) => {
    const { canvasData, selection } = get();
    if (!canvasData) return;

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.filter((node) => node.id !== id),
        // Also remove connections involving this node
        connections: canvasData.connections.filter(
          (conn) => conn.sourceId !== id && conn.targetId !== id
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

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) =>
          node.id === id ? { ...node, position } : node
        ),
      },
    });
  },

  // ==================== Connection Actions ====================
  addConnection: (connection) => {
    const { canvasData } = get();
    if (!canvasData) return '';

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

    // Check if connection already exists
    const exists = canvasData.connections.some(
      (conn) =>
        conn.sourceId === pendingConnectionSource.nodeId &&
        conn.targetId === nodeId
    );

    if (!exists) {
      get().addConnection({
        sourceId: pendingConnectionSource.nodeId,
        sourceAnchor: pendingConnectionSource.anchor as CanvasConnection['sourceAnchor'],
        targetId: nodeId,
        targetAnchor: anchor as CanvasConnection['targetAnchor'],
        type: 'default',
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

    // Clamp zoom between 10% and 400%
    const clampedZoom = Math.max(0.1, Math.min(4, zoom));

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
            !nodesToRemove.has(conn.targetId)
        ),
      },
      selection: { nodeIds: [], connectionIds: [] },
    });
  },
}));
