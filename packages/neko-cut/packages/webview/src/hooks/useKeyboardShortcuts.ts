import { useEffect, useCallback } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { useVSCodeMessaging } from './useVSCodeMessaging';

export function useKeyboardShortcuts() {
  const {
    project,
    isPlaying,
    currentTime,
    selectedElements,
    togglePlayback,
    pause,
    seek,
    undo,
    redo,
    opUndo,
    opRedo,
    opUndoStack,
    opRedoStack,
    toggleSnapping,
    toggleRippleEditing,
    toggleFrameAlign,
    copySelected,
    pasteAtTime,
    removeElement,
    clearSelectedElements,
    getTotalDuration,
    pushHistory,
    splitAtPlayhead,
    splitAndKeepLeft,
    splitAndKeepRight,
    toggleElementHidden,
    toggleElementMuted,
  } = useEditorStore();

  // Get saveProject function for manual save
  const { saveProject } = useVSCodeMessaging();

  // Helper to get fps from project
  const fps = project?.fps || 30;

  // Wrapper for seek with fps
  const seekWithFps = useCallback((time: number) => {
    seek(time, fps);
  }, [seek, fps]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const isMeta = e.metaKey || e.ctrlKey;

    switch (e.key.toLowerCase()) {
      // Playback controls
      case ' ':
        e.preventDefault();
        togglePlayback();
        break;

      case 'k':
        e.preventDefault();
        pause();
        break;

      case 'j':
        e.preventDefault();
        // Rewind 5 seconds
        seekWithFps(Math.max(0, currentTime - 5));
        break;

      case 'l':
        e.preventDefault();
        // Forward 5 seconds
        seekWithFps(Math.min(getTotalDuration() || 60, currentTime + 5));
        break;

      case 'arrowleft':
        e.preventDefault();
        if (isMeta) {
          // Go to start
          seekWithFps(0);
        } else {
          // Frame step backward (assuming 30fps)
          seekWithFps(Math.max(0, currentTime - 1 / 30));
        }
        break;

      case 'arrowright':
        e.preventDefault();
        if (isMeta) {
          // Go to end
          seekWithFps(getTotalDuration() || 0);
        } else {
          // Frame step forward
          seekWithFps(currentTime + 1 / 30);
        }
        break;

      // Editing shortcuts
      case 'z':
        if (isMeta) {
          e.preventDefault();
          if (e.shiftKey) {
            // 优先操作式 redo，fallback 到快照式
            opRedoStack.length > 0 ? opRedo() : redo();
          } else {
            opUndoStack.length > 0 ? opUndo() : undo();
          }
        }
        break;

      case 'c':
        if (isMeta) {
          e.preventDefault();
          copySelected();
        }
        break;

      case 'v':
        if (isMeta) {
          e.preventDefault();
          pasteAtTime(currentTime);
        }
        break;

      case 'delete':
      case 'backspace':
        e.preventDefault();
        if (selectedElements.length > 0 && project) {
          pushHistory(project);
          for (const { trackId, elementId } of selectedElements) {
            removeElement(trackId, elementId);
          }
          clearSelectedElements();
        }
        break;

      case 'a':
        if (isMeta && project) {
          e.preventDefault();
          // Select all elements
          const allElements: Array<{ trackId: string; elementId: string }> = [];
          for (const track of project.tracks) {
            for (const element of track.elements) {
              allElements.push({ trackId: track.id, elementId: element.id });
            }
          }
          useEditorStore.getState().setSelectedElements(allElements);
        }
        break;

      case 'escape':
        e.preventDefault();
        clearSelectedElements();
        break;

      // Toggle modes
      case 'n':
        e.preventDefault();
        toggleSnapping();
        break;

      case 'r':
        if (!isMeta) {
          e.preventDefault();
          toggleRippleEditing();
        }
        break;

      case 'f':
        if (!isMeta) {
          e.preventDefault();
          toggleFrameAlign();
        }
        break;

      // Split at playhead / Save project
      case 's':
        if (isMeta) {
          // Cmd+S / Ctrl+S: Save project
          e.preventDefault();
          saveProject();
        } else if (selectedElements.length > 0 && project) {
          // S: Split at playhead (委托给 elementSplitSlice)
          e.preventDefault();
          for (const { trackId, elementId } of selectedElements) {
            splitAtPlayhead(trackId, elementId);
          }
        }
        break;

      // Home/End keys
      case 'home':
        e.preventDefault();
        seekWithFps(0);
        break;

      case 'end':
        e.preventDefault();
        seekWithFps(getTotalDuration() || 0);
        break;

      // Split and keep left (Q)
      case 'q':
        if (!isMeta && selectedElements.length > 0) {
          e.preventDefault();
          for (const { trackId, elementId } of selectedElements) {
            splitAndKeepLeft(trackId, elementId);
          }
        }
        break;

      // Split and keep right (W)
      case 'w':
        if (!isMeta && selectedElements.length > 0) {
          e.preventDefault();
          for (const { trackId, elementId } of selectedElements) {
            splitAndKeepRight(trackId, elementId);
          }
        }
        break;

      // Toggle element hidden (H)
      case 'h':
        if (!isMeta && selectedElements.length > 0) {
          e.preventDefault();
          for (const { trackId, elementId } of selectedElements) {
            toggleElementHidden(trackId, elementId);
          }
        }
        break;

      // Toggle element muted (M)
      case 'm':
        if (!isMeta && selectedElements.length > 0) {
          e.preventDefault();
          for (const { trackId, elementId } of selectedElements) {
            toggleElementMuted(trackId, elementId);
          }
        }
        break;
    }
  }, [
    project,
    isPlaying,
    currentTime,
    selectedElements,
    togglePlayback,
    pause,
    seek,
    undo,
    redo,
    opUndo,
    opRedo,
    opUndoStack,
    opRedoStack,
    toggleSnapping,
    toggleRippleEditing,
    toggleFrameAlign,
    copySelected,
    pasteAtTime,
    removeElement,
    clearSelectedElements,
    getTotalDuration,
    pushHistory,
    splitAtPlayhead,
    splitAndKeepLeft,
    splitAndKeepRight,
    toggleElementHidden,
    toggleElementMuted,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
