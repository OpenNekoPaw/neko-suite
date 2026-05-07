import type { RichContentProps, RichContentRendererEntry } from '../types';
import type {
  AssetGalleryRichData,
  ComparisonGridRichData,
  CompositeMediaDiagnostic,
  CompositeMediaType,
  ResolvedCompositeMedia,
  StoryboardTableRichData,
} from '@/presenters/composite-content-presenter';
import { VSCodeMessages } from '@/messages';
import { SendToMenu } from '@/components/ChatView/SendToMenu';
import {
  projectStoryboardTableAssetBatch,
  projectStoryboardTableCutTimelinePayload,
  projectStoryboardTableTransferPayload,
} from '@/presenters/storyboard-transfer-presenter';

function isStoryboardTableRichData(data: unknown): data is StoryboardTableRichData {
  return isCompositeData(data, 'storyboard-table');
}

function isComparisonGridRichData(data: unknown): data is ComparisonGridRichData {
  return isCompositeData(data, 'comparison');
}

function isAssetGalleryRichData(data: unknown): data is AssetGalleryRichData {
  return isCompositeData(data, 'gallery') || isCompositeData(data, 'report');
}

function StoryboardTableRendererComponent({
  data,
  className,
}: RichContentProps<StoryboardTableRichData>) {
  const canvasPayload = projectStoryboardTableTransferPayload(data);
  const cutPayload = projectStoryboardTableCutTimelinePayload(data);
  const assetBatchPayload = projectStoryboardTableAssetBatch(data);
  const plugins = data.plugins;

  return (
    <div className={`agent-inline-card overflow-hidden ${className ?? ''}`}>
      <CompositeHeader
        title={data.title ?? 'Storyboard'}
        count={`${data.sections.length} rows`}
        actions={
          plugins && (canvasPayload || cutPayload || assetBatchPayload) ? (
            <div className="flex items-center gap-1">
              {canvasPayload && (
                <SendToMenu
                  payload={canvasPayload}
                  mediaType="image"
                  plugins={plugins}
                  allowedTargets={['canvas']}
                />
              )}
              {cutPayload && (
                <SendToMenu
                  payload={cutPayload}
                  mediaType="image"
                  plugins={plugins}
                  allowedTargets={['cut']}
                />
              )}
              {assetBatchPayload && (
                <SendToMenu
                  payload={assetBatchPayload}
                  mediaType="image"
                  plugins={plugins}
                  allowedTargets={['explorer']}
                />
              )}
            </div>
          ) : null
        }
      />
      <div className="divide-y divide-[var(--agent-divider)]">
        {data.sections.map((section) => (
          <div
            key={section.id}
            className="grid gap-2 px-2 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(120px,180px)]"
          >
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded bg-[var(--agent-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--agent-fg-secondary)]">
                  {String(section.index + 1).padStart(2, '0')}
                </span>
                {section.heading && (
                  <span className="truncate text-[12px] font-medium text-[var(--agent-fg)]">
                    {section.heading}
                  </span>
                )}
              </div>
              {section.content && (
                <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[var(--agent-fg)]">
                  {section.content}
                </p>
              )}
              <Diagnostics diagnostics={section.diagnostics} />
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-1">
              {section.media.map((media) => (
                <MediaPreview key={media.id} media={media} compact />
              ))}
            </div>
          </div>
        ))}
      </div>
      <Diagnostics diagnostics={data.diagnostics} aggregate />
    </div>
  );
}

