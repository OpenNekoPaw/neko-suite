import React from 'react';
import type {
  AnnotationCanvasNode,
  CanvasEmbedCanvasNode,
  DocumentCanvasNode,
  GroupCanvasNode,
  ModelCanvasNode,
  ScriptCanvasNode,
  StoryboardCanvasNode,
  TextCanvasNode,
  ArtboardCanvasNode,
} from '@neko/shared';
import { AnnotationNode } from './AnnotationNode';
import { ArtboardNode } from './ArtboardNode';
import { CanvasEmbedNode } from './CanvasEmbedNode';
import { DocumentNode } from './DocumentNode';
import { GroupNode } from './GroupNode';
import { ModelNode } from './ModelNode';
import { ScriptNode } from './ScriptNode';
import { StoryboardNode } from './StoryboardNode';
import { TextNode } from './TextNode';
import { NodeContentDispatcher } from '../content/NodeContentDispatcher';
import type { NodeRendererContext, NodeRendererRegistry } from './nodeRendererTypes';

export function createBuiltInNodeRendererRegistry(): NodeRendererRegistry {
  return {
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

  return (
    <NodeContentDispatcher
      context={context}
      renderLegacy={renderer ? (legacyContext) => renderer(legacyContext) : undefined}
    />
  );
}
