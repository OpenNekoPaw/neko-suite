import React from 'react';
import type {
  AnnotationCanvasNode,
  CanvasNode,
  CanvasNodeType,
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
  CanvasViewport,
} from '@neko/shared';
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
import { NodeContentDispatcher } from '../content';

export interface NodeRendererCommonProps {
  viewport: CanvasViewport;
  isSelected: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void;
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onResize?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onResizeEnd?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onRotate?: (nodeId: string, rotation: number) => void;
  onRotateEnd?: (nodeId: string, rotation: number) => void;
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void;
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
}

export interface NodeRendererContext extends NodeRendererCommonProps {
  node: CanvasNode;
  allNodes: CanvasNode[];
  selectedNodeIds: string[];
  onScriptLoadScenes?: (nodeId: string, scriptPath: string) => void;
  onScriptOpen?: (scriptPath: string) => void;
  onScriptNavigateToScene?: (linkedSceneGroupId: string) => void;
  onDocumentOpen?: (docPath: string) => void;
  onCanvasEmbedOpen?: (canvasPath: string) => void;
  onModelCheckInstalled?: (nodeId: string, modelPath: string) => void;
  onSelectShotCandidate?: (nodeId: string, candidateId: string) => void;
  onSelectGalleryCellCandidate?: (nodeId: string, cellId: string, candidateId: string) => void;
  onAssignSelectedShotsToScene?: (sceneId: string) => void;
  onAutoLayoutSceneShots?: (sceneId: string) => void;
  onBatchGenerateSceneShots?: (sceneId: string) => void;
  onReorderSceneShots?: (sceneId: string, shotIds: string[]) => void;
  onDetachShotFromScene?: (sceneId: string, shotId: string) => void;
}

export type NodeRenderer = (context: NodeRendererContext) => React.ReactNode;

export type NodeRendererRegistry = Partial<Record<CanvasNodeType, NodeRenderer>>;

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
        shots={allNodes
          .filter((candidate): candidate is ShotCanvasNode => candidate.type === 'shot')
          .filter((candidate) => candidate.data.sceneGroupId === node.id)
          .sort(
            (a, b) =>
              (node as SceneGroupCanvasNode).data.shotIds.indexOf(a.id) -
              (node as SceneGroupCanvasNode).data.shotIds.indexOf(b.id),
          )
          .map((shot) => ({
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
