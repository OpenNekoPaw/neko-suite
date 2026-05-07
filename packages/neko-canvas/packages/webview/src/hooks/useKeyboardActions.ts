/**
 * useKeyboardActions - Keyboard shortcut dispatch handler
 *
 * Maps keyboard action strings (from VSCode keybindings or dev-mode
 * key events) to the corresponding canvas operations.
 */

import { useCallback, useEffect } from 'react';
import type { CanvasNode } from '@neko/shared';
import { useCanvasStore } from '../stores/canvasStore';
import type { VSCodeAPI } from './useVSCodeMessages';

// =============================================================================
// Types
// =============================================================================

export interface UseKeyboardActionsOptions {
  vscode: VSCodeAPI;
  selectedNodeIds: string[];
  selectedConnectionIds: string[];
  nodes: CanvasNode[];
  isConnecting: boolean;
  contextMenu: unknown | null;
  setContextMenu: (menu: null) => void;
  selectNode: (id: string, multi?: boolean) => void;
  selectConnection: (id: string, multi?: boolean) => void;
  deleteSelected: () => void;
  cancelConnection: () => void;
  clearSelection: () => void;
  resetViewport: () => void;
  undo: () => void;
  redo: () => void;
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => void;
  handlePasteInPlace: () => void;
  handleDuplicate: () => void;
  onGenerateSelected?: () => void;
  reportAction: (action: string, label: string, detail?: string) => void;
}

export interface UseKeyboardActionsReturn {
  handleKeyboardAction: (action: string) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useKeyboardActions(options: UseKeyboardActionsOptions): UseKeyboardActionsReturn {
  const {
    vscode,
    selectedNodeIds,
    selectedConnectionIds,
    nodes,
    isConnecting,
    contextMenu,
    setContextMenu,
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
    onGenerateSelected,
    reportAction,
  } = options;

  const handleKeyboardAction = useCallback(
    (action: string) => {
      // Handle outline selection commands (selectNode:id, selectConnection:id)
      if (action.startsWith('selectNode:')) {
        const nodeId = action.slice('selectNode:'.length);
        selectNode(nodeId);
        return;
      }
      if (action.startsWith('selectConnection:')) {
        const connId = action.slice('selectConnection:'.length);
        selectConnection(connId);
        return;
      }
      if (action.startsWith('detachShot:')) {
        const parts = action.slice('detachShot:'.length).split(':');
        const shotId = parts[0];
        const sceneId = parts[1];
        if (shotId && sceneId) {
          useCanvasStore.getState().detachShotFromScene(sceneId, shotId);
          reportAction('detachShot', `Detached shot from scene`);
        }
        return;
      }
      if (action.startsWith('deleteNode:')) {
        const nodeId = action.slice('deleteNode:'.length);
        if (nodeId) {
          useCanvasStore.getState().removeNode(nodeId);
          reportAction('deleteNode', `Deleted node from outline`);
        }
        return;
      }

      switch (action) {
        case 'deleteSelected':
          if (selectedNodeIds.length > 0 || selectedConnectionIds.length > 0) {
            deleteSelected();
            reportAction('deleteNode', `Deleted ${selectedNodeIds.length} node(s)`);
          }
          break;
        case 'escape':
          if (contextMenu) {
            setContextMenu(null);
          } else if (isConnecting) {
            cancelConnection();
          } else {
            clearSelection();
          }
          break;
        case 'selectAll':
          if (nodes.length > 0) {
            const { selectNodes } = useCanvasStore.getState();
            selectNodes(nodes.map((n) => n.id));
          }
          break;
        case 'undo':
          undo();
          reportAction('undo', 'Undo');
          break;
        case 'redo':
          redo();
          reportAction('redo', 'Redo');
          break;
        case 'copy':
          handleCopy();
          break;
        case 'cut':
          handleCut();
          reportAction('deleteNode', `Cut ${selectedNodeIds.length} node(s)`);
          break;
        case 'paste':
          handlePaste();
          reportAction('paste', 'Paste');
          break;
        case 'pasteInPlace':
          handlePasteInPlace();
          reportAction('paste', 'Paste In Place');
          break;
        case 'duplicate':
          handleDuplicate();
          reportAction('paste', 'Duplicate');
          break;
        case 'resetZoom':
          resetViewport();
          break;
        case 'generateSelected':
          onGenerateSelected?.();
          break;
      }
    },
    [
      selectedNodeIds,
      selectedConnectionIds,
      deleteSelected,
      isConnecting,
      cancelConnection,
      clearSelection,
      nodes,
      contextMenu,
      undo,
      redo,
      handleCopy,
      handleCut,
      handlePaste,
      handlePasteInPlace,
      handleDuplicate,
      onGenerateSelected,
      selectNode,
      selectConnection,
      resetViewport,
      reportAction,
      setContextMenu,
    ],
  );

  // Dev-mode keyboard shortcuts fallback (when not in VSCode webview)
  useEffect(() => {
    if (vscode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleKeyboardAction('escape');
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        handleKeyboardAction('deleteSelected');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        handleKeyboardAction('selectAll');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleKeyboardAction('redo');
        } else {
          handleKeyboardAction('undo');
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        e.preventDefault();
        handleKeyboardAction('copy');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
        e.preventDefault();
        handleKeyboardAction('cut');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault();
        handleKeyboardAction(e.shiftKey ? 'pasteInPlace' : 'paste');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        handleKeyboardAction('duplicate');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault();
        handleKeyboardAction('generateSelected');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [vscode, handleKeyboardAction]);

  return { handleKeyboardAction };
}
