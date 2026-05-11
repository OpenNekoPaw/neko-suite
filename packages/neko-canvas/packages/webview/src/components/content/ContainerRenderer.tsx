import React, { useMemo, useState } from 'react';
import type { CanvasBlock } from '@neko/shared';
import { getContainerChildIds } from '@neko/shared';
import { createBuiltInBlockRendererRegistry, renderCanvasBlock } from './blockRendererRegistry';
import type { BlockRendererRegistry, ContainerRendererProps } from './types';
import { NodeCard } from './node-card';
import { t } from '../../i18n';

const MAX_CONTENT_DEPTH = 8;

export function ContainerRenderer({ section, context }: ContainerRendererProps) {
  const blockRendererRegistry = useMemo(() => createBuiltInBlockRendererRegistry(), []);
  const [isCollapsed, setIsCollapsed] = useState(() => section.defaultCollapsed ?? false);

  if (!isSectionVisible(section.visibleWhen, context.isSelected)) {
    return null;
  }

  if (context.depth > MAX_CONTENT_DEPTH) {
    return <div className="p-2 text-xs text-red-300">Content depth limit reached</div>;
  }

  const sectionCollapsible = section.collapsible === true;

  return (
    <div className={getSectionClassName(section.layout)}>
      {section.title &&
        (sectionCollapsible ? (
          <button
            type="button"
            className="flex w-full items-center gap-1 text-xs font-medium text-[var(--node-fg-secondary)] hover:text-[var(--node-fg)]"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setIsCollapsed((prev) => !prev)}
          >
            <span className="text-[10px]">{isCollapsed ? '▶' : '▼'}</span>
            {resolveLabel(section.title)}
          </button>
        ) : (
          <div className="text-xs font-medium text-[var(--node-fg-secondary)]">
            {resolveLabel(section.title)}
          </div>
        ))}
      {(!sectionCollapsible || !isCollapsed) && (
        <>
          {section.blocks?.map((block) =>
            renderContentBlock(blockRendererRegistry, block, {
              ...context,
              depth: context.depth + 1,
            }),
          )}
          {section.childSlots?.map((slot) => {
            const childIds = resolveSlotChildIds(context.node, slot.childIds);
            const tableColumns = context.node.container?.layout?.columns;
            const galleryCols =
              slot.layout === 'gallery'
                ? ((context.node.data as { cols?: number }).cols ?? 3)
                : undefined;
            return (
              <div
                key={slot.id}
                className={
                  slot.layout === 'table' || slot.layout === 'gallery'
                    ? 'grid gap-1.5'
                    : slot.layout === 'grid'
                      ? 'grid grid-cols-3 gap-1.5'
                      : 'space-y-1'
                }
                style={
                  slot.layout === 'table'
                    ? { gridTemplateColumns: `repeat(${tableColumns ?? 3}, 1fr)` }
                    : slot.layout === 'gallery'
                      ? { gridTemplateColumns: `repeat(${galleryCols}, 1fr)` }
                      : undefined
                }
              >
                {childIds.length === 0 ? (
                  <span className="px-2 py-1 text-xs text-[var(--node-fg-secondary)]">
                    {resolveLabel(slot.emptyLabel) ?? 'Children'}
                  </span>
                ) : (
                  childIds.map((childId) => {
                    const child = context.allNodes.find((candidate) => candidate.id === childId);
                    return child ? (
                      <NodeCard
                        key={child.id}
                        node={child}
                        parentNode={context.node}
                        selection={{ nodeIds: context.selectedNodeIds }}
                        onSelect={context.onSelectNode}
                      />
                    ) : null;
                  })
                )}
              </div>
            );
          })}
          {section.sections?.map((childSection) => (
            <ContainerRenderer
              key={childSection.id}
              section={childSection}
              context={{ ...context, depth: context.depth + 1 }}
            />
          ))}
        </>
      )}
    </div>
  );
}

function renderContentBlock(
  registry: BlockRendererRegistry,
  block: CanvasBlock,
  context: ContainerRendererProps['context'],
): React.ReactNode {
  if (!isSectionVisible(block.visibleWhen, context.isSelected)) {
    return null;
  }

  return (
    <div key={block.id} data-content-block-id={block.id} className="min-w-0">
      {renderCanvasBlock(registry, { ...context, block })}
    </div>
  );
}

function resolveLabel(label: string | undefined): string | undefined {
  if (!label) return label;
  if (label.startsWith('preset.')) return t(label);
  return label;
}

function resolveSlotChildIds(
  node: ContainerRendererProps['context']['node'],
  childIds?: string[],
): string[] {
  return childIds ?? getContainerChildIds(node);
}

function isSectionVisible(visibleWhen: string | undefined, isSelected: boolean): boolean {
  return (
    visibleWhen === undefined ||
    visibleWhen === 'always' ||
    (visibleWhen === 'selected' && isSelected)
  );
}

function getSectionClassName(layout: string | undefined): string {
  switch (layout) {
    case 'row':
      return 'flex min-w-0 flex-row gap-2 p-2';
    case 'grid':
    case 'gallery':
      return 'grid min-w-0 grid-cols-2 gap-2 p-2';
    case 'table':
      return 'grid min-w-0 gap-1 p-2';
    default:
      return 'flex min-h-0 min-w-0 flex-col gap-2 p-2';
  }
}
