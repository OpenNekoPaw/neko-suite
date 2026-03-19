/**
 * useDragDrop - Drag & drop handling for audio project editor
 *
 * Handles drag-and-drop of audio files from the VSCode explorer
 * or native file system into the audio editor.
 */

import { useCallback, useRef, useState } from 'react';
import { postMessage } from '../shared/useVscodeMessage';

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']);

function isAudioUri(uri: string): boolean {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_EXTENSIONS.has(ext);
}

export interface UseDragDropReturn {
  isDragOver: boolean;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
}

export function useDragDrop(containerRef: React.RefObject<HTMLElement | null>): UseDragDropReturn {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const { clientX, clientY } = e;
        if (
          clientX < rect.left ||
          clientX > rect.right ||
          clientY < rect.top ||
          clientY > rect.bottom
        ) {
          setIsDragOver(false);
          dragCounterRef.current = 0;
        }
      }
    },
    [containerRef],
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    // Try URI list first (VSCode explorer drag)
    const uriList = e.dataTransfer.getData('text/uri-list');
    const textData = e.dataTransfer.getData('text/plain');

    const uris = (uriList || textData || '')
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u && !u.startsWith('#') && isAudioUri(u));

    if (uris.length > 0) {
      postMessage({ type: 'project:dropImportSource', uris: [uris[0]!] });
      return;
    }

    // Try JSON data (asset library)
    const jsonData = e.dataTransfer.getData('application/json');
    if (jsonData) {
      try {
        const data = JSON.parse(jsonData);
        const filePath =
          data.type === 'asset'
            ? data.files?.[0]?.path
            : data.type === 'media-file'
              ? data.files?.[0]?.path
              : null;
        if (filePath && isAudioUri(filePath)) {
          postMessage({
            type: 'project:dropImportSource',
            uris: [`file://${filePath}`],
          });
          return;
        }
      } catch {
        // Not valid JSON, ignore
      }
    }
  }, []);

  // Use dragenter to track drag state (more reliable than dragover for visual feedback)
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setIsDragOver(true);
    }
  }, []);

  // Combine dragenter into dragover for simplicity
  const combinedDragOver = useCallback(
    (e: React.DragEvent) => {
      handleDragEnter(e);
      handleDragOver(e);
    },
    [handleDragEnter, handleDragOver],
  );

  return {
    isDragOver,
    handleDragOver: combinedDragOver,
    handleDragLeave,
    handleDrop,
  };
}
