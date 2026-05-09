/**
 * Unified Node Type Descriptors
 *
 * Single source of truth for node type metadata: renderer, label, icon, default size.
 *
 * Property panel renderers are NOT included here — they live in PropertyPanel.tsx
 * to avoid a circular dependency (PropertyPanel imports i18n helpers that would
 * create a cycle if this file imported back from PropertyPanel).
 *
 * To add a new node type:
 *   1. Add the type to CanvasNodeType in @neko/shared
 *   2. Create the node component under ./
 *   3. Add a descriptor entry here
 *   4. Add a property panel renderer in PropertyPanel.tsx (if needed)
 */

import type {
  AnnotationCanvasNode,
  CanvasEmbedCanvasNode,
  DocumentCanvasNode,
  GalleryCanvasNode,
  GroupCanvasNode,
  MediaCanvasNode,
  ModelCanvasNode,
  SceneGroupCanvasNode,
  ScriptCanvasNode,
  ShotCanvasNode,
  StoryboardCanvasNode,
  TextCanvasNode,
  ArtboardCanvasNode,
} from '@neko/shared';
import type { NodeTypeDescriptorRegistry } from './nodeTypeDescriptor';

// Node components
import {
  AnnotationNode,
  ArtboardNode,
  CanvasEmbedNode,
  DocumentNode,
  GalleryNode,
  GroupNode,
  MediaNode,
  ModelNode,
  SceneGroupNode,
  ScriptNode,
  ShotNode,
  StoryboardNode,
  TextNode,
} from './index';
import { getSceneShotNodes } from '../../utils/canvasOrganization';

/**
 * Create the built-in descriptor registry for all 13 canvas node types.
 */
