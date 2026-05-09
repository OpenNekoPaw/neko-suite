import React, { useCallback } from 'react';
import type { CanvasNode, FieldBinding } from '@neko/shared';
import { writeFieldBinding } from '@neko/shared';
import { BaseNode } from '../nodes/BaseNode';
import { ContainerRenderer } from './ContainerRenderer';
import type { FieldBindingUpdate, NodeContentRenderContext } from './types';
import type { NodeRendererContext } from '../nodes/nodeRendererTypes';

export type LegacyNodeRenderer = (context: NodeRendererContext) => React.ReactNode;

export interface NodeContentDispatcherProps {
  context: NodeRendererContext;
  renderLegacy?: LegacyNodeRenderer;
}

export function NodeContentDispatcher({ context, renderLegacy }: NodeContentDispatcherProps) {
  const { node } = context;

  if (!node.content) {
    return renderLegacy ? <>{renderLegacy(context)}</> : null;
  }

  return <ComposableNodeContent context={context} node={node} content={node.content} />;
}

function ComposableNodeContent({
  context,
  node,
  content,
}: {
  context: NodeRendererContext;
  node: CanvasNode;
  content: NonNullable<CanvasNode['content']>;
}) {
  const handleUpdateBinding = useCallback(
    (update: FieldBindingUpdate) => {
      const binding: FieldBinding = { path: update.path as FieldBinding['path'] };
      const result = writeFieldBinding(node.data, binding, update.value);
      if (result.changed && isRecord(result.data)) {
        context.onUpdateData?.(node.id, result.data);
      }
    },
    [context, node],
  );

  const handleAction = useCallback(
    (action: string) => {
      switch (action) {
        case 'assignSelectedShots':
          context.onAssignSelectedShotsToScene?.(node.id);
          return;
        case 'autoLayoutShots':
          context.onAutoLayoutSceneShots?.(node.id);
          return;
        case 'batchGenerateShots':
          context.onBatchGenerateSceneShots?.(node.id);
          return;
        default:
          return;
      }
    },
    [context, node.id],
  );

  const renderContext: NodeContentRenderContext = {
    node,
    allNodes: context.allNodes,
    isSelected: context.isSelected,
    depth: 0,
    onUpdateBinding: handleUpdateBinding,
    onSelectNode: context.onSelect,
    onAction: handleAction,
  };

  return (
    <BaseNode
      node={node}
      viewport={context.viewport}
      isSelected={context.isSelected}
      containerRef={context.containerRef}
      onSelect={context.onSelect}
      onDrag={context.onDrag}
      onMove={context.onMove}
      onResize={context.onResize}
      onResizeEnd={context.onResizeEnd}
      onRotate={context.onRotate}
      onRotateEnd={context.onRotateEnd}
      onConnectionStart={context.onConnectionStart}
    >
      <ContainerRenderer section={content} context={renderContext} />
    </BaseNode>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
