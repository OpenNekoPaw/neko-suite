import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import type { CanvasBlock, CanvasNode, ChildNodeSlot } from '@neko/shared';
import { getContainerChildIds, getNodeParentId } from '@neko/shared';
import { createBuiltInBlockRendererRegistry, renderCanvasBlock } from './blockRendererRegistry';
import type {
  BlockRendererRegistry,
  ContainerRendererProps,
  NodeContentLayoutContext,
} from './types';
import {
  CardPreviewSlot,
  createBuiltInNodeCardPolicyRegistry,
  dispatchNodeCardAction,
  evaluateActionCondition,
  getNodeCardPolicy,
  NODE_CARD_ACTION_DISPATCHER,
  readNumber,
  readString,
} from './node-card';
import { useCanvasStore } from '../../stores/canvasStore';
import { useClipboardStore } from '../../stores/clipboardStore';
import { useHistoryStore } from '../../stores/historyStore';
import { getGlobalVSCodeApi } from '../../utils/vscode';
import type { CardActionDescriptor, CardBadge, CardPreviewSource } from './node-card';
import type { NodeCardVariant } from './node-card';
import { t } from '../../i18n';
import { resolveCanvasStatusLabel } from '../../i18n/canvasValueLabels';

const MAX_CONTENT_DEPTH = 8;
const NODE_CARD_POLICY_REGISTRY = createBuiltInNodeCardPolicyRegistry();
const INLINE_FORM_CONTROL_CLASS =
  'min-w-0 rounded border border-[var(--node-border)] bg-white px-2 py-1 text-gray-900 outline-none focus:border-[var(--node-selected)]';
const INLINE_TEXTAREA_CONTROL_CLASS =
  'min-h-[76px] resize-none rounded border border-[var(--node-border)] bg-white px-2 py-1 text-gray-900 outline-none focus:border-[var(--node-selected)]';
const INLINE_TEXT_OWNED_KEYS = [
  'Backspace',
  'Delete',
  'Enter',
  'Escape',
  'Space',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
] as const;

