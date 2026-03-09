/**
 * Clipboard Store - Copy/Cut/Paste/Duplicate for canvas nodes
 *
 * Handles serialization of selected nodes and their inter-connections,
 * ID remapping on paste, and position offset to avoid overlap.
 */

import { create } from 'zustand';
import type { CanvasNode, CanvasConnection } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

interface ClipboardData {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
}

export interface ClipboardStore {
  /** Stored clipboard data */
  clipboard: ClipboardData | null;

  /** Whether paste is available */
  canPaste: () => boolean;

  /** Copy selected nodes (and their inter-connections) */
  copy: (
    selectedNodeIds: string[],
    allNodes: CanvasNode[],
    allConnections: CanvasConnection[],
  ) => void;

  /** Cut selected nodes (copy + return IDs to delete) */
  cut: (
    selectedNodeIds: string[],
    allNodes: CanvasNode[],
    allConnections: CanvasConnection[],
  ) => void;

  /** Paste clipboard contents at given position offset */
  paste: (offset?: { x: number; y: number }) => ClipboardData | null;

  /** Duplicate nodes in-place with small offset */
  duplicate: (
    selectedNodeIds: string[],
    allNodes: CanvasNode[],
    allConnections: CanvasConnection[],
  ) => ClipboardData | null;

  /** Clear clipboard */
  clear: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Deep clone nodes and connections, remapping all IDs.
 * Only includes connections where both source and target are in the selection.
 */
function cloneWithNewIds(
  nodes: CanvasNode[],
  connections: CanvasConnection[],
  offset: { x: number; y: number } = { x: 0, y: 0 },
): ClipboardData {
  const idMap = new Map<string, string>();

  // Generate new IDs for all nodes
  for (const node of nodes) {
    idMap.set(node.id, generateId());
  }

  // Clone nodes with new IDs and offset positions
  const clonedNodes = nodes.map((node) => ({
    ...structuredClone(node),
    id: idMap.get(node.id)!,
    position: {
      x: node.position.x + offset.x,
      y: node.position.y + offset.y,
    },
  }));

  // Clone connections, only keeping those between selected nodes
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const clonedConnections = connections
    .filter((conn) => nodeIdSet.has(conn.sourceId) && nodeIdSet.has(conn.targetId))
    .map((conn) => ({
      ...structuredClone(conn),
      id: generateId(),
      sourceId: idMap.get(conn.sourceId) ?? conn.sourceId,
      targetId: idMap.get(conn.targetId) ?? conn.targetId,
    }));

  return { nodes: clonedNodes, connections: clonedConnections };
}

// =============================================================================
// Constants
// =============================================================================

const PASTE_OFFSET = { x: 30, y: 30 };
const DUPLICATE_OFFSET = { x: 20, y: 20 };

// =============================================================================
// Store
// =============================================================================

export const useClipboardStore = create<ClipboardStore>((set, get) => ({
  clipboard: null,

  canPaste: () => {
    const { clipboard } = get();
    return clipboard !== null && clipboard.nodes.length > 0;
  },

  copy: (selectedNodeIds, allNodes, allConnections) => {
    const selectedSet = new Set(selectedNodeIds);
    const selectedNodes = allNodes.filter((n) => selectedSet.has(n.id));

    if (selectedNodes.length === 0) return;

    // Store original nodes/connections (will be cloned on paste)
    const relevantConnections = allConnections.filter(
      (c) => selectedSet.has(c.sourceId) && selectedSet.has(c.targetId),
    );

    set({
      clipboard: {
        nodes: structuredClone(selectedNodes),
        connections: structuredClone(relevantConnections),
      },
    });
  },

  cut: (selectedNodeIds, allNodes, allConnections) => {
    // Copy first, then caller should delete the originals
    get().copy(selectedNodeIds, allNodes, allConnections);
  },

  paste: (offset) => {
    const { clipboard } = get();
    if (!clipboard || clipboard.nodes.length === 0) return null;

    const pasteOffset = offset ?? PASTE_OFFSET;
    return cloneWithNewIds(clipboard.nodes, clipboard.connections, pasteOffset);
  },

  duplicate: (selectedNodeIds, allNodes, allConnections) => {
    const selectedSet = new Set(selectedNodeIds);
    const selectedNodes = allNodes.filter((n) => selectedSet.has(n.id));

    if (selectedNodes.length === 0) return null;

    const relevantConnections = allConnections.filter(
      (c) => selectedSet.has(c.sourceId) && selectedSet.has(c.targetId),
    );

    return cloneWithNewIds(selectedNodes, relevantConnections, DUPLICATE_OFFSET);
  },

  clear: () => {
    set({ clipboard: null });
  },
}));
