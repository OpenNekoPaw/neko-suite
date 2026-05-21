import type { CanvasNode, CanvasViewport, RegisteredCanvasNode } from '@neko/shared';
import { BaseNode } from '../../components/nodes/BaseNode';
import type { NodeRendererCommonProps, NodeRendererRegistry } from '../../components/nodes';
import { t } from '../../i18n';

type NarrativeNode = RegisteredCanvasNode & { data: Record<string, unknown> };

interface NarrativeNodeProps extends NodeRendererCommonProps {
  node: CanvasNode;
}

export function createNarrativeNodeRendererRegistry(): NodeRendererRegistry {
  return {
    choice: (context) => <NarrativeNodeCard key={context.node.id} {...context} />,
    merge: (context) => <NarrativeNodeCard key={context.node.id} {...context} />,
    'narrative-scene': (context) => <NarrativeNodeCard key={context.node.id} {...context} />,
    'narrative-note': (context) => <NarrativeNodeCard key={context.node.id} {...context} />,
  };
}

function NarrativeNodeCard({
  node,
  viewport,
  isSelected,
  containerRef,
  onSelect,
  onDrag,
  onMove,
  onResize,
  onResizeEnd,
  onRotate,
  onRotateEnd,
  onConnectionStart,
  onUpdateData,
}: NarrativeNodeProps) {
  const narrativeNode = node as NarrativeNode;
  const title = readTitle(narrativeNode);
  const detail = readDetail(narrativeNode);

  return (
    <BaseNode
      node={node}
      viewport={viewport as CanvasViewport}
      isSelected={isSelected}
      containerRef={containerRef}
      onSelect={onSelect}
      onDrag={onDrag}
      onMove={onMove}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
      onRotate={onRotate}
      onRotateEnd={onRotateEnd}
      onConnectionStart={onConnectionStart}
    >
      <div className="flex h-full flex-col">
        <div
          className="flex items-center gap-2 border-b px-2 py-1.5"
          style={{
            backgroundColor: 'var(--node-header-bg)',
            borderColor: 'var(--node-divider)',
          }}
        >
          <span
            className="rounded px-1.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: `${colorForType(node.type)}20`, color: colorForType(node.type) }}
          >
            {tagForType(node.type)}
          </span>
          <input
            className="min-w-0 flex-1 border-0 bg-transparent px-0 text-xs font-medium"
            value={title}
            aria-label={t('panel.title')}
            onMouseDown={(event) => event.stopPropagation()}
            onChange={(event) => onUpdateData?.(node.id, titleUpdateForType(node.type, event.target.value))}
          />
        </div>
        <textarea
          className="m-2 min-h-0 flex-1 resize-none rounded border px-2 py-1 text-xs"
          style={{
            backgroundColor: 'var(--control-bg)',
            borderColor: 'var(--control-border)',
            color: 'var(--control-fg)',
          }}
          value={detail}
          aria-label={t('panel.description')}
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onUpdateData?.(node.id, detailUpdateForType(node.type, event.target.value))
          }
        />
      </div>
    </BaseNode>
  );
}

function readTitle(node: NarrativeNode): string {
  if (node.type === 'narrative-scene') return readString(node.data.title, t('node.narrativeScene'));
  if (node.type === 'narrative-note') return t('node.narrativeNote');
  return readString(node.data.label ?? node.data.name, node.type);
}

function readDetail(node: NarrativeNode): string {
  if (node.type === 'narrative-scene') return readString(node.data.summary, '');
  if (node.type === 'narrative-note') return readString(node.data.content, '');
  if (node.type === 'choice') return readString(node.data.condition, '');
  return readString(node.data.description, '');
}

function titleUpdateForType(type: string, value: string): Record<string, unknown> {
  if (type === 'narrative-scene') return { title: value };
  if (type === 'merge') return { label: value };
  if (type === 'choice') return { label: value };
  return { label: value };
}

function detailUpdateForType(type: string, value: string): Record<string, unknown> {
  if (type === 'narrative-scene') return { summary: value };
  if (type === 'narrative-note') return { content: value };
  if (type === 'choice') return { condition: value };
  return { description: value };
}

function tagForType(type: string): string {
  switch (type) {
    case 'choice':
      return 'CHOICE';
    case 'merge':
      return 'MERGE';
    case 'narrative-scene':
      return 'SCENE';
    default:
      return 'NOTE';
  }
}

function colorForType(type: string): string {
  switch (type) {
    case 'choice':
      return '#f97316';
    case 'merge':
      return '#22c55e';
    case 'narrative-scene':
      return '#0ea5e9';
    default:
      return '#a855f7';
  }
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
