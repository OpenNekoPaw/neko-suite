/**
 * useNodeHelpers - Node creation helper functions
 *
 * Provides factory functions for adding text, storyboard, and media
 * nodes at specific canvas positions.
 */

import { useCallback } from 'react';
import type { CanvasNode } from '@neko/shared';
import { t } from '../i18n';

// =============================================================================
// Types
// =============================================================================

export interface UseNodeHelpersOptions {
  addNode: (node: Omit<CanvasNode, 'id'>) => string;
  nodeCount: number;
  reportAction: (action: string, label: string, detail?: string) => void;
}

export interface UseNodeHelpersReturn {
  addTextAt: (pos: { x: number; y: number }) => void;
  addSceneAt: (pos: { x: number; y: number }) => void;
  addMediaAt: (
    pos: { x: number; y: number },
    mediaType: 'image' | 'video' | 'audio',
    uri?: string,
    name?: string,
  ) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useNodeHelpers(options: UseNodeHelpersOptions): UseNodeHelpersReturn {
  const { addNode, nodeCount, reportAction } = options;

  const addTextAt = useCallback(
    (pos: { x: number; y: number }) => {
      const w = 200,
        h = 100;
      addNode({
        type: 'annotation',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: { content: t('node.newText') },
      });
      reportAction('addNode', 'Add text note');
    },
    [addNode, nodeCount, reportAction],
  );

  const addSceneAt = useCallback(
    (pos: { x: number; y: number }) => {
      const w = 240,
        h = 160;
      addNode({
        type: 'storyboard',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: { title: t('node.newScene') },
      });
      reportAction('addNode', 'Add storyboard scene');
    },
    [addNode, nodeCount, reportAction],
  );

  const addMediaAt = useCallback(
    (
      pos: { x: number; y: number },
      mediaType: 'image' | 'video' | 'audio',
      uri?: string,
      name?: string,
    ) => {
      const w = mediaType === 'audio' ? 280 : 280;
      const h = mediaType === 'audio' ? 80 : 200;
      addNode({
        type: 'media',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          assetPath: uri || '',
          mediaType,
          thumbnailPath: undefined,
          duration: undefined,
        },
      });
      reportAction('addNode', `Add ${mediaType}`, name);
    },
    [addNode, nodeCount, reportAction],
  );

  return { addTextAt, addSceneAt, addMediaAt };
}
