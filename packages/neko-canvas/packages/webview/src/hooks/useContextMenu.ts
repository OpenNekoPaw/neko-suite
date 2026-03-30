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
  addShotAt: (pos: { x: number; y: number }) => void;
  addGalleryAt: (pos: { x: number; y: number }) => void;
  handleAddMedia: (type: 'image' | 'video' | 'audio') => void;
  deleteSelected: () => void;
  handleFitContent: () => void;
  handleResetViewport: () => void;
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => void;
  handlePasteInPlace: () => void;
  handleDuplicate: () => void;
  handleGroup: () => void;
  handleUngroup: () => void;
  undo: () => void;
  redo: () => void;
  onGenerateSelected?: () => void;
  onBatchGenerate?: () => void;
  onSendToAgent?: () => void;
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
    onGenerateSelected,
    onBatchGenerate,
    onSendToAgent,
  } = options;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const hasSelection = selectedNodeIds.length > 0;

      const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));
      const menuCtx = {
        canvasPosition: canvasPos,
        hasSelection,
        selectedCount: selectedNodeIds.length,
        onAddText: addTextAt,
        onAddScene: addSceneAt,
        onAddShot: addShotAt,
        onAddGallery: addGalleryAt,
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
        onPasteInPlace: handlePasteInPlace,
        onDuplicate: handleDuplicate,
        onGroup: handleGroup,
        onUngroup: handleUngroup,
        canGroup: selectedNodeIds.length >= 2,
        canUngroup:
          selectedNodeIds.length === 1 &&
          (nodes.find((n) => n.id === selectedNodeIds[0])?.type as string) === 'group',
        onUndo: undo,
        onRedo: redo,
        canPaste: useClipboardStore.getState().canPaste(),
        canUndo: useHistoryStore.getState().canUndo(),
        canRedo: useHistoryStore.getState().canRedo(),
        hasShotSelected: selectedNodes.some((n) => n.type === 'shot'),
        onGenerateSelected,
        onBatchGenerate,
        onSendToAgent,
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
      onGenerateSelected,
      onBatchGenerate,
      onSendToAgent,
    ],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return { contextMenu, setContextMenu, handleContextMenu, closeContextMenu };
}
