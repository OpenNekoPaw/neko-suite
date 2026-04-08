/**
 * useNodeHelpers - Node creation helper functions
 *
 * Provides factory functions for adding text, storyboard, and media
 * nodes at specific canvas positions.
 */

import { useCallback } from 'react';
import type { CanvasNode } from '@neko/shared';
import { GALLERY_PRESET_CONFIGS } from '@neko/shared';
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
  /** Add a ShotNode at the given canvas position */
  addShotAt: (pos: { x: number; y: number }) => void;
  /** Add a SceneGroupNode container at the given canvas position */
  addSceneGroupAt: (pos: { x: number; y: number }) => void;
  /** Add a GalleryNode at the given canvas position */
  addGalleryAt: (pos: { x: number; y: number }) => void;
  addScriptAt: (pos: { x: number; y: number }) => void;
  addDocumentAt: (pos: { x: number; y: number }) => void;
  addModelAt: (pos: { x: number; y: number }) => void;
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

  const addShotAt = useCallback(
    (pos: { x: number; y: number }) => {
      const w = 220,
        h = 200;
      addNode({
        type: 'shot',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          shotNumber: nodeCount + 1,
          duration: 3,
          visualDescription: '',
          characters: [],
          shotScale: 'MS',
          characterAction: '',
          emotion: [],
          sceneTags: [],
          generationStatus: 'idle',
          generationHistory: [],
        },
      });
      reportAction('addNode', 'Add shot');
    },
    [addNode, nodeCount, reportAction],
  );

  const addSceneGroupAt = useCallback(
    (pos: { x: number; y: number }) => {
      const w = 600,
        h = 300;
      addNode({
        type: 'scene',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          sceneTitle: t('node.newScene'),
          sceneNumber: nodeCount + 1,
          shotIds: [],
        },
      });
      reportAction('addNode', 'Add scene group');
    },
    [addNode, nodeCount, reportAction],
  );

  const addGalleryAt = useCallback(
    (pos: { x: number; y: number }) => {
      const preset = 'character-3view' as const;
      const config = GALLERY_PRESET_CONFIGS[preset];
      const cells = config.labels.map((label, i) => ({
        id: `cell-${Date.now()}-${i}`,
        label,
        generationStatus: 'idle' as const,
      }));
      const w = Math.max(240, config.cols * 90 + 20);
      const h = config.rows * 100 + 60;
      addNode({
        type: 'gallery',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          preset,
          rows: config.rows,
          cols: config.cols,
          cells,
        },
      });
      reportAction('addNode', 'Add gallery');
    },
    [addNode, nodeCount, reportAction],
  );

  const addScriptAt = useCallback(
    (pos: { x: number; y: number }) => {
      const w = 280,
        h = 220;
      addNode({
        type: 'script',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          scriptPath: '',
          scriptTitle: 'Script',
          scenes: [],
        },
      });
      reportAction('addNode', 'Add script reference');
    },
    [addNode, nodeCount, reportAction],
  );

  const addDocumentAt = useCallback(
    (pos: { x: number; y: number }) => {
      const w = 220,
        h = 280;
      addNode({
        type: 'document',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          docPath: '',
          docType: 'pdf',
          title: 'Document',
        },
      });
      reportAction('addNode', 'Add document reference');
    },
    [addNode, nodeCount, reportAction],
  );

  const addModelAt = useCallback(
    (pos: { x: number; y: number }) => {
      const w = 240,
        h = 160;
      addNode({
        type: 'model',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          modelPath: '',
          modelName: 'Model',
          modelType: 'lora',
          role: 'reference',
        },
      });
      reportAction('addNode', 'Add model reference');
    },
    [addNode, nodeCount, reportAction],
  );

  return {
    addTextAt,
    addSceneAt,
    addMediaAt,
    addShotAt,
    addSceneGroupAt,
    addGalleryAt,
    addScriptAt,
    addDocumentAt,
    addModelAt,
  };
}
