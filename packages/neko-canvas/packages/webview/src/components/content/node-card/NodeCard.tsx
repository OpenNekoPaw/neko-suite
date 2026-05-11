import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CanvasNode } from '@neko/shared';
import type { RuntimePreviewVariant } from '../../../preview';
import { WebviewPreviewResolver } from '../../../preview/previewResolver';
import { useCanvasStore } from '../../../stores/canvasStore';
import { useClipboardStore } from '../../../stores/clipboardStore';
import { useHistoryStore } from '../../../stores/historyStore';
import { getGlobalVSCodeApi } from '../../../utils/vscode';
import { dispatchNodeCardAction, NODE_CARD_ACTION_DISPATCHER } from './actionDispatcher';
import { createBuiltInNodeCardPolicyRegistry, getNodeCardPolicy } from './policies';
import type {
  CardActionDescriptor,
  CardBadge,
  CardPreviewAspectRatio,
  CardPreviewSource,
  NodeCardActionId,
  NodeCardPolicyRegistry,
} from './types';
import {
  evaluateActionCondition,
  getStableSafeVariantUrl,
  hasPreviewDescriptorContent,
} from './utils';

const BUILT_IN_POLICY_REGISTRY = createBuiltInNodeCardPolicyRegistry();

export interface NodeCardProps {
  node: CanvasNode;
  parentNode?: CanvasNode;
  policyRegistry?: NodeCardPolicyRegistry;
  selection?: { nodeIds: readonly string[] };
  onSelect?: (id: string, multi: boolean) => void;
  onAction?: (nodeId: string, actionId: NodeCardActionId) => void;
}

export function NodeCard({
  node,
  parentNode,
  policyRegistry = BUILT_IN_POLICY_REGISTRY,
  selection = { nodeIds: [] },
  onSelect,
  onAction,
}: NodeCardProps): React.ReactNode {
  const policy = getNodeCardPolicy(policyRegistry, node);
  const previewSource = policy.resolvePreviewSource(node);
  const title = policy.resolveTitle(node, parentNode);
  const subtitle = policy.resolveSubtitle?.(node);
  const badges = policy.resolveBadges?.(node) ?? [];
  const actions = policy.resolveActions?.(node, parentNode) ?? [];

  const handleAction = useCallback(
    (actionId: NodeCardActionId) => {
      onAction?.(node.id, actionId);
      dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, actionId, {
        nodeId: node.id,
        node,
        parentNodeId: parentNode?.id,
        canvasStore: useCanvasStore.getState(),
        historyStore: useHistoryStore.getState(),
        clipboardStore: useClipboardStore.getState(),
        postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
      });
    },
    [node, onAction, parentNode?.id],
  );

  return (
    <div className="group relative" data-node-card-id={node.id}>
      <button
        type="button"
        className="flex w-full flex-col overflow-hidden rounded border border-[var(--node-border)] bg-black/10 text-left hover:border-[var(--node-selected)]"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => onSelect?.(node.id, event.shiftKey || event.metaKey)}
      >
        <CardPreviewSlot source={previewSource} title={title} />
        <CardMetadataSlot title={title} subtitle={subtitle} badges={badges} />
      </button>
      <CardActionSlot
        actions={actions}
        node={node}
        parentNode={parentNode}
        selection={selection}
        previewSource={previewSource}
        onAction={handleAction}
      />
    </div>
  );
}

