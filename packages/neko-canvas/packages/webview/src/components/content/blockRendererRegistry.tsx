import React from 'react';
import { type CanvasBlock, type FieldBinding } from '@neko/shared';
import { readNodeBinding } from './fieldBinding';
import type { BlockRendererContext, BlockRendererRegistry } from './types';
import { PreviewSurface, isSafeWebviewUrl, type PreviewSourceDescriptor } from '../../preview';
import { NodeCard } from './node-card';
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

  return (
    <PreviewSurface
      source={source}
      delegateActions={delegateActions}
      surfaceKind={context.previewSurfaceKind ?? 'inline'}
    />
  );
}

function renderButtonBlock(context: BlockRendererContext): React.ReactNode {
  return (
    <button
      type="button"
      className="self-start rounded border border-[var(--node-border)] px-2 py-1 text-xs text-[var(--node-fg)] hover:border-[var(--node-selected)]"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
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
              <NodeCard
                key={child.id}
                node={child}
                parentNode={context.node}
                selection={{ nodeIds: context.selectedNodeIds }}
                onSelect={context.onSelectNode}
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
    title: resolvePreviewSourceTitle(context, path),
    metadata: resolvePreviewSourceMetadata(context),
  };
}

function resolvePreviewSourceTitle(
  context: BlockRendererContext,
  path: string | undefined,
): string | undefined {
  if (context.node.type === 'project') {
    return (
      context.node.data.projectTitle || extractBasename(path) || resolveLabel(context.block.label)
    );
  }

  return resolveLabel(context.block.label);
}

function resolvePreviewSourceMetadata(
  context: BlockRendererContext,
): Record<string, unknown> | undefined {
  if (context.node.type === 'project') {
    return { projectType: context.node.data.projectType };
  }

  return undefined;
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
  return isI18nKey(label) ? t(label) : label;
}

function extractBasename(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try {
    const url = new URL(path);
    return decodeURIComponent(url.pathname.split('/').pop() ?? path);
  } catch {
    return path.split('/').pop() ?? path;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isI18nKey(label: string): boolean {
  return label.startsWith('preset.') || label.startsWith('preview.');
}
