import React from 'react';
import type {
  AnnotationCanvasNode,
  CanvasNode,
  CanvasNodeType,
  DocumentCanvasNode,
  GalleryCanvasNode,
  GroupCanvasNode,
  MediaCanvasNode,
  ModelCanvasNode,
  SceneGroupCanvasNode,
  ScriptCanvasNode,
  ShotCanvasNode,
  StoryboardCanvasNode,
  CanvasViewport,
} from '@neko/shared';
import {
  AnnotationNode,
  ArtboardNode,
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
import type { TextCanvasNode, ArtboardCanvasNode } from '../../types/extendedCanvas';

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
  onModelCheckInstalled?: (nodeId: string, modelPath: string) => void;
  onSelectShotCandidate?: (nodeId: string, candidateId: string) => void;
  onAssignSelectedShotsToScene?: (sceneId: string) => void;
  onAutoLayoutSceneShots?: (sceneId: string) => void;
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
      onAssignSelectedShotsToScene,
      onAutoLayoutSceneShots,
      ...commonProps
    }) => (
      <SceneGroupNode
        key={node.id}
        node={node as SceneGroupCanvasNode}
        {...commonProps}
        selectedShotCount={
          allNodes.filter(
            (candidate) => selectedNodeIds.includes(candidate.id) && candidate.type === 'shot',
          ).length
        }
        onAssignSelectedShots={onAssignSelectedShotsToScene}
        onAutoLayoutShots={onAutoLayoutSceneShots}
      />
    ),
    gallery: ({ node, ...commonProps }) => (
      <GalleryNode key={node.id} node={node as GalleryCanvasNode} {...commonProps} />
    ),
    script: ({ node, onScriptLoadScenes, onScriptOpen, onScriptNavigateToScene, ...commonProps }) => (
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
  return renderer ? renderer(context) : null;
}
