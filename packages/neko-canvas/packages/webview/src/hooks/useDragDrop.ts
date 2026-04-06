/**
 * useDragDrop - Drag & drop handling for canvas
 *
 * Handles drag-and-drop of files from the VSCode explorer, native
 * file system, and asset library into the canvas.
 */

import { useCallback, useRef } from 'react';
import { useFileDrop } from '@neko/shared/components';
import type { FileDropResult } from '@neko/shared/components';
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
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useDragDrop(options: UseDragDropOptions): UseDragDropReturn {
  const { vscode, screenToCanvas, addMediaAt } = options;

  const dropPositionRef = useRef<{ x: number; y: number } | null>(null);

  const handleFileDrop = useCallback(
    (result: FileDropResult, event: React.DragEvent) => {
      // Save drop position for when extension responds
      dropPositionRef.current = screenToCanvas(event.clientX, event.clientY);

      if (result.type === 'asset-json' && result.assetData) {
        // Asset Library protocol
        const data = result.assetData as Record<string, unknown>;
        if (data.type === 'asset' || data.type === 'assets' || data.type === 'media-file') {
          const items =
            data.type === 'assets'
              ? (data.items as unknown[])
              : data.type === 'media-file'
                ? (data.files as Array<{ path: string }>).map((f) => ({
                    files: [{ path: f.path }],
                  }))
                : [data];
          const pos = dropPositionRef.current ?? { x: 0, y: 0 };
          for (let i = 0; i < (items as unknown[]).length; i++) {
            const item = (items as Array<Record<string, unknown>>)[i];
            const files = item?.['files'] as Array<Record<string, string>> | undefined;
            const file = files?.[0];
            if (file) {
              if (vscode) {
                vscode.postMessage({
                  type: 'resolveDroppedFiles',
                  uris: [`file://${file['path']}`],
                  dropX: event.clientX,
                  dropY: event.clientY,
                });
              } else {
                const mt =
                  file['mediaType'] === 'video'
                    ? 'video'
                    : file['mediaType'] === 'audio'
                      ? 'audio'
                      : 'image';
                addMediaAt(
                  { x: pos.x + i * 30, y: pos.y + i * 30 },
                  mt as 'image' | 'video' | 'audio',
                  file['path'],
                  file['name'],
                );
              }
            }
          }
        }
      } else if (result.type === 'uri-list' && result.uris) {
        if (vscode) {
          vscode.postMessage({
            type: 'resolveDroppedFiles',
            uris: result.uris,
            dropX: event.clientX,
            dropY: event.clientY,
          });
        }
      } else if (result.type === 'native-file' && result.files) {
        // Dev mode: handle File objects from native drag
        const pos = dropPositionRef.current;
        for (let i = 0; i < result.files.length; i++) {
          const file = result.files[i];
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
    },
    [vscode, screenToCanvas, addMediaAt],
  );

  const { isDragOver, dropProps } = useFileDrop(handleFileDrop);

  // Wrap the drop handler to also check for cross-extension DnD payload (ADR-5 P1).
  // When a drag originates from another VSCode webview iframe, the dataTransfer is
  // empty — so we always notify the extension host to check for a pending DnD payload.
  const handleDropWithCrossExtension = useCallback(
    (e: React.DragEvent) => {
      // Let useFileDrop handle file/URI/asset drops first
      dropProps.onDrop(e);

      // Also ask the extension host if there is a cross-extension DnD payload
      if (vscode) {
        vscode.postMessage({ type: 'dnd:drop' });
      }
    },
    [dropProps, vscode],
  );

  return {
    isDragOver,
    dropPositionRef,
    handleDragEnter: dropProps.onDragEnter,
    handleDragOver: dropProps.onDragOver,
    handleDragLeave: dropProps.onDragLeave,
    handleDrop: handleDropWithCrossExtension,
  };
}
