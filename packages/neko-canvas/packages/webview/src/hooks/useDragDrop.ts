/**
 * useDragDrop - Drag & drop handling for canvas
 *
 * Handles drag-and-drop of files from the VSCode explorer, native
 * file system, and asset library into the canvas.
 */

import { useCallback, useRef, useState } from 'react';
import { detectMediaType } from '../utils/mediaType';
import type { VSCodeAPI } from './useVSCodeMessages';

// =============================================================================
// Types
// =============================================================================

export interface UseDragDropOptions {
  vscode: VSCodeAPI;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  addMediaAt: (
    pos: { x: number; y: number },
    mediaType: 'image' | 'video' | 'audio',
    uri?: string,
    name?: string,
  ) => void;
}

export interface UseDragDropReturn {
  isDragOver: boolean;
  dropPositionRef: React.MutableRefObject<{ x: number; y: number } | null>;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useDragDrop(options: UseDragDropOptions): UseDragDropReturn {
  const { vscode, canvasContainerRef, screenToCanvas, addMediaAt } = options;

  const [isDragOver, setIsDragOver] = useState(false);
  const dropPositionRef = useRef<{ x: number; y: number } | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      // Only close if leaving the container (not entering a child)
      const rect = canvasContainerRef.current?.getBoundingClientRect();
      if (rect) {
        const { clientX, clientY } = e;
        if (
          clientX < rect.left ||
          clientX > rect.right ||
          clientY < rect.top ||
          clientY > rect.bottom
        ) {
          setIsDragOver(false);
        }
      }
    },
    [canvasContainerRef],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      // Save drop position for when extension responds
      dropPositionRef.current = screenToCanvas(e.clientX, e.clientY);

      // First, check for AssetDragData from asset library (unified protocol)
      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData);
          if (data.type === 'asset' || data.type === 'assets' || data.type === 'media-file') {
            const items =
              data.type === 'assets'
                ? data.items
                : data.type === 'media-file'
                  ? data.files.map((f: any) => ({ files: [{ path: f.path }] }))
                  : [data];
            const pos = dropPositionRef.current ?? { x: 0, y: 0 };
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              const file = item.files?.[0];
              if (file) {
                if (vscode) {
                  // Send file URI to extension for webview URI resolution
                  vscode.postMessage({
                    type: 'resolveDroppedFiles',
                    uris: [`file://${file.path}`],
                    dropX: e.clientX,
                    dropY: e.clientY,
                  });
                } else {
                  const mt =
                    file.mediaType === 'video'
                      ? 'video'
                      : file.mediaType === 'audio'
                        ? 'audio'
                        : 'image';
                  addMediaAt({ x: pos.x + i * 30, y: pos.y + i * 30 }, mt, file.path, file.name);
                }
              }
            }
            return;
          }
        } catch {
          // Not valid asset drag data, continue with other handlers
        }
      }

      // Try to get URIs from the drop data
      const uriList = e.dataTransfer.getData('text/uri-list');
      const textData = e.dataTransfer.getData('text/plain');
      const files = e.dataTransfer.files;

      if (vscode) {
        // In VSCode webview: send URIs to extension for resolution
        const uris = (uriList || textData || '')
          .split('\n')
          .map((u) => u.trim())
          .filter((u) => u && !u.startsWith('#'));

        if (uris.length > 0) {
          vscode.postMessage({
            type: 'resolveDroppedFiles',
            uris,
            dropX: e.clientX,
            dropY: e.clientY,
          });
        }
      } else {
        // Dev mode: handle File objects from native drag
        if (files.length > 0) {
          const pos = dropPositionRef.current;
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file) continue;
            const mediaType = detectMediaType(file.name);
            if (mediaType) {
              const offset = i * 30;
              addMediaAt(
                { x: (pos?.x ?? 0) + offset, y: (pos?.y ?? 0) + offset },
                mediaType,
                URL.createObjectURL(file),
                file.name,
              );
            }
          }
        }
      }
    },
    [vscode, screenToCanvas, addMediaAt],
  );

  return {
    isDragOver,
    dropPositionRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
