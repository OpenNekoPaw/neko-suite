import React, { useCallback, useMemo } from 'react';
import type { CanvasNode, ContainerSection, FieldBinding } from '@neko/shared';
import { getDefaultCanvasNodePresetName, writeFieldBinding } from '@neko/shared';
import { BaseNode } from '../nodes/BaseNode';
import { NodeShell } from './NodeShell';
import type { FieldBindingUpdate, NodeContentRenderContext } from './types';
import type { NodeRendererContext } from '../nodes/nodeRendererTypes';
import {
  createBuiltInCanvasNodePresetRegistry,
  getCanvasNodePreset,
} from '../../utils/canvasPresetRegistry';
import type { CanvasNodeDraft } from '../../utils/canvasPresetRegistry';

export type LegacyNodeRenderer = (context: NodeRendererContext) => React.ReactNode;

export interface NodeContentDispatcherProps {
  context: NodeRendererContext;
  renderLegacy?: LegacyNodeRenderer;
}

const PRESET_REGISTRY = createBuiltInCanvasNodePresetRegistry();

export function NodeContentDispatcher({ context, renderLegacy }: NodeContentDispatcherProps) {
  const { node } = context;

  const content = useMemo(() => resolveContent(node), [node]);

  if (!content) {
    return renderLegacy ? <>{renderLegacy(context)}</> : null;
  }

  return <ComposableNodeContent context={context} node={node} content={content} />;
}

function resolveContent(node: CanvasNode): ContainerSection | undefined {
  const presetName = node.preset ?? getDefaultCanvasNodePresetName(node.type);
  const preset = getCanvasNodePreset(PRESET_REGISTRY, presetName);
  if (preset && preset.nodeType === node.type) {
    return preset.createContent(node as CanvasNodeDraft);
  }

  if (node.content) return node.content;

  return undefined;
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

  const renderContext: NodeContentRenderContext = {
    node,
    allNodes: context.allNodes,
    selectedNodeIds: context.selectedNodeIds,
    isSelected: context.isSelected,
    depth: 0,
    onUpdateBinding: handleUpdateBinding,
    onSelectNode: context.onSelect,
    onRemoveChild: context.onRemoveContainerChild,
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
      <NodeShell section={content} context={renderContext} />
    </BaseNode>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