function ComparisonGridRendererComponent({
  data,
  className,
}: RichContentProps<ComparisonGridRichData>) {
  const cells = data.sections.flatMap((section) =>
    section.media.map((media) => ({ section, media })),
  );

  return (
    <div className={`agent-inline-card overflow-hidden ${className ?? ''}`}>
      <CompositeHeader title={data.title ?? 'Comparison'} count={`${cells.length} variants`} />
      <div className="grid gap-2 p-2 sm:grid-cols-2">
        {cells.map(({ section, media }) => (
          <div
            key={`${section.id}:${media.id}`}
            className="min-w-0 rounded border border-[var(--agent-divider)] bg-[var(--agent-elevated)] p-1.5"
          >
            <MediaPreview media={media} />
            <div className="mt-1 min-w-0">
              <div className="truncate text-[11px] font-medium text-[var(--agent-fg)]">
                {media.caption ??
                  section.heading ??
                  media.label ??
                  `Variant ${media.assetIndex + 1}`}
              </div>
              {section.content && (
                <p className="mt-0.5 line-clamp-3 text-[10px] leading-relaxed text-[var(--agent-fg-secondary)]">
                  {section.content}
                </p>
              )}
              <MediaTransferActions media={media} plugins={data.plugins} />
            </div>
          </div>
        ))}
      </div>
      <Diagnostics diagnostics={data.diagnostics} aggregate />
    </div>
  );
}

function AssetGalleryRendererComponent({
  data,
  className,
}: RichContentProps<AssetGalleryRichData>) {
  const assets = data.sections.flatMap((section) =>
    section.media.map((media) => ({ section, media })),
  );

  return (
    <div className={`agent-inline-card overflow-hidden ${className ?? ''}`}>
      <CompositeHeader title={data.title ?? 'Assets'} count={`${assets.length} assets`} />
      <div className="grid gap-2 p-2 sm:grid-cols-3">
        {assets.map(({ section, media }) => (
          <div
            key={`${section.id}:${media.id}`}
            className="min-w-0 rounded border border-[var(--agent-divider)] bg-[var(--agent-elevated)] p-1.5"
          >
            <MediaPreview media={media} />
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--agent-fg-secondary)]">
                {media.caption ?? section.heading ?? media.label ?? media.assetId ?? 'Asset'}
              </span>
              {media.localPath && (
                <button
                  type="button"
                  className="rounded border border-[var(--agent-input-border)] px-1.5 py-0.5 text-[10px] text-[var(--agent-fg)] hover:bg-[var(--agent-hover)]"
                  onClick={() => VSCodeMessages.openFile(media.localPath!)}
                >
                  Open
                </button>
              )}
              <MediaTransferActions media={media} plugins={data.plugins} />
            </div>
          </div>
        ))}
      </div>
      <Diagnostics diagnostics={data.diagnostics} aggregate />
    </div>
  );
}

function CompositeHeader({
  title,
  count,
  actions,
}: {
  title: string;
  count: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--agent-divider)] bg-[var(--agent-elevated)] px-2 py-1.5">
      <span className="text-[12px] font-medium text-[var(--agent-fg)]">{title}</span>
      <span className="flex-1" />
      {actions}
      <span className="text-[10px] text-[var(--agent-fg-secondary)]">{count}</span>
    </div>
  );
}

