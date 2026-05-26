// TODO: Duplicated hook — neko-canvas has a similar useDragDrop (152 lines) with
// incompatible API (canvas-specific: screenToCanvas, addMediaAt, cross-extension DnD).
// Both use @neko/shared useFileDrop internally but wrap it differently.
// Consider extracting a shared base hook to @neko/shared/hooks/useDragDrop that
// provides common DnD lifecycle (isDragOver, dropProps) with a pluggable onDrop strategy.

/**
 * useDragDrop - Drag & drop handling for audio project editor
 *
 * Handles drag-and-drop of audio files from the VSCode explorer
 * or native file system into the audio editor.
 */

import { useCallback } from 'react';
import { useFileDrop } from '@neko/ui/hooks';
import type { FileDropResult } from '@neko/ui/hooks';
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

export function useDragDrop(_containerRef: React.RefObject<HTMLElement | null>): UseDragDropReturn {
  const handleFileDrop = useCallback((result: FileDropResult) => {
    if (result.type === 'uri-list' && result.uris) {
      // URI list already filtered by accept option, but double-check audio
      const audioUris = result.uris.filter((u) => isAudioUri(u));
      if (audioUris.length > 0) {
        postMessage({ type: 'project:dropImportAudio', uris: audioUris });
      }
    } else if (result.type === 'asset-json' && result.assetData) {
      const data = result.assetData as { files?: { path?: string }[] };
      const files: string[] = (data.files ?? [])
        .map((f) => f.path)
        .filter((p): p is string => !!p && isAudioUri(p));
      if (files.length > 0) {
        postMessage({
          type: 'project:dropImportAudio',
          uris: files.map((f) => `file://${f}`),
        });
      }
    }
  }, []);

  const { isDragOver, dropProps } = useFileDrop(handleFileDrop, {
    accept: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'],
  });

  // Adapt to original interface: original hook merged dragenter into handleDragOver
  const combinedDragOver = useCallback(
    (e: React.DragEvent) => {
      dropProps.onDragEnter(e);
      dropProps.onDragOver(e);
    },
    [dropProps],
  );

  return {
    isDragOver,
    handleDragOver: combinedDragOver,
    handleDragLeave: dropProps.onDragLeave,
    handleDrop: dropProps.onDrop,
  };
}
