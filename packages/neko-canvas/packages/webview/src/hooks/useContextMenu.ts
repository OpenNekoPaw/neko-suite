/**
 * useContextMenu - Context menu state and builder
 *
 * Manages the context menu visibility, position, and menu item
 * construction based on current selection state.
 */

import { useCallback, useState } from 'react';
import type { CanvasNode } from '@neko/shared';
import { buildCanvasMenuItems, buildNodeMenuItems } from '../components/common/ContextMenu';
import type { MenuEntry } from '../components/common/ContextMenu';
import { useClipboardStore } from '../stores/clipboardStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useHistoryStore } from '../stores/historyStore';

// =============================================================================
// Types
// =============================================================================

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuEntry[];
}

export interface UseContextMenuOptions {
  selectedNodeIds: string[];
  nodes: CanvasNode[];
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  addTextAt: (pos: { x: number; y: number }) => void;
  addSceneAt: (pos: { x: number; y: number }) => void;
  handleAddMedia: (type: 'image' | 'video' | 'audio') => void;
  deleteSelected: () => void;
  handleFitContent: () => void;
  handleResetViewport: () => void;
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => void;
  handleDuplicate: () => void;
  undo: () => void;
  redo: () => void;
}

export interface UseContextMenuReturn {
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;
  handleContextMenu: (e: React.MouseEvent) => void;
  closeContextMenu: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useContextMenu(options: UseContextMenuOptions): UseContextMenuReturn {
  const {
    selectedNodeIds,
    nodes,
    screenToCanvas,
    addTextAt,
    addSceneAt,
    handleAddMedia,
    deleteSelected,
    handleFitContent,
    handleResetViewport,
    handleCopy,
    handleCut,
    handlePaste,
    handleDuplicate,
    undo,
    redo,
  } = options;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
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
          selectNodes(nodes.map((n) => n.id));
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

      const items = hasSelection ? buildNodeMenuItems(menuCtx) : buildCanvasMenuItems(menuCtx);

      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [
      screenToCanvas,
      selectedNodeIds,
      nodes,
      addTextAt,
      addSceneAt,
      handleAddMedia,
      deleteSelected,
      handleFitContent,
      handleResetViewport,
      handleCopy,
      handleCut,
      handlePaste,
      handleDuplicate,
      undo,
      redo,
    ],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return { contextMenu, setContextMenu, handleContextMenu, closeContextMenu };
}