function MediaPreview({
  media,
  compact = false,
}: {
  media: ResolvedCompositeMedia;
  compact?: boolean;
}) {
  const label = media.caption ?? media.label ?? media.assetId ?? 'Media';
  const className = compact ? 'max-h-[120px]' : 'max-h-[180px]';

  if (media.type === 'image') {
    return (
      <button
        type="button"
        className="block w-full overflow-hidden rounded bg-[var(--vscode-editor-background)]"
        onClick={() => openMedia(media)}
        title={label}
      >
        <img
          src={media.src}
          alt={label}
          className={`w-full object-cover ${className}`}
          loading="lazy"
        />
      </button>
    );
  }

  if (media.type === 'video') {
    return (
      <video
        src={media.src}
        controls
        preload="metadata"
        className={`w-full rounded bg-black object-contain ${className}`}
        title={label}
      />
    );
  }

  if (media.type === 'audio') {
    return <audio src={media.src} controls className="w-full" title={label} />;
  }

  if (media.type === 'model') {
    return (
      <button
        type="button"
        className="flex w-full items-center justify-center rounded border border-[var(--agent-divider)] bg-[var(--vscode-editor-background)] px-2 py-4 text-[10px] text-[var(--agent-fg-secondary)]"
        onClick={() => openMedia(media)}
        title={label}
      >
        3D Model - {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="flex w-full items-center justify-center rounded border border-[var(--agent-divider)] bg-[var(--vscode-editor-background)] px-2 py-4 text-[10px] text-[var(--agent-fg-secondary)]"
      onClick={() => openMedia(media)}
      title={label}
    >
      {label}
    </button>
  );
}

function MediaTransferActions({
  media,
  plugins,
}: {
  media: ResolvedCompositeMedia;
  plugins?: AssetGalleryRichData['plugins'];
}) {
  if (!plugins || !media.localPath) return null;
  const mediaType = toPluginTransferMediaType(media.type);
  if (!mediaType) return null;

  return (
    <SendToMenu
      assetPath={media.localPath}
      mediaType={mediaType}
      plugins={plugins}
      allowedTargets={mediaType === 'model' ? ['model', 'explorer'] : undefined}
    />
  );
}

function toPluginTransferMediaType(
  mediaType: CompositeMediaType,
): 'image' | 'video' | 'audio' | 'model' | null {
  if (
    mediaType === 'image' ||
    mediaType === 'video' ||
    mediaType === 'audio' ||
    mediaType === 'model'
  ) {
    return mediaType;
  }
  return null;
}

function Diagnostics({
  diagnostics,
  aggregate = false,
}: {
  diagnostics: readonly CompositeMediaDiagnostic[];
  aggregate?: boolean;
}) {
  if (diagnostics.length === 0) return null;

  const visible = aggregate ? dedupeDiagnostics(diagnostics) : diagnostics;
  if (visible.length === 0) return null;

  return (
    <div
      className={`${aggregate ? 'border-t border-[var(--agent-divider)] px-2 py-1.5' : 'mt-1'} space-y-1`}
    >
      {visible.map((diagnostic) => (
        <div
          key={`${diagnostic.code}:${diagnostic.toolCallId}:${diagnostic.assetIndex ?? 'x'}:${diagnostic.assetId ?? ''}`}
          className="rounded bg-[color-mix(in_srgb,var(--agent-warning-fg)_10%,transparent)] px-1.5 py-1 text-[10px] text-[var(--agent-warning-fg)]"
        >
          {diagnostic.message}
        </div>
      ))}
    </div>
  );
}

function openMedia(media: ResolvedCompositeMedia): void {
  if (media.localPath) {
    VSCodeMessages.openFile(media.localPath);
    return;
  }
  VSCodeMessages.openUrl(media.src);
}

function dedupeDiagnostics(
  diagnostics: readonly CompositeMediaDiagnostic[],
): readonly CompositeMediaDiagnostic[] {
  const seen = new Set<string>();
  const result: CompositeMediaDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}:${diagnostic.toolCallId}:${diagnostic.assetIndex ?? ''}:${diagnostic.assetId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

function isCompositeData<T extends string>(data: unknown, template: T): data is { template: T } {
  if (typeof data !== 'object' || data === null) return false;
  const record = data as Record<string, unknown>;
  return record['template'] === template && Array.isArray(record['sections']);
}

export const storyboardTableRendererEntry: RichContentRendererEntry<StoryboardTableRichData> = {
  kind: 'storyboard-table',
  validate: isStoryboardTableRichData,
  component: StoryboardTableRendererComponent,
};

export const comparisonGridRendererEntry: RichContentRendererEntry<ComparisonGridRichData> = {
  kind: 'comparison-grid',
  validate: isComparisonGridRichData,
  component: ComparisonGridRendererComponent,
};

export const assetGalleryRendererEntry: RichContentRendererEntry<AssetGalleryRichData> = {
  kind: 'asset-gallery',
  validate: isAssetGalleryRichData,
  component: AssetGalleryRendererComponent,
};
