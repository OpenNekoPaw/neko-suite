import { useCallback, useMemo } from 'react';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import type { CanvasNode, ContainerSection, FieldBinding } from '@neko/shared';
import { getDefaultCanvasNodePresetName, writeFieldBinding } from '@neko/shared';
import { useCanvasStore } from '../../stores/canvasStore';
import { ContainerRenderer } from '../content/ContainerRenderer';
import { ContainerActionBar } from '../content/node-card';
import { createBuiltInNodeTypeDescriptors } from '../nodes/nodeTypeDescriptors';
import {
  createBuiltInCanvasNodePresetRegistry,
  getCanvasNodePreset,
} from '../../utils/canvasPresetRegistry';
import type { CanvasNodeDraft } from '../../utils/canvasPresetRegistry';
import type { FieldBindingUpdate, NodeContentRenderContext } from '../content/types';
import { t } from '../../i18n';

const PRESET_REGISTRY = createBuiltInCanvasNodePresetRegistry();

const NODE_TYPE_I18N_KEY: Partial<Record<string, string>> = {
  annotation: 'node.note',
  scene: 'node.sceneGroup',
  text: 'node.newText',
  'canvas-embed': 'node.canvasEmbed',
};

export interface ContentOverlayProps {
  nodeId: string;
  onClose: () => void;
}

export function ContentOverlay({ nodeId, onClose }: ContentOverlayProps) {
  const nodes = useCanvasStore((s) => s.canvasData?.nodes ?? []);
  const selectedNodeIds = useCanvasStore((s) => s.selection.nodeIds);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const removeChildFromContainer = useCanvasStore((s) => s.removeChildFromContainer);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const node = useMemo(() => nodes.find((n) => n.id === nodeId), [nodes, nodeId]);

  if (!node) return null;

  const content = resolveOverlayContent(node);
  if (!content) return null;

  return (
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: 9998, backgroundColor: 'rgba(0,0,0,0.8)' }}
        onClick={onClose}
      />
      <div
        className="fixed inset-4 flex flex-col overflow-hidden rounded-xl"
        {...getKeyboardBoundaryMetadata({
          scope: 'modal',
          ownerId: `content-overlay:${node.id}`,
          priority: 40,
          ownedKeys: ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
        })}
        style={{
          zIndex: 9999,
          backgroundColor: 'var(--node-bg)',
          border: '1px solid var(--node-border)',
        }}
      >
        <OverlayHeader node={node} onClose={onClose} />
        <OverlayBody
          node={node}
          content={content}
          allNodes={nodes}
          selectedNodeIds={selectedNodeIds}
          onUpdateData={updateNodeData}
          onSelectNode={selectNode}
          onRemoveChild={removeChildFromContainer}
        />
      </div>
    </>
  );
}

function OverlayHeader({ node, onClose }: { node: CanvasNode; onClose: () => void }) {
  const descriptors = useMemo(() => createBuiltInNodeTypeDescriptors(), []);
  const descriptor = descriptors[node.type];
  const tagLabel = descriptor?.tagLabel ?? node.type.toUpperCase();
  const tagColor = descriptor?.tagColor ?? '#6b7280';

  const key = NODE_TYPE_I18N_KEY[node.type] ?? `node.${node.type}`;
  const title = node.preview?.title ?? t(key) ?? node.id;

  return (
    <div
      className="flex flex-shrink-0 items-center gap-3 px-4 py-3"
      style={{ borderBottom: '1px solid var(--node-divider)' }}
    >
      <span
        className="flex-shrink-0 rounded px-2 py-0.5 text-xs font-medium"
        style={{ backgroundColor: `${tagColor}20`, color: tagColor }}
      >
        {tagLabel}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-sm font-medium"
        style={{ color: 'var(--node-fg)' }}
      >
        {title}
      </span>
      <button
        type="button"
        className="flex-shrink-0 rounded px-2 py-1 text-sm hover:bg-white/10"
        style={{ color: 'var(--node-fg-secondary)' }}
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  );
}

function OverlayBody({
  node,
  content,
  allNodes,
  selectedNodeIds,
  onUpdateData,
  onSelectNode,
  onRemoveChild,
}: {
  node: CanvasNode;
  content: ContainerSection;
  allNodes: CanvasNode[];
  selectedNodeIds: readonly string[];
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  onSelectNode?: (nodeId: string, multi?: boolean) => void;
  onRemoveChild?: (containerId: string, childId: string) => void;
}) {
  const handleUpdateBinding = useCallback(
    (update: FieldBindingUpdate) => {
      const binding: FieldBinding = { path: update.path as FieldBinding['path'] };
      const result = writeFieldBinding(node.data, binding, update.value);
      if (result.changed && isRecord(result.data)) {
        onUpdateData?.(node.id, result.data);
      }
    },
    [node, onUpdateData],
  );

  const renderContext: NodeContentRenderContext = {
    node,
    allNodes,
    selectedNodeIds: [...selectedNodeIds],
    isSelected: true,
    isExpanded: true,
    layout: {
      width: Math.max(720, node.size.width),
      height: Math.max(420, node.size.height),
      density: 'expanded',
      surface: 'overlay',
      overflow: 'scroll',
    },
    depth: 0,
    previewSurfaceKind: 'overlay',
    onUpdateBinding: handleUpdateBinding,
    onUpdateNodeData: onUpdateData,
    onSelectNode,
    onRemoveChild,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
      <ContainerActionBar
        node={node}
        allNodes={allNodes}
        selectedNodeIds={selectedNodeIds}
        isSelected={true}
      />
      <ContainerRenderer section={content} context={renderContext} />
    </div>
  );
}

function resolveOverlayContent(node: CanvasNode): ContainerSection | undefined {
  const presetName = node.preset ?? getDefaultCanvasNodePresetName(node.type);
  const preset = getCanvasNodePreset(PRESET_REGISTRY, presetName);
  if (preset && preset.nodeType === node.type) {
    return preset.createContent(node as CanvasNodeDraft);
  }
  return node.content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