export function ContainerRenderer({ section, context }: ContainerRendererProps) {
  const blockRendererRegistry = useMemo(() => createBuiltInBlockRendererRegistry(), []);
  const [isCollapsed, setIsCollapsed] = useState(() => resolveDefaultCollapsed(section, context));

  useEffect(() => {
    // Re-apply surface-specific defaults, such as overlay sections that must open
    // even if the same section was manually collapsed on the canvas surface.
    setIsCollapsed(resolveDefaultCollapsed(section, context));
  }, [context.layout.surface, section.defaultCollapsed, section.id, section.metadata]);

  if (!isSectionVisible(section.visibleWhen, context)) {
    return null;
  }

  if (context.depth > MAX_CONTENT_DEPTH) {
    return (
      <div className="p-2 text-xs" style={{ color: 'var(--danger-fg)' }}>
        {t('content.depthLimitReached')}
      </div>
    );
  }

  const sectionCollapsible = section.collapsible === true;

  return (
    <div className={getSectionClassName(section.layout, shouldFillSection(section, context))}>
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
          {section.sections?.map((childSection) => (
            <ContainerRenderer
              key={childSection.id}
              section={childSection}
              context={{ ...context, depth: context.depth + 1 }}
            />
          ))}
          {section.childSlots?.map((slot) => {
            const childIds = resolveSlotChildIds(context.node, context.allNodes, slot.childIds);
            const childNodes = childIds
              .map((childId) => context.allNodes.find((candidate) => candidate.id === childId))
              .filter((node): node is CanvasNode => Boolean(node));
            const presentation = resolveChildSlotPresentation(context.node, slot);
            const slotLayout = resolveChildSlotLayout(
              context.node,
              slot,
              context.layout,
              presentation,
            );
            return (
              <div
                key={slot.id}
                className={getChildSlotFrameClassName(presentation)}
                data-child-slot-id={slot.id}
                data-child-slot-variant={slotLayout.cardVariant}
                data-child-slot-kind={presentation}
                data-child-slot-overflow={context.layout.overflow}
                data-child-slot-card-height={slotLayout.cardHeight}
                data-child-slot-card-max-height={slotLayout.maxCardHeight}
              >
                {childNodes.length === 0 ? (
                  <span className="px-2 py-1 text-xs text-[var(--node-fg-secondary)]">
                    {resolveLabel(slot.emptyLabel) ?? t('content.children')}
                  </span>
                ) : (
                  renderChildSlotContent({
                    presentation,
                    parentNode: context.node,
                    childNodes,
                    context,
                    slotLayout,
                  })
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function renderChildSlotContent({
  presentation,
  parentNode,
  childNodes,
  context,
  slotLayout,
}: {
  presentation: ChildSlotPresentation;
  parentNode: CanvasNode;
  childNodes: readonly CanvasNode[];
  context: ContainerRendererProps['context'];
  slotLayout: ChildSlotLayout;
}): React.ReactNode {
  switch (presentation) {
    case 'scene-shot-rail':
      return (
        <SceneShotRail
          parentNode={parentNode}
          childNodes={childNodes}
          context={context}
          slotLayout={slotLayout}
        />
      );
    case 'group-summary':
      return (
        <ChildSummaryGrid
          className={slotLayout.className}
          style={slotLayout.style}
          childNodes={childNodes}
          renderChild={(child) => (
            <GroupChildSummaryCard
              key={child.id}
              parentNode={parentNode}
              childNode={child}
              context={context}
              variant={slotLayout.cardVariant}
              style={slotLayout.cardStyle}
            />
          )}
        />
      );
    case 'gallery-grid':
      return (
        <ChildSummaryGrid
          className={slotLayout.className}
          style={slotLayout.style}
          childNodes={childNodes}
          renderChild={(child, index) => (
            <GalleryChildCard
              key={child.id}
              parentNode={parentNode}
              childNode={child}
              index={index}
              context={context}
              style={slotLayout.cardStyle}
            />
          )}
        />
      );
    case 'detail-cards':
      return (
        <ChildSummaryGrid
          className={slotLayout.className}
          style={slotLayout.style}
          childNodes={childNodes}
          renderChild={(child) => (
            <ChildNodeDetailCard
              key={child.id}
              parentNode={parentNode}
              childNode={child}
              context={context}
              variant={slotLayout.cardVariant}
              style={slotLayout.cardStyle}
            />
          )}
        />
      );
  }
}

function ChildSummaryGrid({
  className,
  style,
  childNodes,
  renderChild,
}: {
  className: string;
  style?: React.CSSProperties;
  childNodes: readonly CanvasNode[];
  renderChild: (child: CanvasNode, index: number) => React.ReactNode;
}): React.ReactNode {
  return (
    <div className={className} style={style}>
      {childNodes.map((child, index) => renderChild(child, index))}
    </div>
  );
}

function GroupChildSummaryCard({
  parentNode,
  childNode,
  context,
  variant,
  style,
}: {
  parentNode: CanvasNode;
  childNode: CanvasNode;
  context: ContainerRendererProps['context'];
  variant: NodeCardVariant;
  style?: React.CSSProperties;
}): React.ReactNode {
  const policy = getNodeCardPolicy(NODE_CARD_POLICY_REGISTRY, childNode);
  const previewSource = policy.resolvePreviewSource(childNode);
  const title = policy.resolveTitle(childNode, parentNode);
  const subtitle = resolveChildSummaryText(childNode, policy.resolveSubtitle?.(childNode));
  const badges = policy.resolveBadges?.(childNode) ?? [];
  const isSelected = context.selectedNodeIds.includes(childNode.id);
  const isPlaybackActive = useCanvasStore((state) => state.activePlayingNodeId === childNode.id);
  const childTypeLabel = resolveNodeTypeLabel(childNode);

  const handleSelect = useCallback(
    (event: React.MouseEvent) => {
      context.onSelectNode?.(childNode.id, event.shiftKey || event.metaKey);
    },
    [childNode.id, context],
  );

  const handleOpenDetails = useCallback(() => {
    dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, 'open-content-overlay', {
      nodeId: childNode.id,
      node: childNode,
      parentNodeId: parentNode.id,
      canvasStore: useCanvasStore.getState(),
      historyStore: useHistoryStore.getState(),
      clipboardStore: useClipboardStore.getState(),
      postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
    });
  }, [childNode, parentNode.id]);

  const handleRemove = useCallback(() => {
    context.onRemoveChild?.(parentNode.id, childNode.id);
    if (!context.onRemoveChild) {
      dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, 'remove', {
        nodeId: childNode.id,
        node: childNode,
        parentNodeId: parentNode.id,
        canvasStore: useCanvasStore.getState(),
        historyStore: useHistoryStore.getState(),
        clipboardStore: useClipboardStore.getState(),
        postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
      });
    }
  }, [childNode, context, parentNode.id]);

  return (
    <div
      role="button"
      tabIndex={0}
      className={getGroupSummaryCardClassName(variant, isSelected, isPlaybackActive)}
      {...getKeyboardBoundaryMetadata({
        scope: 'container',
        ownerId: `container-child:${childNode.id}`,
        ownedKeys: ['Enter', 'Space'],
      })}
      style={style}
      data-group-child-card-id={childNode.id}
      data-group-child-card-layout="summary"
      data-group-child-card-height={readStyleHeight(style)}
      data-playback-active={isPlaybackActive ? 'true' : undefined}
      aria-pressed={isSelected}
      onClick={handleSelect}
      onDoubleClick={handleOpenDetails}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          context.onSelectNode?.(childNode.id, event.shiftKey || event.metaKey);
        }
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-gray-200 bg-white px-2 py-1.5">
        <span className="flex-shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] leading-none text-gray-500">
          {childTypeLabel}
        </span>
        <div className="min-w-0 flex-1 truncate text-[12px] font-medium text-gray-900">{title}</div>
        {badges.slice(0, 1).map((badge) => (
          <span key={badge.label} className={getChildBadgeClassName(badge.tone)}>
            {badge.label}
          </span>
        ))}
        <button
          type="button"
          className={getChildActionClassName({
            id: 'remove',
            label: 'action.remove',
            position: 'top-right',
            visibleWhen: 'always',
            danger: true,
          })}
          title={t('group.removeChild')}
          onClick={(event) => {
            event.stopPropagation();
            handleRemove();
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {t('action.removeShort')}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 gap-2 bg-white px-2 py-2">
        <div className={getSummaryPreviewWrapperClassName(variant)}>
          <CardPreviewSlot
            source={previewSource}
            title={title}
            variant="summary-large"
            interactionRenderMode={context.interactionRenderMode}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col text-left">
          <div className="line-clamp-3 min-h-[44px] text-[11px] leading-4 text-gray-600">
            {subtitle}
          </div>
          <button
            type="button"
            className="mt-auto self-start rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] leading-none text-gray-600 hover:border-blue-300 hover:text-blue-600"
            title={t('group.openChildDetail')}
            onClick={(event) => {
              event.stopPropagation();
              handleOpenDetails();
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {t('scene.openShotDetailShort')}
          </button>
        </div>
      </div>
    </div>
  );
}

function GalleryChildCard({
  parentNode,
  childNode,
  index,
  context,
  style,
}: {
  parentNode: CanvasNode;
  childNode: CanvasNode;
  index: number;
  context: ContainerRendererProps['context'];
  style?: React.CSSProperties;
}): React.ReactNode {
  const policy = getNodeCardPolicy(NODE_CARD_POLICY_REGISTRY, childNode);
  const previewSource = policy.resolvePreviewSource(childNode);
  const title = policy.resolveTitle(childNode, parentNode);
  const subtitle = resolveGalleryChildSummary(
    parentNode,
    childNode,
    policy.resolveSubtitle?.(childNode),
  );
  const badges = resolveGalleryChildBadges(
    parentNode,
    childNode,
    policy.resolveBadges?.(childNode) ?? [],
  );
  const actions = policy.resolveActions?.(childNode, parentNode) ?? [];
  const visibleActions = actions.filter((action) =>
    evaluateActionCondition(action.enabledWhen, {
      node: childNode,
      parentNode,
      selection: { nodeIds: context.selectedNodeIds },
      previewSource,
    }),
  );
  const isSelected = context.selectedNodeIds.includes(childNode.id);
  const isPlaybackActive = useCanvasStore((state) => state.activePlayingNodeId === childNode.id);

  const handleSelect = useCallback(
    (event: React.MouseEvent) => {
      context.onSelectNode?.(childNode.id, event.shiftKey || event.metaKey);
    },
    [childNode.id, context],
  );

  const handleOpenDetails = useCallback(() => {
    dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, 'open-content-overlay', {
      nodeId: childNode.id,
      node: childNode,
      parentNodeId: parentNode.id,
      canvasStore: useCanvasStore.getState(),
      historyStore: useHistoryStore.getState(),
      clipboardStore: useClipboardStore.getState(),
      postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
    });
  }, [childNode, parentNode.id]);

  const handleAction = useCallback(
    (actionId: CardActionDescriptor['id']) => {
      dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, actionId, {
        nodeId: childNode.id,
        node: childNode,
        parentNodeId: parentNode.id,
        canvasStore: useCanvasStore.getState(),
        historyStore: useHistoryStore.getState(),
        clipboardStore: useClipboardStore.getState(),
        postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
      });
    },
    [childNode, parentNode.id],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={getGalleryChildCardClassName(isSelected, isPlaybackActive)}
      {...getKeyboardBoundaryMetadata({
        scope: 'container',
        ownerId: `gallery-child:${childNode.id}`,
        ownedKeys: ['Enter', 'Space'],
      })}
      style={style}
      data-gallery-child-card-id={childNode.id}
      data-gallery-child-card-layout="visual-grid"
      data-gallery-child-card-height={readStyleHeight(style)}
      data-playback-active={isPlaybackActive ? 'true' : undefined}
      aria-pressed={isSelected}
      onClick={handleSelect}
      onDoubleClick={handleOpenDetails}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          context.onSelectNode?.(childNode.id, event.shiftKey || event.metaKey);
        }
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
        <CardPreviewSlot
          source={previewSource}
          title={title}
          variant="gallery"
          interactionRenderMode={context.interactionRenderMode}
        />
        <div className="absolute left-2 top-2 rounded border border-black/10 bg-white/90 px-1.5 py-0.5 text-[10px] leading-none text-gray-600 shadow-sm">
          {resolveGalleryCellOrdinal(parentNode, childNode, index)}
        </div>
      </div>
      <div className="flex min-h-[66px] flex-col gap-1 border-t border-gray-200 bg-white px-2 py-2 text-left">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1 truncate text-[12px] font-medium text-gray-900">
            {title}
          </div>
          {badges.slice(0, 1).map((badge) => (
            <span key={badge.label} className={getChildBadgeClassName(badge.tone)}>
              {badge.label}
            </span>
          ))}
        </div>
        <div className="line-clamp-2 min-h-[30px] text-[11px] leading-4 text-gray-600">
          {subtitle}
        </div>
        <div className="mt-auto flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] leading-none text-gray-600 hover:border-blue-300 hover:text-blue-600"
            title={t('gallery.openItemDetail')}
            onClick={(event) => {
              event.stopPropagation();
              handleOpenDetails();
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {t('scene.openShotDetailShort')}
          </button>
          {visibleActions
            .filter((action) => action.id !== 'open-content-overlay')
            .slice(0, 2)
            .map((action) => (
              <button
                key={action.id}
                type="button"
                className={getChildActionClassName(action)}
                title={resolveChildActionTitle(action)}
                onClick={(event) => {
                  event.stopPropagation();
                  handleAction(action.id);
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                {resolveChildActionLabel(action)}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

function SceneShotRail({
  parentNode,
  childNodes,
  context,
  slotLayout,
}: {
  parentNode: CanvasNode;
  childNodes: readonly CanvasNode[];
  context: ContainerRendererProps['context'];
  slotLayout: ChildSlotLayout;
}): React.ReactNode {
  const shotNodes = childNodes.filter((child) => child.type === 'shot');

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2 px-2 text-[11px] text-gray-500">
        <span className="truncate font-medium">{t('scene.shotRail')}</span>
        <span className="flex-shrink-0">
          {t('scene.shotCountCompact', { count: shotNodes.length })}
        </span>
      </div>
      <div
        className="relative min-w-0 overflow-x-auto overflow-y-hidden px-2 pb-2 pt-1"
        data-scene-shot-rail="true"
        aria-label={t('scene.shotRail')}
      >
        <div className="pointer-events-none absolute left-2 right-2 top-6 h-px bg-gray-200" />
        <div className="relative flex min-w-max flex-nowrap items-start gap-2">
          {childNodes.map((childNode, index) => (
            <SceneShotRailCard
              key={childNode.id}
              parentNode={parentNode}
              childNode={childNode}
              index={index}
              context={context}
              style={slotLayout.cardStyle}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SceneShotRailCard({
  parentNode,
  childNode,
  index,
  context,
  style,
}: {
  parentNode: CanvasNode;
  childNode: CanvasNode;
  index: number;
  context: ContainerRendererProps['context'];
  style?: React.CSSProperties;
}): React.ReactNode {
  const policy = getNodeCardPolicy(NODE_CARD_POLICY_REGISTRY, childNode);
  const previewSource = policy.resolvePreviewSource(childNode);
  const title = policy.resolveTitle(childNode, parentNode);
  const subtitle =
    policy.resolveSubtitle?.(childNode) ?? readString(childNode.data, 'visualDescription');
  const badges = policy.resolveBadges?.(childNode) ?? [];
  const actions = policy.resolveActions?.(childNode, parentNode) ?? [];
  const visibleActions = actions.filter((action) =>
    evaluateActionCondition(action.enabledWhen, {
      node: childNode,
      parentNode,
      selection: { nodeIds: context.selectedNodeIds },
      previewSource,
    }),
  );
  const isSelected = context.selectedNodeIds.includes(childNode.id);
  const isPlaybackActive = useCanvasStore((state) => state.activePlayingNodeId === childNode.id);
  const duration = readNumber(childNode.data, 'duration');

  const handleSelect = useCallback(
    (event: React.MouseEvent) => {
      context.onSelectNode?.(childNode.id, event.shiftKey || event.metaKey);
    },
    [childNode.id, context],
  );

  const handleOpenDetails = useCallback(() => {
    dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, 'open-content-overlay', {
      nodeId: childNode.id,
      node: childNode,
      parentNodeId: parentNode.id,
      canvasStore: useCanvasStore.getState(),
      historyStore: useHistoryStore.getState(),
      clipboardStore: useClipboardStore.getState(),
      postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
    });
  }, [childNode, parentNode.id]);

  const handleAction = useCallback(
    (actionId: CardActionDescriptor['id']) => {
      dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, actionId, {
        nodeId: childNode.id,
        node: childNode,
        parentNodeId: parentNode.id,
        canvasStore: useCanvasStore.getState(),
        historyStore: useHistoryStore.getState(),
        clipboardStore: useClipboardStore.getState(),
        postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
      });
    },
    [childNode, parentNode.id],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={getSceneShotRailCardClassName(isSelected, isPlaybackActive)}
      {...getKeyboardBoundaryMetadata({
        scope: 'container',
        ownerId: `scene-shot:${childNode.id}`,
        ownedKeys: ['Enter', 'Space'],
      })}
      style={style}
      data-scene-shot-card-id={childNode.id}
      data-scene-shot-card-layout="rail"
      data-scene-shot-card-height={readStyleHeight(style)}
      data-playback-active={isPlaybackActive ? 'true' : undefined}
      aria-pressed={isSelected}
      onClick={handleSelect}
      onDoubleClick={handleOpenDetails}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          context.onSelectNode?.(childNode.id, event.shiftKey || event.metaKey);
        }
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex min-w-0 items-center gap-1.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-medium leading-none text-white">
          {index + 1}
        </span>
        <span className="truncate text-[11px] font-medium text-gray-900">{title}</span>
        {badges[0] ? (
          <span className={getChildBadgeClassName(badges[0].tone)}>{badges[0].label}</span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 gap-2 px-2 py-2">
        <div className="w-[96px] flex-shrink-0">
          <CardPreviewSlot
            source={previewSource}
            title={title}
            variant="summary-large"
            interactionRenderMode={context.interactionRenderMode}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col text-left">
          <div className="line-clamp-3 min-h-[44px] text-[10px] leading-4 text-gray-600">
            {subtitle || t('scene.shotVisualFallback')}
          </div>
          {duration !== undefined ? (
            <div className="mt-1 text-[10px] leading-none text-gray-400">
              {t('scene.shotDuration', { seconds: duration })}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-1 border-t border-gray-100 px-2 py-1.5">
        <button
          type="button"
          className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] leading-none text-gray-600 hover:border-blue-300 hover:text-blue-600"
          title={t('scene.openShotDetail')}
          onClick={(event) => {
            event.stopPropagation();
            handleOpenDetails();
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {t('scene.openShotDetailShort')}
        </button>
        {visibleActions
          .filter((action) => action.id !== 'open-content-overlay')
          .slice(0, 2)
          .map((action) => (
            <button
              key={action.id}
              type="button"
              className={getChildActionClassName(action)}
              title={resolveChildActionTitle(action)}
              onClick={(event) => {
                event.stopPropagation();
                handleAction(action.id);
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {resolveChildActionLabel(action)}
            </button>
          ))}
      </div>
    </div>
  );
}

function ChildNodeDetailCard({
  parentNode,
  childNode,
  context,
  variant,
  style,
}: {
  parentNode: CanvasNode;
  childNode: CanvasNode;
  context: ContainerRendererProps['context'];
  variant: NodeCardVariant;
  style?: React.CSSProperties;
}): React.ReactNode {
  const policy = getNodeCardPolicy(NODE_CARD_POLICY_REGISTRY, childNode);
  const previewSource = policy.resolvePreviewSource(childNode);
  const title = policy.resolveTitle(childNode, parentNode);
  const subtitle = policy.resolveSubtitle?.(childNode);
  const badges = policy.resolveBadges?.(childNode) ?? [];
  const actions = policy.resolveActions?.(childNode, parentNode) ?? [];
  const fields = resolveInlineEditableFields(childNode);
  const hasPreview = shouldRenderCardPreview(previewSource, fields.length);
  const isPlaybackActive = useCanvasStore((state) => state.activePlayingNodeId === childNode.id);

  const handleSelect = useCallback(
    (event: React.MouseEvent) => {
      context.onSelectNode?.(childNode.id, event.shiftKey || event.metaKey);
    },
    [childNode.id, context],
  );

  const handleAction = useCallback(
    (actionId: CardActionDescriptor['id']) => {
      dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, actionId, {
        nodeId: childNode.id,
        node: childNode,
        parentNodeId: parentNode.id,
        canvasStore: useCanvasStore.getState(),
        historyStore: useHistoryStore.getState(),
        clipboardStore: useClipboardStore.getState(),
        postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
      });
    },
    [childNode, parentNode.id],
  );

  return (
    <div
      className={getChildDetailCardClassName(variant, isPlaybackActive)}
      style={style}
      data-child-card-id={childNode.id}
      data-child-card-layout="detail"
      data-child-card-variant={variant}
      data-child-card-height={readStyleHeight(style)}
      data-playback-active={isPlaybackActive ? 'true' : undefined}
      onClick={handleSelect}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <ChildCardHeader
        node={childNode}
        parentNode={parentNode}
        title={title}
        subtitle={subtitle}
        badges={badges}
        actions={actions}
        previewSource={previewSource}
        selection={{ nodeIds: context.selectedNodeIds }}
        onAction={handleAction}
      />
      {hasPreview ? (
        <div className="border-b border-[var(--node-border)] bg-white/70">
          <CardPreviewSlot
            source={previewSource}
            title={title}
            variant={variant === 'row' ? 'compact' : variant}
            interactionRenderMode={context.interactionRenderMode}
          />
        </div>
      ) : null}
      <div
        className="min-h-0 bg-white/80"
        data-child-detail-id={childNode.id}
        onClick={(event) => event.stopPropagation()}
      >
        <InlineChildFields childNode={childNode} context={context} fields={fields} />
      </div>
    </div>
  );
}

function ChildCardHeader({
  node,
  parentNode,
  title,
  subtitle,
  badges,
  actions,
  previewSource,
  selection,
  onAction,
}: {
  node: CanvasNode;
  parentNode: CanvasNode;
  title: string;
  subtitle?: string;
  badges: readonly CardBadge[];
  actions: readonly CardActionDescriptor[];
  previewSource: CardPreviewSource;
  selection: { nodeIds: readonly string[] };
  onAction: (actionId: CardActionDescriptor['id']) => void;
}): React.ReactNode {
  const enabledActions = actions.filter((action) =>
    evaluateActionCondition(action.enabledWhen, { node, parentNode, selection, previewSource }),
  );

  return (
    <div
      className="flex min-w-0 items-center gap-2 border-b border-[var(--node-border)] bg-white px-2 py-1.5"
      data-child-card-header-id={node.id}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-gray-900">{title}</div>
        {subtitle ? (
          <div className="truncate text-[10px] leading-4 text-gray-500">{subtitle}</div>
        ) : null}
      </div>
      {badges.slice(0, 2).map((badge) => (
        <span key={badge.label} className={getChildBadgeClassName(badge.tone)}>
          {badge.label}
        </span>
      ))}
      <div className="flex flex-shrink-0 items-center gap-1">
        {enabledActions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={getChildActionClassName(action)}
            title={resolveChildActionTitle(action)}
            onClick={(event) => {
              event.stopPropagation();
              onAction(action.id);
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {resolveChildActionLabel(action)}
          </button>
        ))}
      </div>
    </div>
  );
}

function InlineChildFields({
  childNode,
  context,
  fields,
}: {
  childNode: CanvasNode;
  context: ContainerRendererProps['context'];
  fields: readonly InlineEditableField[];
}): React.ReactNode {
  if (fields.length === 0) {
    return (
      <div className="px-2 py-1 text-xs text-[var(--node-fg-secondary)]">
        {childNode.preview?.subtitle ?? childNode.preview?.title ?? childNode.type}
      </div>
    );
  }

  return (
    <div className="grid min-h-0 grid-cols-2 gap-2 p-2">
      {fields.map((field) => {
        const value = readChildFieldValue(childNode, field.key);
        const handleChange = (nextValue: string) => {
          context.onUpdateNodeData?.(childNode.id, {
            ...(childNode.data as Record<string, unknown>),
            [field.key]: field.kind === 'number' ? Number(nextValue) : nextValue,
          });
        };

        return (
          <label key={field.key} className={getInlineFieldClassName(field)}>
            <span className="text-[11px] text-gray-500">{field.label}</span>
            {field.kind === 'textarea' ? (
              <textarea
                className={INLINE_TEXTAREA_CONTROL_CLASS}
                value={value}
                {...getKeyboardBoundaryMetadata({
                  scope: 'inline-editor',
                  ownerId: `container-field:${childNode.id}:${field.key}`,
                  ownedKeys: INLINE_TEXT_OWNED_KEYS,
                })}
                onMouseDown={(event) => event.stopPropagation()}
                onChange={(event) => handleChange(event.target.value)}
              />
            ) : (
              <input
                type={field.kind === 'number' ? 'number' : 'text'}
                className={INLINE_FORM_CONTROL_CLASS}
                value={value}
                {...getKeyboardBoundaryMetadata({
                  scope: 'inline-editor',
                  ownerId: `container-field:${childNode.id}:${field.key}`,
                  ownedKeys: INLINE_TEXT_OWNED_KEYS,
                })}
                onMouseDown={(event) => event.stopPropagation()}
                onChange={(event) => handleChange(event.target.value)}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

function shouldRenderCardPreview(
  previewSource: CardPreviewSource,
  editableFieldCount: number,
): boolean {
  if (previewSource.renderForm === 'none') {
    return false;
  }
  if (previewSource.renderForm === 'text' && editableFieldCount > 0) {
    return false;
  }
  return true;
}

function getChildDetailCardClassName(variant: NodeCardVariant, isPlaybackActive = false): string {
  const base =
    'group/child-card min-w-0 overflow-hidden rounded border border-[var(--node-border)] bg-white text-left shadow-sm';
  const active = isPlaybackActive ? ' ring-2 ring-[var(--node-selected)] ring-offset-2' : '';
  if (variant === 'row') {
    return `${base}${active} flex flex-col`;
  }
  return `${base}${active} flex min-h-0 flex-col`;
}

function getSceneShotRailCardClassName(isSelected: boolean, isPlaybackActive = false): string {
  const base =
    'flex w-[260px] flex-shrink-0 cursor-pointer flex-col overflow-hidden rounded border bg-white text-left shadow-sm outline-none transition-colors focus:border-[var(--node-selected)] focus:ring-1 focus:ring-[var(--node-selected)]';
  return isSelected || isPlaybackActive
    ? `${base} border-[var(--node-selected)] ring-1 ring-[var(--node-selected)]`
    : `${base} border-gray-200 hover:border-blue-300`;
}

function getGroupSummaryCardClassName(
  variant: NodeCardVariant,
  isSelected: boolean,
  isPlaybackActive = false,
): string {
  const sizeClass = variant === 'row' ? 'min-h-[132px] w-full' : 'min-h-[156px] w-full';
  const base = `flex ${sizeClass} min-w-0 cursor-pointer flex-col overflow-hidden rounded border bg-white text-left shadow-sm outline-none transition-colors focus:border-[var(--node-selected)] focus:ring-1 focus:ring-[var(--node-selected)]`;
  return isSelected || isPlaybackActive
    ? `${base} border-[var(--node-selected)] ring-1 ring-[var(--node-selected)]`
    : `${base} border-gray-200 hover:border-blue-300`;
}

function getGalleryChildCardClassName(isSelected: boolean, isPlaybackActive = false): string {
  const base =
    'flex min-w-0 cursor-pointer flex-col overflow-hidden rounded border bg-white text-left shadow-sm outline-none transition-colors focus:border-[var(--node-selected)] focus:ring-1 focus:ring-[var(--node-selected)]';
  return isSelected || isPlaybackActive
    ? `${base} border-[var(--node-selected)] ring-1 ring-[var(--node-selected)]`
    : `${base} border-gray-200 hover:border-blue-300`;
}

function getSummaryPreviewWrapperClassName(variant: NodeCardVariant): string {
  if (variant === 'row') {
    return 'w-[96px] flex-shrink-0';
  }
  return 'w-[112px] flex-shrink-0';
}

function getChildSlotFrameClassName(presentation: ChildSlotPresentation): string {
  if (presentation === 'scene-shot-rail') {
    return 'flex min-h-0 min-w-0 flex-shrink-0 flex-col gap-1.5';
  }
  if (presentation === 'group-summary' || presentation === 'gallery-grid') {
    return 'flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-1.5 overflow-auto';
  }
  return 'flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-1.5';
}

type ChildSlotPresentation = 'scene-shot-rail' | 'group-summary' | 'gallery-grid' | 'detail-cards';

function resolveChildSlotPresentation(
  node: CanvasNode,
  slot: ChildNodeSlot,
): ChildSlotPresentation {
  if (node.type === 'scene' && (slot.summaryRole === 'node-summary' || slot.layout === 'grid')) {
    return 'scene-shot-rail';
  }
  if (node.type === 'gallery' && slot.layout === 'gallery') {
    return 'gallery-grid';
  }
  if (node.type === 'group' && (slot.summaryRole === 'node-summary' || slot.layout === 'grid')) {
    return 'group-summary';
  }
  return 'detail-cards';
}

function getInlineFieldClassName(field: InlineEditableField): string {
  const base = 'flex min-h-0 flex-col gap-1 text-xs';
  if (field.kind === 'textarea') {
    return `${base} col-span-2`;
  }
  return base;
}

function getChildBadgeClassName(tone: CardBadge['tone']): string {
  switch (tone) {
    case 'success':
      return 'flex-shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] leading-none text-emerald-700';
    case 'warning':
      return 'flex-shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] leading-none text-amber-700';
    case 'error':
      return 'flex-shrink-0 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] leading-none text-red-700';
    case 'info':
      return 'flex-shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] leading-none text-blue-700';
    default:
      return 'flex-shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] leading-none text-gray-600';
  }
}

function getChildActionClassName(action: CardActionDescriptor): string {
  const base =
    'rounded border px-1.5 py-0.5 text-[10px] leading-none transition-colors hover:bg-gray-50';
  return action.danger
    ? `${base} border-red-200 text-red-600 hover:bg-red-50`
    : `${base} border-gray-200 text-gray-600`;
}

function resolveChildActionLabel(action: CardActionDescriptor): string {
  switch (action.id) {
    case 'remove':
      return t('action.removeShort');
    case 'generate':
      return t('action.generateShort');
    case 'open-media-preview':
    case 'open-content-overlay':
      return t('action.openShort');
    case 'duplicate':
      return t('action.duplicateShort');
    case 'edit':
      return t('action.editShort');
    case 'open-in-editor':
      return t('action.fileShort');
  }
}

function resolveChildActionTitle(action: CardActionDescriptor): string {
  return isI18nKey(action.label) ? t(action.label) : action.label;
}

function resolveChildSummaryText(childNode: CanvasNode, subtitle: string | undefined): string {
  if (subtitle) {
    return subtitle;
  }

  const data = childNode.data as Record<string, unknown>;
  const candidates = [
    data['content'],
    data['visualDescription'],
    data['characterAction'],
    data['assetPath'],
    data['runtimeAssetPath'],
    data['sceneTitle'],
    data['label'],
    data['title'],
    childNode.preview?.subtitle,
    childNode.preview?.title,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return truncateSummary(candidate);
    }
  }

  return t('group.childNoSummary');
}

function resolveGalleryChildSummary(
  parentNode: CanvasNode,
  childNode: CanvasNode,
  subtitle: string | undefined,
): string {
  const placement = readChildPlacementMetadata(parentNode, childNode.id);
  const prompt = readString(placement, 'prompt');
  if (prompt) {
    return truncateSummary(prompt);
  }
  return resolveChildSummaryText(childNode, subtitle);
}

function resolveGalleryChildBadges(
  parentNode: CanvasNode,
  childNode: CanvasNode,
  badges: readonly CardBadge[],
): readonly CardBadge[] {
  const status = readString(
    readChildPlacementMetadata(parentNode, childNode.id),
    'generationStatus',
  );
  if (!status) {
    return badges;
  }
  return [{ label: resolveCanvasStatusLabel(status), tone: badgeToneForStatus(status) }, ...badges];
}

function resolveGalleryCellOrdinal(
  parentNode: CanvasNode,
  childNode: CanvasNode,
  index: number,
): string {
  const order = readNumber(readChildPlacementMetadata(parentNode, childNode.id), 'order');
  return String((order ?? index) + 1);
}

function readChildPlacementMetadata(
  parentNode: CanvasNode,
  childNodeId: string,
): Record<string, unknown> {
  const metadata = parentNode.container?.childPlacements?.[childNodeId]?.metadata;
  return readRecordValue(metadata);
}

function badgeToneForStatus(status: string): CardBadge['tone'] {
  switch (status) {
    case 'done':
    case 'ready':
    case 'complete':
      return 'success';
    case 'generating':
    case 'pending':
    case 'idle':
      return 'warning';
    case 'error':
    case 'failed':
      return 'error';
    default:
      return 'neutral';
  }
}

function resolveNodeTypeLabel(node: CanvasNode): string {
  const key = node.type === 'scene' ? 'node.sceneGroup' : `node.${node.type}`;
  const label = t(key);
  return label === key ? node.type : label;
}

function truncateSummary(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 72 ? `${normalized.slice(0, 71)}...` : normalized;
}

function readStyleHeight(style: React.CSSProperties | undefined): string | undefined {
  return typeof style?.height === 'string' ? style.height : undefined;
}

function readRecordValue(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  return {};
}

function renderContentBlock(
  registry: BlockRendererRegistry,
  block: CanvasBlock,
  context: ContainerRendererProps['context'],
): React.ReactNode {
  if (!isSectionVisible(block.visibleWhen, context)) {
    return null;
  }

  return (
    <div key={block.id} data-content-block-id={block.id} className={getBlockFrameClassName(block)}>
      {renderCanvasBlock(registry, { ...context, block })}
    </div>
  );
}

function getBlockFrameClassName(block: CanvasBlock): string {
  if (isStretchBlock(block)) {
    return 'flex min-h-0 min-w-0 flex-1 basis-0 flex-col';
  }

  return 'min-w-0';
}

function shouldFillSection(
  section: ContainerRendererProps['section'],
  context: ContainerRendererProps['context'],
): boolean {
  if (context.depth === 0) {
    return true;
  }

  return (
    section.childSlots !== undefined ||
    section.sections?.some((childSection) => childSection.childSlots !== undefined) ||
    (section.blocks?.some(isStretchBlock) ?? false)
  );
}

function isStretchBlock(block: CanvasBlock): boolean {
  return block.kind === 'textarea' || block.kind === 'editable-text';
}

function resolveDefaultCollapsed(
  section: ContainerRendererProps['section'],
  context: ContainerRendererProps['context'],
): boolean {
  if (shouldExpandSectionBySurface(section, context.layout.surface)) {
    return false;
  }

  return section.defaultCollapsed ?? false;
}

function shouldExpandSectionBySurface(
  section: ContainerRendererProps['section'],
  surface: ContainerRendererProps['context']['layout']['surface'],
): boolean {
  const surfaces = section.metadata?.['defaultExpandedSurfaces'];
  return Array.isArray(surfaces) && surfaces.includes(surface);
}

function resolveLabel(label: string | undefined): string | undefined {
  if (!label) return label;
  if (isI18nKey(label)) return t(label);
  return label;
}

function isI18nKey(label: string): boolean {
  return (
    label.startsWith('preset.') ||
    label.startsWith('action.') ||
    label.startsWith('scene.') ||
    label.startsWith('group.') ||
    label.startsWith('gallery.')
  );
}

function resolveSlotChildIds(
  node: ContainerRendererProps['context']['node'],
  allNodes: readonly CanvasNode[],
  childIds?: string[],
): string[] {
  if (childIds) return childIds;

  return uniqueStrings([
    ...getContainerChildIds(node),
    ...allNodes
      .filter((candidate) => candidate.id !== node.id && getNodeParentId(candidate) === node.id)
      .map((candidate) => candidate.id),
  ]);
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

interface InlineEditableField {
  key: string;
  label: string;
  kind: 'input' | 'number' | 'textarea';
}

const INLINE_EDITABLE_FIELDS: Partial<Record<CanvasNode['type'], readonly InlineEditableField[]>> =
  {
    shot: [
      { key: 'shotNumber', label: 'preset.inlineField.shotNumber', kind: 'number' },
      { key: 'visualDescription', label: 'preset.inlineField.visualDescription', kind: 'textarea' },
      { key: 'characterAction', label: 'preset.inlineField.characterAction', kind: 'textarea' },
      { key: 'duration', label: 'preset.inlineField.duration', kind: 'number' },
    ],
    text: [{ key: 'content', label: 'preset.inlineField.text', kind: 'textarea' }],
    annotation: [{ key: 'content', label: 'preset.inlineField.note', kind: 'textarea' }],
    media: [
      { key: 'assetPath', label: 'preset.inlineField.asset', kind: 'input' },
      { key: 'mediaType', label: 'preset.inlineField.type', kind: 'input' },
    ],
    gallery: [{ key: 'characterName', label: 'preset.inlineField.character', kind: 'input' }],
  };

function resolveInlineEditableFields(node: CanvasNode): readonly InlineEditableField[] {
  const fields = INLINE_EDITABLE_FIELDS[node.type] ?? [];
  return fields.map((field) => ({
    ...field,
    label: resolveLabel(field.label) ?? field.label,
  }));
}

function readChildFieldValue(node: CanvasNode, key: string): string {
  const value = (node.data as Record<string, unknown>)[key];
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

interface ChildSlotLayout {
  className: string;
  style?: React.CSSProperties;
  cardVariant: NodeCardVariant;
  cardStyle?: React.CSSProperties;
  cardHeight: number;
  maxCardHeight: number;
}

function resolveChildSlotLayout(
  parentNode: CanvasNode,
  slot: ChildNodeSlot,
  layout: NodeContentLayoutContext,
  presentation: ChildSlotPresentation,
): ChildSlotLayout {
  const cardMetrics = resolveChildCardMetrics(layout, presentation);

  if (presentation === 'scene-shot-rail') {
    return {
      className: 'relative flex min-w-max flex-nowrap items-start gap-2',
      cardVariant: 'summary-large',
      cardStyle: createCardHeightStyle(cardMetrics),
      ...cardMetrics,
    };
  }

  if (presentation === 'group-summary') {
    const minColumnWidth = layout.width < 520 || layout.density === 'compact' ? 220 : 240;
    return {
      className:
        'grid min-h-0 min-w-0 auto-rows-fr gap-2 overflow-y-auto overflow-x-hidden px-2 pb-2',
      style: {
        gridTemplateColumns: `repeat(auto-fit, minmax(${minColumnWidth}px, 1fr))`,
      },
      cardVariant: layout.width < 520 || layout.density === 'compact' ? 'row' : 'summary-large',
      cardStyle: createCardHeightStyle(cardMetrics),
      ...cardMetrics,
    };
  }

  if (presentation === 'gallery-grid') {
    const columns = resolveGalleryColumnCount(parentNode, layout);
    const minColumnWidth = layout.width < 520 || layout.density === 'compact' ? 128 : 168;
    return {
      className:
        'grid min-h-0 min-w-0 auto-rows-fr gap-2 overflow-y-auto overflow-x-hidden px-2 pb-2',
      style: {
        gridTemplateColumns:
          layout.width < 520 || layout.density === 'compact'
            ? `repeat(auto-fit, minmax(${minColumnWidth}px, 1fr))`
            : `repeat(${columns}, minmax(${minColumnWidth}px, 1fr))`,
      },
      cardVariant: 'gallery',
      cardStyle: createCardHeightStyle(cardMetrics),
      ...cardMetrics,
    };
  }

  if (slot.layout === 'table') {
    return {
      className: 'grid min-h-0 min-w-0 gap-1.5 overflow-auto',
      style: {
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      },
      cardVariant: 'row',
      cardStyle: createCardHeightStyle(cardMetrics),
      ...cardMetrics,
    };
  }

  if (slot.layout === 'grid' || slot.layout === 'gallery') {
    if (layout.width < 520 || layout.density === 'compact') {
      return {
        className: 'flex min-h-0 min-w-0 flex-col gap-1.5 overflow-auto',
        cardVariant: 'row',
        cardStyle: createCardHeightStyle(cardMetrics),
        ...cardMetrics,
      };
    }

    return {
      className: 'grid min-h-0 min-w-0 gap-1.5 overflow-auto',
      style: {
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      },
      cardVariant: 'compact',
      cardStyle: createCardHeightStyle(cardMetrics),
      ...cardMetrics,
    };
  }

  return {
    className: 'flex min-h-0 min-w-0 flex-col gap-1 overflow-auto',
    cardVariant: 'summary',
    cardStyle: createCardHeightStyle(cardMetrics),
    ...cardMetrics,
  };
}

function resolveChildCardMetrics(
  layout: NodeContentLayoutContext,
  presentation: ChildSlotPresentation,
): { cardHeight: number; maxCardHeight: number } {
  const heightBudget = Math.max(
    0,
    layout.height - resolveContainerChromeHeight(layout, presentation),
  );
  const expanded = layout.surface === 'overlay' || layout.density === 'expanded';
  const minCardHeight =
    presentation === 'gallery-grid' ? 170 : presentation === 'scene-shot-rail' ? 150 : 148;
  const maxCardHeight =
    presentation === 'gallery-grid'
      ? expanded
        ? 300
        : 240
      : presentation === 'scene-shot-rail'
        ? expanded
          ? 240
          : 210
        : expanded
          ? 260
          : 220;
  const visibleRows = presentation === 'scene-shot-rail' ? 1 : expanded ? 2 : 1;
  const targetHeight = Math.floor(heightBudget / visibleRows);
  return {
    cardHeight: clampNumber(targetHeight, minCardHeight, maxCardHeight),
    maxCardHeight,
  };
}

function resolveContainerChromeHeight(
  layout: NodeContentLayoutContext,
  presentation: ChildSlotPresentation,
): number {
  const base = layout.surface === 'overlay' ? 172 : 126;
  return presentation === 'scene-shot-rail' ? base + 26 : base;
}

function createCardHeightStyle(metrics: {
  cardHeight: number;
  maxCardHeight: number;
}): React.CSSProperties {
  return {
    height: `${metrics.cardHeight}px`,
    maxHeight: `${metrics.maxCardHeight}px`,
  };
}

function resolveGalleryColumnCount(
  parentNode: CanvasNode,
  layout: NodeContentLayoutContext,
): number {
  const dataCols = readNumber(parentNode.data, 'cols');
  const layoutColumns = parentNode.container?.layout?.columns;
  const preferredColumns = dataCols ?? layoutColumns ?? 3;
  const maxByWidth = Math.max(1, Math.floor(layout.width / 180));
  return clampNumber(preferredColumns, 1, Math.max(1, Math.min(6, maxByWidth)));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function isSectionVisible(
  visibleWhen: string | undefined,
  context: ContainerRendererProps['context'],
): boolean {
  return (
    visibleWhen === undefined ||
    visibleWhen === 'always' ||
    (visibleWhen === 'selected' &&
      (context.isSelected || context.previewSurfaceKind === 'inline')) ||
    (visibleWhen === 'expanded' && context.isExpanded === true)
  );
}

function getSectionClassName(layout: string | undefined, fill: boolean): string {
  const fillClass = fill ? ' flex-1 basis-0' : '';
  switch (layout) {
    case 'row':
      return 'flex min-w-0 flex-row gap-2 overflow-x-auto overflow-y-hidden p-2';
    case 'grid':
    case 'gallery':
      return `grid min-h-0 min-w-0 grid-cols-2 gap-2 overflow-auto p-2${fillClass}`;
    case 'table':
      return `grid min-h-0 min-w-0 gap-1 overflow-auto p-2${fillClass}`;
    default:
      return `flex min-h-0 min-w-0 flex-col gap-2 p-2${fillClass}`;
  }
}
