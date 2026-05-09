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
import { buildCanvasNode } from '../utils/nodeFactory';

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
  addMediaAt: (
    pos: { x: number; y: number },
    mediaType: 'image' | 'video' | 'audio',
    uri?: string,
    name?: string,
  ) => void;
  addShotAt: (pos: { x: number; y: number }) => void;
  addSceneGroupAt: (pos: { x: number; y: number }) => void;
  addGalleryAt: (pos: { x: number; y: number }) => void;
  addScriptAt: (pos: { x: number; y: number }, scriptPath?: string, scriptTitle?: string) => void;
  addDocumentAt: (
    pos: { x: number; y: number },
    docPath?: string,
    title?: string,
    docType?: 'pdf' | 'docx' | 'epub' | 'cbz',
  ) => void;
  addModelAt: (
    pos: { x: number; y: number },
    modelPath?: string,
    modelName?: string,
    modelType?: 'lora' | 'checkpoint' | 'controlnet' | 'vae',
    role?: 'reference' | 'workflow',
  ) => void;
  addCanvasEmbedAt: (pos: { x: number; y: number }, canvasPath?: string, title?: string) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useNodeHelpers(options: UseNodeHelpersOptions): UseNodeHelpersReturn {
  const { addNode, nodeCount, reportAction } = options;

  const addTextAt = useCallback(
    (pos: { x: number; y: number }) => {
      addNode(
        buildCanvasNode({
          type: 'annotation',
          position: pos,
          zIndex: nodeCount,
          data: { content: t('node.newText') },
          preset: 'annotation.basic',
        }),
      );
      reportAction('addNode', 'Add text note');
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
      addNode(
        buildCanvasNode({
          type: 'media',
          position: pos,
          zIndex: nodeCount,
          data: {
            assetPath: uri || '',
            mediaType,
            thumbnailPath: undefined,
            duration: undefined,
          },
          preset: 'media.basic',
        }),
      );
      reportAction('addNode', `Add ${mediaType}`, name);
    },
    [addNode, nodeCount, reportAction],
  );

  const addShotAt = useCallback(
    (pos: { x: number; y: number }) => {
      addNode(
        buildCanvasNode({
          type: 'shot',
          position: pos,
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
          preset: 'shot.basic',
        }),
      );
      reportAction('addNode', 'Add shot');
    },
    [addNode, nodeCount, reportAction],
  );

  const addSceneGroupAt = useCallback(
    (pos: { x: number; y: number }) => {
      addNode(
        buildCanvasNode({
          type: 'scene',
          position: pos,
          zIndex: nodeCount,
          data: {
            sceneTitle: t('node.newScene'),
            sceneNumber: nodeCount + 1,
          },
          preset: 'scene.basic',
        }),
      );
      reportAction('addNode', 'Add scene group');
    },
    [addNode, nodeCount, reportAction],
  );

  const addGalleryAt = useCallback(
    (pos: { x: number; y: number }) => {
      const galleryPreset = 'character-3view' as const;
      const config = GALLERY_PRESET_CONFIGS[galleryPreset];
      const cells = config.labels.map((label, i) => ({
        id: `cell-${Date.now()}-${i}`,
        label,
        generationStatus: 'idle' as const,
      }));
      addNode(
        buildCanvasNode({
          type: 'gallery',
          position: pos,
          zIndex: nodeCount,
          data: {
            preset: galleryPreset,
            rows: config.rows,
            cols: config.cols,
            cells,
          },
          preset: 'gallery.basic',
        }),
      );
      reportAction('addNode', 'Add gallery');
    },
    [addNode, nodeCount, reportAction],
  );

  const addScriptAt = useCallback(
    (pos: { x: number; y: number }, scriptPath = '', scriptTitle = 'Script') => {
      const w = 280,
        h = 220;
      addNode({
        type: 'script',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          scriptPath,
          scriptTitle,
          scenes: [],
        },
      });
      reportAction('addNode', 'Add script reference', scriptTitle || undefined);
    },
    [addNode, nodeCount, reportAction],
  );

  const addDocumentAt = useCallback(
    (
      pos: { x: number; y: number },
      docPath = '',
      title = 'Document',
      docType: 'pdf' | 'docx' | 'epub' | 'cbz' = 'pdf',
    ) => {
      const w = 220,
        h = 280;
      addNode({
        type: 'document',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          docPath,
          docType,
          title,
        },
      });
      reportAction('addNode', 'Add document reference', title || undefined);
    },
    [addNode, nodeCount, reportAction],
  );

  const addModelAt = useCallback(
    (
      pos: { x: number; y: number },
      modelPath = '',
      modelName = 'Model',
      modelType: 'lora' | 'checkpoint' | 'controlnet' | 'vae' = 'lora',
      role: 'reference' | 'workflow' = 'reference',
    ) => {
      const w = 240,
        h = 160;
      addNode({
        type: 'model',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          modelPath,
          modelName,
          modelType,
          role,
        },
      });
      reportAction('addNode', 'Add model reference', modelName || undefined);
    },
    [addNode, nodeCount, reportAction],
  );

  const addCanvasEmbedAt = useCallback(
    (pos: { x: number; y: number }, canvasPath = '', title = 'Canvas') => {
      const w = 220,
        h = 180;
      addNode({
        type: 'canvas-embed',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          canvasPath,
          canvasTitle: title,
        },
      });
      reportAction('addNode', 'Add canvas embed', title || undefined);
    },
    [addNode, nodeCount, reportAction],
  );

  return {
    addTextAt,
    addMediaAt,
    addShotAt,
    addSceneGroupAt,
    addGalleryAt,
    addScriptAt,
    addDocumentAt,
    addModelAt,
    addCanvasEmbedAt,
  };
}
