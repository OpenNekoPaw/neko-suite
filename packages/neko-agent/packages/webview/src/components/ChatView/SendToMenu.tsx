/**
 * SendToMenu - Cross-plugin transfer action buttons (ADR-5 P0)
 *
 * Renders contextual action buttons based on which neko-suite plugins
 * are installed. The webview receives plugin availability via
 * `pluginsAvailable` message at initialization.
 *
 * All transfers use GeneratedAsset JSON — no binary data is sent.
 */

import { memo, useCallback } from 'react';
import { VSCodeMessages } from '@/messages';
import { ArrowRightIcon, FileIcon, LayersIcon, ScissorsIcon, UploadIcon } from '@neko/shared/icons';
import type {
  PluginTransferAssetRef,
  PluginTransferMediaType,
  PluginTransferPayload,
  PluginTransferTarget,
  PluginsAvailable as SharedPluginsAvailable,
} from '@neko-agent/types';
import { projectPluginTransferMenu } from '../../presenters/plugin-transfer-presenter';

/** Which plugins are installed */
export type PluginsAvailable = SharedPluginsAvailable;

export type SendToTarget = PluginTransferTarget;

interface SendToMenuProps {
  /** Asset path on disk (absolute) */
  assetPath?: string;
  /** Multiple asset paths on disk. */
  assetPaths?: readonly string[];
  /** Fully typed asset refs, used when names or mixed media metadata are available. */
  assets?: readonly PluginTransferAssetRef[];
  /** Structured transfer payload. Overrides assetPath / assetPaths / assets when provided. */
  payload?: PluginTransferPayload;
  /** Optional target allow-list for composite UIs that split structured and flat transfers. */
  allowedTargets?: readonly PluginTransferTarget[];
  /** Media type hint for determining valid targets */
  mediaType: PluginTransferMediaType;
  /** Detected installed plugins */
  plugins: PluginsAvailable;
  /** Hide the leading "Send to" text for compact contexts such as thumbnails. */
  hidePrefixLabel?: boolean;
  className?: string;
}

function SendToMenuComponent({
  assetPath,
  assetPaths,
  assets,
  payload,
  allowedTargets,
  mediaType,
  plugins,
  hidePrefixLabel = false,
  className,
}: SendToMenuProps) {
  const handleSendTo = useCallback(
    (target: SendToTarget) => {
      const transferPayload = buildPluginTransferPayload({
        assetPath,
        assetPaths,
        assets,
        mediaType,
        payload,
      });
      if (!transferPayload) return;
      VSCodeMessages.sendToPlugin(target, transferPayload);
    },
    [assetPath, assetPaths, assets, mediaType, payload],
  );

  const projection = projectPluginTransferMenu({
    mediaType,
    plugins,
    ...(payload?.kind === 'canvasStoryboard' ? { structuredKind: 'canvasStoryboard' } : {}),
    ...(payload?.kind === 'cutStoryboard' ? { structuredKind: 'cutStoryboard' } : {}),
    ...(payload?.kind === 'canvasText' ||
    payload?.kind === 'canvasPrompt' ||
    payload?.kind === 'canvasStructuredContent'
      ? { structuredKind: 'canvasContent' }
      : {}),
  });
  const targets = allowedTargets
    ? projection.targets.filter((target) => allowedTargets.includes(target.id))
    : projection.targets;

  if (targets.length === 0) return null;

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      {!hidePrefixLabel && (
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)] shrink-0">
          Open in
        </span>
      )}
      {targets.map((target) => (
        <button
          key={target.id}
          onClick={() => handleSendTo(target.id)}
          className="inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[var(--agent-input-border)]
            bg-[var(--agent-surface)] px-2 text-[11px] text-[var(--agent-fg)]
            transition-colors hover:border-[var(--agent-accent)] hover:bg-[var(--agent-hover)]"
          title={`Open in ${target.label}`}
        >
          {getTargetIcon(target.id)}
          <span>{target.label}</span>
          <ArrowRightIcon className="h-3 w-3 opacity-70" />
        </button>
      ))}
    </div>
  );
}

function buildPluginTransferPayload(input: {
  assetPath?: string;
  assetPaths?: readonly string[];
  assets?: readonly PluginTransferAssetRef[];
  mediaType: PluginTransferMediaType;
  payload?: PluginTransferPayload;
}): PluginTransferPayload | null {
  if (input.payload) return input.payload;

  const assets: readonly PluginTransferAssetRef[] =
    input.assets ??
    input.assetPaths?.map((path) => ({
      path,
      mediaType: input.mediaType,
    })) ??
    (input.assetPath
      ? [
          {
            path: input.assetPath,
            mediaType: input.mediaType,
          },
        ]
      : []);

  const validAssets = assets.filter(hasPluginTransferAssetIdentity);
  if (validAssets.length === 0) return null;
  if (validAssets.length === 1 && validAssets[0]) {
    return { kind: 'singleAsset', asset: validAssets[0] };
  }
  return { kind: 'assetBatch', assets: validAssets };
}

function hasPluginTransferAssetIdentity(asset: PluginTransferAssetRef): boolean {
  return Boolean(asset.path || asset.documentResourceRef || asset.resourceRef);
}

function getTargetIcon(target: SendToTarget): React.ReactNode {
  if (target === 'canvas') return <LayersIcon className="h-3.5 w-3.5" />;
  if (target === 'cut') return <ScissorsIcon className="h-3.5 w-3.5" />;
  if (target === 'sketch') return <EditGlyph />;
  if (target === 'model') return <ModelGlyph />;
  if (target === 'explorer') return <FileIcon className="h-3.5 w-3.5" />;
  return <UploadIcon className="h-3.5 w-3.5" />;
}

function EditGlyph() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <path d="M3 12.5 11.5 4 13 5.5 4.5 14H3v-1.5Z" strokeWidth="1.5" />
      <path d="M10.5 5 12 6.5" strokeWidth="1.5" />
    </svg>
  );
}

function ModelGlyph() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <path d="M8 1.8 13 4.5v5.8L8 14.2 3 10.3V4.5L8 1.8Z" strokeWidth="1.4" />
      <path d="M3.3 4.7 8 7.4l4.7-2.7M8 7.4v6.2" strokeWidth="1.2" />
    </svg>
  );
}

export const SendToMenu = memo(SendToMenuComponent);
