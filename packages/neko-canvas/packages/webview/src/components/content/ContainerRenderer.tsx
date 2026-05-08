import React, { useMemo } from 'react';
import type { CanvasBlock } from '@neko/shared';
import { getContainerChildIds } from '@neko/shared';
import { createBuiltInBlockRendererRegistry, renderCanvasBlock } from './blockRendererRegistry';
import type { BlockRendererRegistry, ContainerRendererProps } from './types';

const MAX_CONTENT_DEPTH = 8;

export function ContainerRenderer({ section, context }: ContainerRendererProps) {
  const blockRendererRegistry = useMemo(() => createBuiltInBlockRendererRegistry(), []);

  if (!isSectionVisible(section.visibleWhen, context.isSelected)) {
    return null;
  }

  if (context.depth > MAX_CONTENT_DEPTH) {
    return <div className="p-2 text-xs text-red-300">Content depth limit reached</div>;
  }

  return (
    <div className={getSectionClassName(section.layout)}>
      {section.title && (
        <div className="text-xs font-medium text-[var(--node-fg-secondary)]">{section.title}</div>
      )}
      {section.blocks?.map((block) =>
        renderContentBlock(blockRendererRegistry, block, {
          ...context,
          depth: context.depth + 1,
        }),
      )}
      {section.childSlots?.map((slot) => (
        <div key={slot.id} className="space-y-1">
          {resolveSlotChildIds(context.node, slot.childIds).map((childId) => {
            const child = context.allNodes.find((candidate) => candidate.id === childId);
            return child ? (
              <button
                key={child.id}
                type="button"
                className="flex w-full items-center justify-between rounded border border-[var(--node-border)] px-2 py-1 text-left text-xs text-[var(--node-fg)] hover:border-[var(--node-selected)]"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) =>
                  context.onSelectNode?.(child.id, event.shiftKey || event.metaKey)
                }
              >
                <span className="min-w-0 truncate">
                  {child.preview?.title ?? child.preview?.subtitle ?? child.id}
                </span>
                <span className="ml-2 flex-shrink-0 text-[var(--node-fg-secondary)]">
                  {child.preview?.role ?? child.type}
                </span>
              </button>
            ) : null;
          })}
        </div>
      ))}
      {section.sections?.map((childSection) => (
        <ContainerRenderer
          key={childSection.id}
          section={childSection}
          context={{ ...context, depth: context.depth + 1 }}
        />
      ))}
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
