import React from 'react';
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
import { AnnotationNode } from './AnnotationNode';
import { ArtboardNode } from './ArtboardNode';
import { CanvasEmbedNode } from './CanvasEmbedNode';
import { DocumentNode } from './DocumentNode';
import { GalleryNode } from './GalleryNode';
import { GroupNode } from './GroupNode';
import { MediaNode } from './MediaNode';
import { ModelNode } from './ModelNode';
import { SceneGroupNode } from './SceneGroupNode';
import { ScriptNode } from './ScriptNode';
import { ShotNode } from './ShotNode';
import { StoryboardNode } from './StoryboardNode';
import { TextNode } from './TextNode';
import { NodeContentDispatcher } from '../content/NodeContentDispatcher';
import { getSceneShotNodes } from '../../utils/canvasOrganization';
import type { NodeRendererContext, NodeRendererRegistry } from './nodeRendererTypes';

export function createBuiltInNodeRendererRegistry(): NodeRendererRegistry {
  return {
    media: ({ node, ...commonProps }) => (
      <MediaNode key={node.id} node={node as MediaCanvasNode} {...commonProps} />
    ),
    storyboard: ({ node, ...commonProps }) => (
      <StoryboardNode key={node.id} node={node as StoryboardCanvasNode} {...commonProps} />
    ),
    annotation: ({ node, ...commonProps }) => (
      <AnnotationNode key={node.id} node={node as AnnotationCanvasNode} {...commonProps} />
    ),
    text: ({ node, onUpdateData, ...commonProps }) => (
      <TextNode
        key={node.id}
        node={node as TextCanvasNode}
        {...commonProps}
        onContentChange={(nodeId, content) => onUpdateData?.(nodeId, { content })}
        onStyleChange={(nodeId, style) => onUpdateData?.(nodeId, { style })}
      />
    ),
    artboard: ({ node, ...commonProps }) => (
      <ArtboardNode key={node.id} node={node as ArtboardCanvasNode} {...commonProps} />
    ),
    group: ({ node, allNodes, ...commonProps }) => (
      <GroupNode
        key={node.id}
        node={node as GroupCanvasNode}
        allNodes={allNodes}
        {...commonProps}
      />
    ),
    shot: ({ node, onSelectShotCandidate, ...commonProps }) => (
      <ShotNode
        key={node.id}
        node={node as ShotCanvasNode}
        {...commonProps}
        onSelectCandidate={onSelectShotCandidate}
      />
    ),
    scene: ({
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
    gallery: ({ node, onSelectGalleryCellCandidate, ...commonProps }) => (
      <GalleryNode
        key={node.id}
        node={node as GalleryCanvasNode}
        {...commonProps}
        onSelectCellCandidate={onSelectGalleryCellCandidate}
      />
    ),
    script: ({
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
    document: ({ node, onDocumentOpen, ...commonProps }) => (
      <DocumentNode
        key={node.id}
        node={node as DocumentCanvasNode}
        {...commonProps}
        onOpenDocument={onDocumentOpen}
      />
    ),
    'canvas-embed': ({ node, onCanvasEmbedOpen, ...commonProps }) => (
      <CanvasEmbedNode
        key={node.id}
        node={node as CanvasEmbedCanvasNode}
        {...commonProps}
        onOpenCanvas={onCanvasEmbedOpen}
      />
    ),
    model: ({ node, onModelCheckInstalled, ...commonProps }) => (
      <ModelNode
        key={node.id}
        node={node as ModelCanvasNode}
        {...commonProps}
        onCheckInstalled={onModelCheckInstalled}
      />
    ),
  };
}

export function renderCanvasNode(
  registry: NodeRendererRegistry,
  context: NodeRendererContext,
): React.ReactNode {
  const renderer = registry[context.node.type];
  if (!renderer) {
    return null;
  }

  return (
    <NodeContentDispatcher
      context={context}
      renderLegacy={(legacyContext) => renderer(legacyContext)}
    />
  );
}
