/**
 * useClipboard - Clipboard operations for canvas nodes
 *
 * Wraps the clipboard store to provide copy, cut, paste, and duplicate
 * operations that integrate with canvas and history stores.
 */

import { useCallback } from 'react';
import type { CanvasNode, CanvasConnection } from '@neko/shared';
import { useClipboardStore } from '../stores/clipboardStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useHistoryStore } from '../stores/historyStore';

// =============================================================================
// Types
// =============================================================================

export interface UseClipboardOptions {
  selectedNodeIds: string[];
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  deleteSelected: () => void;
}

export interface UseClipboardReturn {
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => void;
  handleDuplicate: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useClipboard(options: UseClipboardOptions): UseClipboardReturn {
  const { selectedNodeIds, nodes, connections, deleteSelected } = options;

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
      selectNodes(result.nodes.map((n) => n.id));
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
      selectNodes(result.nodes.map((n) => n.id));
    }
  }, [selectedNodeIds, nodes, connections]);

  return { handleCopy, handleCut, handlePaste, handleDuplicate };
}