export function createBuiltInNodeTypeDescriptors(): NodeTypeDescriptorRegistry {
  return {
    media: {
      type: 'media',
      labelKey: 'node.media',
      icon: '\u{1F5BC}\u{FE0F}',
      defaultSize: { width: 280, height: 200 },
      renderer: ({ node, ...commonProps }) => (
        <MediaNode key={node.id} node={node as MediaCanvasNode} {...commonProps} />
      ),
    },

    storyboard: {
      type: 'storyboard',
      labelKey: 'node.storyboard',
      icon: '\u{1F3AC}',
      defaultSize: { width: 240, height: 160 },
      renderer: ({ node, ...commonProps }) => (
        <StoryboardNode key={node.id} node={node as StoryboardCanvasNode} {...commonProps} />
      ),
    },

    annotation: {
      type: 'annotation',
      labelKey: 'toolbar.annotation',
      icon: '\u{1F4DD}',
      defaultSize: { width: 200, height: 100 },
      renderer: ({ node, ...commonProps }) => (
        <AnnotationNode key={node.id} node={node as AnnotationCanvasNode} {...commonProps} />
      ),
    },

    group: {
      type: 'group',
      labelKey: 'node.group',
      icon: '\u{1F4C1}',
      defaultSize: { width: 320, height: 220 },
      renderer: ({ node, allNodes, ...commonProps }) => (
        <GroupNode
          key={node.id}
          node={node as GroupCanvasNode}
          allNodes={allNodes}
          {...commonProps}
        />
      ),
    },

    text: {
      type: 'text',
      labelKey: 'toolbar.text',
      icon: '\u{1F524}',
      defaultSize: { width: 260, height: 120 },
      renderer: ({ node, onUpdateData, ...commonProps }) => (
        <TextNode
          key={node.id}
          node={node as TextCanvasNode}
          {...commonProps}
          onContentChange={(nodeId, content) => onUpdateData?.(nodeId, { content })}
          onStyleChange={(nodeId, style) => onUpdateData?.(nodeId, { style })}
        />
      ),
    },

    artboard: {
      type: 'artboard',
      labelKey: 'node.artboard',
      icon: '\u{1F5BC}',
      defaultSize: { width: 640, height: 360 },
      renderer: ({ node, ...commonProps }) => (
        <ArtboardNode key={node.id} node={node as ArtboardCanvasNode} {...commonProps} />
      ),
    },

    shot: {
      type: 'shot',
      labelKey: 'node.shot',
      icon: '\u{1F3AC}',
      defaultSize: { width: 220, height: 200 },
      renderer: ({ node, onSelectShotCandidate, ...commonProps }) => (
        <ShotNode
          key={node.id}
          node={node as ShotCanvasNode}
          {...commonProps}
          onSelectCandidate={onSelectShotCandidate}
        />
      ),
    },

    scene: {
      type: 'scene',
      labelKey: 'node.sceneGroup',
      icon: '\u{1F39E}',
      defaultSize: { width: 640, height: 400 },
      renderer: ({
        node,
        allNodes,
        selectedNodeIds,
        onSelect,
        onAssignSelectedShotsToScene,
        onAutoLayoutSceneShots,
        onBatchGenerateSceneShots,
        onReorderSceneShots,
        onDetachShotFromScene,
        ...commonProps
      }) => (
        <SceneGroupNode
          key={node.id}
          node={node as SceneGroupCanvasNode}
          {...commonProps}
          onSelect={onSelect}
          selectedShotCount={
            allNodes.filter(
              (candidate) => selectedNodeIds.includes(candidate.id) && candidate.type === 'shot',
            ).length
          }
          shots={getSceneShotNodes(node, allNodes).map((shot) => ({
            id: shot.id,
            shotNumber: shot.data.shotNumber,
            shotScale: shot.data.shotScale,
            generatedImage:
              shot.data.generatedImage ??
              shot.data.generationHistory.find((v) => v.selected)?.dataUrl,
            generationStatus: shot.data.generationStatus,
            visualDescription: shot.data.visualDescription,
          }))}
          onShotThumbnailClick={(shotId) => onSelect?.(shotId, false)}
          onAssignSelectedShots={onAssignSelectedShotsToScene}
          onAutoLayoutShots={onAutoLayoutSceneShots}
          onBatchGenerateShots={onBatchGenerateSceneShots}
          onReorderShots={onReorderSceneShots}
          onDetachShot={onDetachShotFromScene}
        />
      ),
    },

    gallery: {
      type: 'gallery',
      labelKey: 'node.gallery',
      icon: '\u{1F5BC}',
      defaultSize: { width: 290, height: 360 },
      renderer: ({ node, onSelectGalleryCellCandidate, ...commonProps }) => (
        <GalleryNode
          key={node.id}
          node={node as GalleryCanvasNode}
          {...commonProps}
          onSelectCellCandidate={onSelectGalleryCellCandidate}
        />
      ),
    },

    script: {
      type: 'script',
      labelKey: 'node.script',
      icon: '\u{1F4C4}',
      defaultSize: { width: 280, height: 220 },
      renderer: ({
        node,
        onScriptLoadScenes,
        onScriptOpen,
        onScriptNavigateToScene,
        ...commonProps
      }) => (
        <ScriptNode
          key={node.id}
          node={node as ScriptCanvasNode}
          {...commonProps}
          onLoadScenes={onScriptLoadScenes}
          onOpenScript={onScriptOpen}
          onNavigateToScene={onScriptNavigateToScene}
        />
      ),
    },

    document: {
      type: 'document',
      labelKey: 'node.document',
      icon: '\u{1F4DA}',
      defaultSize: { width: 220, height: 280 },
      renderer: ({ node, onDocumentOpen, ...commonProps }) => (
        <DocumentNode
          key={node.id}
          node={node as DocumentCanvasNode}
          {...commonProps}
          onOpenDocument={onDocumentOpen}
        />
      ),
    },

    model: {
      type: 'model',
      labelKey: 'node.model',
      icon: '\u{1F9E0}',
      defaultSize: { width: 240, height: 160 },
      renderer: ({ node, onModelCheckInstalled, ...commonProps }) => (
        <ModelNode
          key={node.id}
          node={node as ModelCanvasNode}
          {...commonProps}
          onCheckInstalled={onModelCheckInstalled}
        />
      ),
    },

    'canvas-embed': {
      type: 'canvas-embed',
      labelKey: 'node.canvasEmbed',
      icon: '\u{1F5C2}',
      defaultSize: { width: 220, height: 180 },
      renderer: ({ node, onCanvasEmbedOpen, ...commonProps }) => (
        <CanvasEmbedNode
          key={node.id}
          node={node as CanvasEmbedCanvasNode}
          {...commonProps}
          onOpenCanvas={onCanvasEmbedOpen}
        />
      ),
    },
  };
}