export function CardPreviewSlot({
  source,
  title,
}: {
  source: CardPreviewSource;
  title: string;
}): React.ReactNode {
  const previewDescriptor =
    source.renderForm === 'asset-thumbnail' || source.renderForm === 'media-poster'
      ? source.source
      : undefined;
  const stableUrl = useMemo(
    () => (previewDescriptor ? getStableSafeVariantUrl(previewDescriptor) : undefined),
    [previewDescriptor],
  );
  const resolvedVariant = useResolvedPreview(
    stableUrl || !previewDescriptor || !hasPreviewDescriptorContent(previewDescriptor)
      ? undefined
      : previewDescriptor,
  );
  const displayUrl = stableUrl ?? resolvedVariant?.runtimeUrl;

  switch (source.renderForm) {
    case 'asset-thumbnail':
      return displayUrl ? (
        <PreviewImage url={displayUrl} title={title} aspectRatio={source.aspectRatio} />
      ) : (
        <IconPlaceholder icon="IMG" aspectRatio={source.aspectRatio} />
      );
    case 'media-poster':
      return (
        <div
          className="relative w-full overflow-hidden bg-black/30"
          style={aspectRatioStyle(source.aspectRatio)}
        >
          {displayUrl ? (
            <img src={displayUrl} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-[var(--node-fg-secondary)]">
              VID
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-[11px] text-white">
              Play
            </div>
          </div>
        </div>
      );
    case 'waveform':
      return <AudioWaveformPreview />;
    case 'text':
      return <TextExcerptPreview text={source.textExcerpt} />;
    case 'icon':
      return <IconPlaceholder icon={source.icon} aspectRatio="3/2" />;
    case 'none':
      return null;
  }
}

function CardMetadataSlot({
  title,
  subtitle,
  badges,
}: {
  title: string;
  subtitle?: string;
  badges: readonly CardBadge[];
}): React.ReactNode {
  return (
    <div className="flex min-w-0 items-center justify-between gap-1 px-1.5 py-1">
      <div className="min-w-0">
        <div className="truncate text-[10px] text-[var(--node-fg)]">{title}</div>
        {subtitle ? (
          <div className="truncate text-[9px] text-[var(--node-fg-secondary)]">{subtitle}</div>
        ) : null}
      </div>
      {badges[0] ? (
        <span className={getBadgeClassName(badges[0].tone)}>{badges[0].label}</span>
      ) : null}
    </div>
  );
}

function CardActionSlot({
  actions,
  node,
  parentNode,
  selection,
  previewSource,
  onAction,
}: {
  actions: readonly CardActionDescriptor[];
  node: CanvasNode;
  parentNode?: CanvasNode;
  selection: { nodeIds: readonly string[] };
  previewSource: CardPreviewSource;
  onAction: (actionId: NodeCardActionId) => void;
}): React.ReactNode {
  const enabledActions = actions.filter((action) =>
    evaluateActionCondition(action.enabledWhen, { node, parentNode, selection, previewSource }),
  );
  const topRightActions = enabledActions.filter((action) => action.position === 'top-right');
  const overlayActions = enabledActions.filter((action) => action.position === 'overlay-center');
  const bottomActions = enabledActions.filter((action) => action.position === 'bottom');

  return (
    <>
      {topRightActions.map((action) => (
        <ActionButton
          key={action.id}
          action={action}
          className="absolute right-0.5 top-0.5"
          onAction={onAction}
        />
      ))}
      {overlayActions.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center group-hover:flex">
          {overlayActions.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              className="pointer-events-auto"
              onAction={onAction}
            />
          ))}
        </div>
      ) : null}
      {bottomActions.length > 0 ? (
        <div className="absolute bottom-1 left-1 right-1 hidden gap-1 group-hover:flex">
          {bottomActions.map((action) => (
            <ActionButton key={action.id} action={action} className="flex-1" onAction={onAction} />
          ))}
        </div>
      ) : null}
    </>
  );
}

function ActionButton({
  action,
  className,
  onAction,
}: {
  action: CardActionDescriptor;
  className?: string;
  onAction: (actionId: NodeCardActionId) => void;
}): React.ReactNode {
  return (
    <button
      type="button"
      className={`${className ?? ''} ${getActionClassName(action)}`}
      title={action.label}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onAction(action.id);
      }}
    >
      {resolveActionLabel(action)}
    </button>
  );
}

function PreviewImage({
  url,
  title,
  aspectRatio,
}: {
  url: string;
  title: string;
  aspectRatio: CardPreviewAspectRatio;
}): React.ReactNode {
  return (
    <div
      className="flex w-full items-center justify-center overflow-hidden bg-black/20"
      style={aspectRatioStyle(aspectRatio)}
    >
      <img src={url} alt={title} className="h-full w-full object-cover" />
    </div>
  );
}

