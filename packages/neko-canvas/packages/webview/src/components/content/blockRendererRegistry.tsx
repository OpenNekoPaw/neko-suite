import React, { useEffect, useMemo, useState } from 'react';
import type { CanvasBlock, CanvasNode, FieldBinding } from '@neko/shared';
import { readNodeBinding } from './fieldBinding';
import type { BlockRendererContext, BlockRendererRegistry } from './types';
import { PreviewSurface, isSafeWebviewUrl, type PreviewSourceDescriptor } from '../../preview';
import { WebviewPreviewResolver } from '../../preview/previewResolver';
import { t } from '../../i18n';

export function createBuiltInBlockRendererRegistry(): BlockRendererRegistry {
  return {
    text: renderTextBlock,
    'editable-text': renderEditableTextBlock,
    input: renderInputBlock,
    textarea: renderTextareaBlock,
    number: renderNumberBlock,
    status: renderStatusBlock,
    'tag-list': renderTagListBlock,
    'asset-preview': renderAssetPreviewBlock,
    button: renderButtonBlock,
    list: renderListBlock,
    'key-value': renderKeyValueBlock,
    collection: renderCollectionBlock,
    projection: renderProjectionBlock,
    'child-node-slot': renderChildNodeSlotBlock,
    select: renderSelectBlock,
    custom: renderFallbackBlock,
  };
}

export function renderCanvasBlock(
  registry: BlockRendererRegistry,
  context: BlockRendererContext,
): React.ReactNode {
  const renderer = registry[context.block.kind] ?? renderFallbackBlock;
  return renderer(context);
}

function renderTextBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  return (
    <div className="text-xs leading-snug text-[var(--node-fg)] whitespace-pre-wrap break-words">
      {stringifyValue(value, resolveLabel(context.block.label))}
    </div>
  );
}

function renderEditableTextBlock(context: BlockRendererContext): React.ReactNode {
  return renderTextareaBlock(context);
}

function renderInputBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]">
      {context.block.label && <span>{resolveLabel(context.block.label)}</span>}
      <input
        className="min-w-0 rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]"
        value={toInputValue(value)}
        disabled={!isWritable(context.block.binding)}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => updateBinding(context, event.target.value)}
      />
    </label>
  );
}

function renderTextareaBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  return (
    <label className="flex min-h-0 flex-1 flex-col gap-1 text-xs text-[var(--node-fg-secondary)]">
      {context.block.label && <span>{resolveLabel(context.block.label)}</span>}
      <textarea
        className="min-h-[64px] resize-none rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]"
        value={toInputValue(value)}
        disabled={!isWritable(context.block.binding)}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => updateBinding(context, event.target.value)}
      />
    </label>
  );
}

function renderNumberBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]">
      {context.block.label && <span>{resolveLabel(context.block.label)}</span>}
      <input
        type="number"
        className="min-w-0 rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]"
        value={typeof value === 'number' ? value : Number(value) || 0}
        disabled={!isWritable(context.block.binding)}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => updateBinding(context, Number(event.target.value))}
      />
    </label>
  );
}

function renderSelectBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  const options = getStringArrayMetadata(context.block, 'options');
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]">
      {context.block.label && <span>{resolveLabel(context.block.label)}</span>}
      <select
        className="min-w-0 rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]"
        value={toInputValue(value)}
        disabled={!isWritable(context.block.binding)}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => updateBinding(context, event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function renderStatusBlock(context: BlockRendererContext): React.ReactNode {
  const value = stringifyValue(getBlockValue(context), resolveLabel(context.block.label));
  return (
    <span className="inline-flex max-w-full items-center self-start rounded border border-[var(--node-border)] px-2 py-0.5 text-xs text-[var(--node-fg-secondary)]">
      <span className="truncate">{value}</span>
    </span>
  );
}

function renderTagListBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  const tags = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="max-w-full truncate rounded border border-[var(--node-border)] px-1.5 py-0.5 text-xs text-[var(--node-fg-secondary)]"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function renderAssetPreviewBlock(context: BlockRendererContext): React.ReactNode {
  const value = getAssetPreviewValue(context);
  const source = createPreviewSource(context, value);
  const delegateActions = context.block.capabilities
    ?.filter((capability) => capability.kind === 'delegate')
    .flatMap((capability) => capability.actions);

  return <PreviewSurface source={source} delegateActions={delegateActions} />;
}

function renderButtonBlock(context: BlockRendererContext): React.ReactNode {
  const action = getStringMetadata(context.block, 'action');
  return (
    <button
      type="button"
      className="self-start rounded border border-[var(--node-border)] px-2 py-1 text-xs text-[var(--node-fg)] hover:border-[var(--node-selected)]"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (action) {
          context.onAction?.(action, { blockId: context.block.id });
        }
      }}
    >
      {resolveLabel(context.block.label) ?? context.block.id}
    </button>
  );
}

function renderListBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  const items = Array.isArray(value) ? value : [];
  return (
    <ul className="space-y-1 text-xs text-[var(--node-fg-secondary)]">
      {items.map((item, index) => (
        <li key={index} className="truncate">
          {stringifyValue(item, `Item ${index + 1}`)}
        </li>
      ))}
    </ul>
  );
}

function renderKeyValueBlock(context: BlockRendererContext): React.ReactNode {
  const value = getBlockValue(context);
  const entries = isRecord(value) ? Object.entries(value) : [];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
      {entries.map(([key, entryValue]) => (
        <React.Fragment key={key}>
          <dt className="text-[var(--node-fg-secondary)]">{key}</dt>
          <dd className="truncate text-[var(--node-fg)]">{stringifyValue(entryValue, '')}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function renderCollectionBlock(context: BlockRendererContext): React.ReactNode {
  if (!context.block.collection) {
    return renderFallbackBlock(context);
  }

  const { value } = readNodeBinding(context.node, context.block.collection.source);
  const items = Array.isArray(value) ? value : [];
  return (
    <div className={getCollectionClassName(context.block.collection.layout)}>
      {items.length === 0 ? (
        <span className="opacity-60">
          {resolveLabel(context.block.collection.emptyLabel) ?? 'Empty'}
        </span>
      ) : (
        items.map((item, index) => (
          <div
            key={getCollectionItemKey(item, index)}
            className="min-w-0 rounded border border-[var(--node-border)] bg-black/20 p-1.5"
          >
            {renderCollectionItem(context.block, item, index)}
          </div>
        ))
      )}
    </div>
  );
}

function renderProjectionBlock(context: BlockRendererContext): React.ReactNode {
  return (
    <div className="rounded border border-dashed border-[var(--node-border)] px-2 py-1 text-xs text-[var(--node-fg-secondary)]">
      {context.block.label ?? context.block.projection?.kind ?? 'Projection'}
    </div>
  );
}

export function ChildNodeCard({
  child,
  parentNode,
  onSelect,
  onRemove,
}: {
  child: CanvasNode;
  parentNode?: CanvasNode;
  onSelect?: (id: string, multi: boolean) => void;
  onRemove?: (childId: string) => void;
}): React.ReactNode {
  const preview = child.preview;
  const childMediaType = getChildMediaType(child);
  const inlineUrl = getChildInlinePreview(child);
  const resolvedUrl = useChildResolvedThumbnail(
    inlineUrl || childMediaType === 'audio' ? undefined : child,
  );
  const thumbnailUrl = inlineUrl ?? resolvedUrl;
  const displayTitle = resolveChildDisplayTitle(child, parentNode);

  return (
    <div className="group relative">
      <button
        type="button"
        className="flex w-full flex-col overflow-hidden rounded border border-[var(--node-border)] bg-black/10 text-left hover:border-[var(--node-selected)]"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => onSelect?.(child.id, event.shiftKey || event.metaKey)}
      >
        {childMediaType === 'audio' ? (
          <ChildAudioPreview />
        ) : childMediaType === 'video' ? (
          <ChildVideoPreview thumbnailUrl={thumbnailUrl} displayTitle={displayTitle} />
        ) : thumbnailUrl ? (
          <div
            className="flex w-full items-center justify-center overflow-hidden bg-black/20"
            style={{ aspectRatio: '3 / 2' }}
          >
            <img src={thumbnailUrl} alt={displayTitle} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div
            className="flex w-full items-center justify-center bg-black/20 text-base text-[var(--node-fg-secondary)]"
            style={{ aspectRatio: '3 / 2' }}
          >
            {getMediaTypeIcon(child)}
          </div>
        )}
        <div className="flex items-center justify-between gap-1 px-1.5 py-1">
          <span className="min-w-0 truncate text-[10px] text-[var(--node-fg)]">{displayTitle}</span>
          {preview?.badges?.[0] && (
            <span className="flex-shrink-0 rounded bg-black/20 px-1 text-[9px] text-[var(--node-fg-secondary)]">
              {preview.badges[0].label}
            </span>
          )}
        </div>
      </button>
      {onRemove && (
        <button
          type="button"
          className="absolute right-0.5 top-0.5 hidden items-center justify-center rounded-full bg-black/60 text-white group-hover:flex"
          style={{ width: 16, height: 16, fontSize: 10, lineHeight: 1 }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(child.id);
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function ChildAudioPreview(): React.ReactNode {
  return (
    <div className="flex w-full flex-col gap-1.5 bg-gradient-to-b from-black/30 to-black/10 px-2 py-2">
      <div className="flex items-center gap-1.5">
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/15">
          <span style={{ fontSize: 9 }}>&#9654;</span>
        </div>
        <div className="h-0.5 flex-1 rounded bg-white/20" />
      </div>
      <div className="flex h-4 items-end gap-px">
        {Array.from({ length: 16 }, (_, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-white/20"
            style={{ height: `${20 + Math.sin(i * 0.8) * 40 + Math.cos(i * 1.3) * 30}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function ChildVideoPreview({
  thumbnailUrl,
  displayTitle,
}: {
  thumbnailUrl: string | undefined;
  displayTitle: string;
}): React.ReactNode {
  return (
    <div className="relative w-full overflow-hidden bg-black/30" style={{ aspectRatio: '3 / 2' }}>
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt={displayTitle} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-lg text-[var(--node-fg-secondary)]">
          🎬
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50">
          <span className="text-white" style={{ fontSize: 11 }}>
            &#9654;
          </span>
        </div>
      </div>
    </div>
  );
}

function resolveChildDisplayTitle(child: CanvasNode, parentNode?: CanvasNode): string {
  const placementLabel = parentNode?.container?.childPlacements?.[child.id]?.metadata?.['label'];
  if (typeof placementLabel === 'string' && placementLabel) return placementLabel;

  if (child.preview?.title) {
    return child.type === 'media' ? extractFileBasename(child.preview.title) : child.preview.title;
  }

  if (child.type === 'media') {
    const assetPath = (child.data as Record<string, unknown>)['assetPath'];
    if (typeof assetPath === 'string' && assetPath) {
      return extractFileBasename(assetPath);
    }
    const mediaType = (child.data as Record<string, unknown>)['mediaType'];
    return mediaType === 'video'
      ? 'Empty video'
      : mediaType === 'audio'
        ? 'Empty audio'
        : 'Empty image';
  }

  if (child.type === 'shot') {
    const shotNumber = (child.data as Record<string, unknown>)['shotNumber'];
    return typeof shotNumber === 'number' ? `Shot ${shotNumber}` : 'Shot';
  }

  return child.type.charAt(0).toUpperCase() + child.type.slice(1);
}

function extractFileBasename(pathOrUrl: string): string {
  try {
    const url = new URL(pathOrUrl);
    return decodeURIComponent(url.pathname.split('/').pop() ?? pathOrUrl);
  } catch {
    return pathOrUrl.split('/').pop() ?? pathOrUrl;
  }
}

function getChildMediaType(child: CanvasNode): 'image' | 'video' | 'audio' | undefined {
  if (child.type === 'media') {
    const mediaType = (child.data as Record<string, unknown>)['mediaType'];
    if (mediaType === 'video') return 'video';
    if (mediaType === 'audio') return 'audio';
    return 'image';
  }
  return undefined;
}

function getMediaTypeIcon(child: CanvasNode): string {
  if (child.type === 'media') {
    const mediaType = (child.data as Record<string, unknown>)['mediaType'];
    if (mediaType === 'video') return '🎬';
    if (mediaType === 'audio') return '🎵';
    return '🖼';
  }
  if (child.type === 'shot') return '🎬';
  return '📄';
}

function getChildInlinePreview(child: CanvasNode): string | undefined {
  if (child.type === 'shot') {
    const data = child.data as Record<string, unknown>;
    const history = data['generationHistory'];
    if (Array.isArray(history)) {
      const selected = history.find(
        (candidate): candidate is { dataUrl?: string; selected?: boolean } =>
          isRecord(candidate) && candidate['selected'] === true,
      );
      if (selected && typeof selected['dataUrl'] === 'string') {
        return selected['dataUrl'];
      }
    }
    const generatedImage = data['generatedImage'];
    if (typeof generatedImage === 'string' && generatedImage) {
      return generatedImage;
    }
  }
  return undefined;
}

function getChildAssetPath(child: CanvasNode): string | undefined {
  if (child.type !== 'media') return undefined;
  const data = child.data as Record<string, unknown>;
  const thumbnailPath = data['thumbnailPath'];
  if (typeof thumbnailPath === 'string' && thumbnailPath) return thumbnailPath;
  const assetPath = data['assetPath'];
  if (typeof assetPath === 'string' && assetPath) return assetPath;
  return undefined;
}

function useChildResolvedThumbnail(child: CanvasNode | undefined): string | undefined {
  const assetPath = child ? getChildAssetPath(child) : undefined;
  const resolver = useMemo(
    () => (assetPath ? new WebviewPreviewResolver() : undefined),
    [assetPath],
  );
  const [url, setUrl] = useState<string | undefined>();

  useEffect(() => {
    if (!resolver || !child || !assetPath) {
      setUrl(undefined);
      return;
    }

    let cancelled = false;
    const mediaType =
      child.type === 'media'
        ? ((child.data as Record<string, unknown>)['mediaType'] as string | undefined)
        : undefined;

    const source: PreviewSourceDescriptor = {
      id: `child-thumb:${child.id}`,
      asset: { kind: 'asset-identity', path: assetPath, mediaType },
      role: 'image',
    };

    resolver.resolve({ source }).then((variant) => {
      if (!cancelled && variant.runtimeUrl) {
        setUrl(variant.runtimeUrl);
      }
    });

    return () => {
      cancelled = true;
      resolver.dispose();
    };
  }, [resolver, child, assetPath]);

  return url;
}

function renderChildNodeSlotBlock(context: BlockRendererContext): React.ReactNode {
  const slot = context.block.childSlot;
  const childIds = slot?.childIds ?? context.node.container?.childIds ?? [];
  return (
    <div className="rounded border border-dashed border-[var(--node-border)] p-1.5 text-xs text-[var(--node-fg-secondary)]">
      {childIds.length === 0 ? (
        <span>
          {resolveLabel(context.block.label) ?? resolveLabel(slot?.emptyLabel) ?? 'Children'}
        </span>
      ) : (
        <div className={slot?.layout === 'grid' ? 'grid grid-cols-3 gap-1.5' : 'space-y-1'}>
          {childIds.map((childId) => {
            const child = context.allNodes.find((candidate) => candidate.id === childId);
            return child ? (
              <ChildNodeCard
                key={child.id}
                child={child}
                parentNode={context.node}
                onSelect={context.onSelectNode}
                onRemove={
                  context.onRemoveChild
                    ? (id) => context.onRemoveChild?.(context.node.id, id)
                    : undefined
                }
              />
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

function renderFallbackBlock(context: BlockRendererContext): React.ReactNode {
  return (
    <div className="rounded border border-[var(--node-border)] px-2 py-1 text-xs text-[var(--node-fg-secondary)]">
      {resolveLabel(context.block.label) ?? context.block.kind}
    </div>
  );
}

function getBlockValue(context: BlockRendererContext): unknown {
  if (!context.block.binding) {
    return context.block.label ?? context.block.id;
  }

  return readNodeBinding(context.node, context.block.binding).value;
}

function getAssetPreviewValue(context: BlockRendererContext): unknown {
  const generationCapability = context.block.capabilities?.find(
    (capability) => capability.kind === 'generation-preview',
  );
  if (generationCapability) {
    const { value } = readNodeBinding(context.node, generationCapability.candidates);
    const selected = Array.isArray(value)
      ? value.find(
          (candidate): candidate is { id?: string; dataUrl?: string; selected?: boolean } =>
            isRecord(candidate) && candidate['selected'] === true,
        )
      : undefined;
    if (selected?.dataUrl) {
      return selected.dataUrl;
    }
  }

  return getBlockValue(context);
}

function createPreviewSource(
  context: BlockRendererContext,
  value: unknown,
): PreviewSourceDescriptor {
  const assetCapability = context.block.capabilities?.find(
    (capability) => capability.kind === 'asset-identity',
  );
  const previewCapability = context.block.capabilities?.find(
    (capability) => capability.kind === 'preview',
  );
  const path = typeof value === 'string' ? value : assetCapability?.path;
  const role = previewCapability?.preferredRole ?? previewCapability?.roles[0] ?? 'fallback';

  const variants = previewCapability?.variants ? [...previewCapability.variants] : [];
  if (typeof path === 'string' && isSafeWebviewUrl(path)) {
    variants.push({ id: 'inline', role, sourcePath: path });
  }

  return {
    id: `${context.node.id}:${context.block.id}`,
    asset: assetCapability
      ? { ...assetCapability, path: assetCapability.path ?? path, uri: assetCapability.uri ?? path }
      : { kind: 'asset-identity', path },
    role,
    variants: variants.length > 0 ? variants : undefined,
    title: resolveLabel(context.block.label),
  };
}

function updateBinding(context: BlockRendererContext, value: unknown): void {
  const binding = context.block.binding;
  if (!isWritable(binding)) {
    return;
  }

  context.onUpdateBinding?.({ path: binding.path, value });
}

function isWritable(binding: FieldBinding | undefined): binding is FieldBinding {
  return binding !== undefined && binding.mode !== 'read';
}

function toInputValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value);
}

function stringifyValue(value: unknown, fallback: string | undefined): string {
  if (value === undefined || value === null || value === '') {
    return fallback ?? '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyValue(item, '')).join(', ');
  }

  return JSON.stringify(value);
}

function getStringArrayMetadata(block: CanvasBlock, key: string): string[] {
  const value = block.metadata?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function getStringMetadata(block: CanvasBlock, key: string): string | undefined {
  const value = block.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function renderCollectionItem(block: CanvasBlock, item: unknown, index: number): React.ReactNode {
  const label =
    readCollectionItemPath(item, block.collection?.itemLabelPath) ?? `Item ${index + 1}`;
  const rawPreview = readCollectionItemPath(item, block.collection?.itemPreviewPath);
  const preview = rawPreview && isSafeWebviewUrl(rawPreview) ? rawPreview : undefined;
  const status = isRecord(item) ? stringifyValue(item['generationStatus'], undefined) : undefined;

  return (
    <div className="flex min-w-0 items-center gap-2">
      {preview ? (
        <img src={preview} alt={label} className="h-10 w-10 flex-shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-black/30 text-[10px]">
          {index + 1}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-xs text-[var(--node-fg)]">{label}</div>
        {status ? (
          <div className="truncate text-[10px] text-[var(--node-fg-secondary)]">{status}</div>
        ) : null}
      </div>
    </div>
  );
}

function readCollectionItemPath(item: unknown, path: string | undefined): string | undefined {
  if (!path || !isRecord(item)) {
    return undefined;
  }

  const key = path.startsWith('/') ? path.slice(1) : path;
  const value = item[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getCollectionClassName(layout: string | undefined): string {
  switch (layout) {
    case 'gallery':
    case 'grid':
      return 'grid grid-cols-2 gap-1 text-xs text-[var(--node-fg-secondary)]';
    default:
      return 'space-y-1 text-xs text-[var(--node-fg-secondary)]';
  }
}

function getCollectionItemKey(item: unknown, index: number): string {
  if (isRecord(item) && typeof item['id'] === 'string') {
    return item['id'];
  }

  return String(index);
}

function resolveLabel(label: string | undefined): string | undefined {
  if (!label) return label;
  if (label.startsWith('preset.')) return t(label);
  return label;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
