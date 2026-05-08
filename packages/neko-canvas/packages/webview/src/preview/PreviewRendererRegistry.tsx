import React, { useEffect, useMemo, useState } from 'react';
import type { DelegateAction } from '@neko/shared';
import { dispatchPreviewDelegate } from './previewDelegates';
import { WebviewPreviewResolver } from './previewResolver';
import { PreviewRuntime } from './previewRuntime';
import type { PreviewSourceDescriptor, RuntimePreviewVariant } from './types';

export interface PreviewRendererProps {
  source: PreviewSourceDescriptor;
  runtime?: PreviewRuntime;
  delegateActions?: DelegateAction[];
}

export type PreviewRenderer = (props: PreviewRendererProps) => React.ReactNode;

export type PreviewRendererRegistry = Partial<
  Record<PreviewSourceDescriptor['role'], PreviewRenderer>
>;

function createPreviewRendererRegistry(): PreviewRendererRegistry {
  return {
    image: renderVisualPreview,
    'document-cover': renderVisualPreview,
    'video-poster': renderVisualPreview,
    'video-proxy': renderVideoPreview,
    'audio-waveform': renderAudioPreview,
    'model-screenshot': renderVisualPreview,
    'model-turntable': renderVisualPreview,
    'panorama-fov-crop': renderVisualPreview,
    'panorama-rotation': renderVisualPreview,
    'generation-candidate': renderVisualPreview,
    fallback: renderFallbackPreview,
  };
}

export function PreviewSurface(props: PreviewRendererProps) {
  const registry = useMemo(() => createPreviewRendererRegistry(), []);
  const renderer = registry[props.source.role] ?? renderFallbackPreview;
  return <>{renderer(props)}</>;
}

function useResolvedVariant(source: PreviewSourceDescriptor): RuntimePreviewVariant | undefined {
  const resolver = useMemo(() => new WebviewPreviewResolver(), []);
  const [variant, setVariant] = useState<RuntimePreviewVariant | undefined>();

  useEffect(() => {
    let cancelled = false;
    resolver.resolve({ source }).then((nextVariant) => {
      if (!cancelled) {
        setVariant(nextVariant);
      }
    });
    return () => {
      cancelled = true;
      resolver.dispose();
    };
  }, [resolver, source]);

  return variant;
}

function renderVisualPreview({ source, delegateActions }: PreviewRendererProps): React.ReactNode {
  const variant = useResolvedVariant(source);
  const url = variant?.runtimeUrl ?? variant?.sourcePath ?? source.asset?.path;

  if (!url) {
    return renderFallbackPreview({ source, delegateActions });
  }

  return (
    <div className="relative flex min-h-[80px] items-center justify-center overflow-hidden rounded border border-[var(--node-border)] bg-black/20">
      <img src={url} alt={source.title ?? source.id} className="h-full w-full object-cover" />
      {delegateActions && delegateActions.length > 0 && (
        <button
          type="button"
          className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            dispatchPreviewDelegate({ action: delegateActions[0]!, asset: source.asset });
          }}
        >
          Open
        </button>
      )}
    </div>
  );
}

function renderVideoPreview(props: PreviewRendererProps): React.ReactNode {
  const variant = useResolvedVariant(props.source);
  const url = variant?.runtimeUrl ?? variant?.sourcePath ?? props.source.asset?.path;
  return (
    <div className="relative min-h-[90px] overflow-hidden rounded border border-[var(--node-border)] bg-black/30">
      {url ? <video src={url} className="h-full w-full object-cover" muted playsInline /> : null}
      <div className="absolute inset-0 flex items-center justify-center text-white/80">Play</div>
    </div>
  );
}

function renderAudioPreview(props: PreviewRendererProps): React.ReactNode {
  const variant = useResolvedVariant(props.source);
  const url = variant?.runtimeUrl ?? variant?.sourcePath ?? props.source.asset?.path;
  return (
    <div className="rounded border border-[var(--node-border)] bg-black/20 p-2">
      <div className="mb-2 flex h-8 items-end gap-0.5">
        {Array.from({ length: 24 }).map((_, index) => (
          <div
            key={index}
            className="w-1 rounded-sm bg-[var(--node-selected)] opacity-70"
            style={{ height: `${20 + ((index * 17) % 60)}%` }}
          />
        ))}
      </div>
      {url ? <audio src={url} controls className="w-full" /> : null}
    </div>
  );
}

function renderFallbackPreview({ source, delegateActions }: PreviewRendererProps): React.ReactNode {
  return (
    <div className="flex min-h-[72px] items-center justify-between gap-2 rounded border border-dashed border-[var(--node-border)] bg-black/20 px-2 text-xs text-[var(--node-fg-secondary)]">
      <span className="min-w-0 truncate">{source.title ?? source.asset?.path ?? source.id}</span>
      {delegateActions && delegateActions.length > 0 && (
        <button
          type="button"
          className="flex-shrink-0 rounded border border-[var(--node-border)] px-2 py-1"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            dispatchPreviewDelegate({ action: delegateActions[0]!, asset: source.asset });
          }}
        >
          Open
        </button>
      )}
    </div>
  );
}