function AudioWaveformPreview(): React.ReactNode {
  return (
    <div className="flex w-full flex-col gap-1.5 bg-gradient-to-b from-black/30 to-black/10 px-2 py-2">
      <div className="flex items-center gap-1.5">
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-[9px]">
          Play
        </div>
        <div className="h-0.5 flex-1 rounded bg-white/20" />
      </div>
      <div className="flex h-4 items-end gap-px">
        {Array.from({ length: 16 }, (_, index) => (
          <div
            key={index}
            className="flex-1 rounded-sm bg-white/20"
            style={{ height: `${20 + Math.sin(index * 0.8) * 40 + Math.cos(index * 1.3) * 30}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function TextExcerptPreview({ text }: { text: string }): React.ReactNode {
  return (
    <div
      className="flex w-full items-start overflow-hidden bg-black/20 px-2 py-1.5 text-[10px] leading-snug text-[var(--node-fg-secondary)]"
      style={aspectRatioStyle('3/2')}
    >
      <span className="line-clamp-3 break-words">{text || 'Text'}</span>
    </div>
  );
}

function IconPlaceholder({
  icon,
  aspectRatio,
}: {
  icon: string;
  aspectRatio: CardPreviewAspectRatio;
}): React.ReactNode {
  return (
    <div
      className="flex w-full items-center justify-center bg-black/20 text-base text-[var(--node-fg-secondary)]"
      style={aspectRatioStyle(aspectRatio)}
    >
      {icon}
    </div>
  );
}

function useResolvedPreview(
  source: Parameters<WebviewPreviewResolver['resolve']>[0]['source'] | undefined,
): RuntimePreviewVariant | undefined {
  const resolver = useMemo(() => new WebviewPreviewResolver(), []);
  const [variant, setVariant] = useState<RuntimePreviewVariant | undefined>();

  useEffect(() => {
    if (!source) {
      setVariant(undefined);
      return;
    }

    let cancelled = false;
    resolver.resolve({ source }).then((resolved) => {
      if (!cancelled) {
        setVariant(resolved);
      }
    });

    return () => {
      cancelled = true;
      resolver.dispose();
    };
  }, [resolver, source]);

  return variant;
}

function aspectRatioStyle(aspectRatio: CardPreviewAspectRatio): React.CSSProperties {
  return { aspectRatio: aspectRatio.replace('/', ' / ') };
}

function getBadgeClassName(tone: CardBadge['tone']): string {
  switch (tone) {
    case 'success':
      return 'flex-shrink-0 rounded bg-emerald-900/40 px-1 text-[9px] text-emerald-300';
    case 'warning':
      return 'flex-shrink-0 rounded bg-amber-900/40 px-1 text-[9px] text-amber-300';
    case 'error':
      return 'flex-shrink-0 rounded bg-red-900/40 px-1 text-[9px] text-red-300';
    case 'info':
      return 'flex-shrink-0 rounded bg-blue-900/40 px-1 text-[9px] text-blue-300';
    default:
      return 'flex-shrink-0 rounded bg-black/20 px-1 text-[9px] text-[var(--node-fg-secondary)]';
  }
}

function getActionClassName(action: CardActionDescriptor): string {
  const base =
    'hidden min-h-4 items-center justify-center rounded bg-black/60 px-1 text-[9px] text-white group-hover:flex';
  return action.danger ? `${base} hover:bg-red-700` : `${base} hover:bg-black/80`;
}

function resolveActionLabel(action: CardActionDescriptor): string {
  switch (action.id) {
    case 'remove':
      return 'x';
    case 'open-media-preview':
    case 'open-content-overlay':
      return 'Open';
    case 'generate':
      return 'Gen';
    case 'duplicate':
      return 'Dup';
    case 'edit':
      return 'Edit';
    case 'open-in-editor':
      return 'File';
  }
}
