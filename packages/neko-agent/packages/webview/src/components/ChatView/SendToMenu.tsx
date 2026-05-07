/**
 * SendToMenu - Cross-plugin "Send to" action buttons (ADR-5 P0)
 *
 * Renders contextual action buttons based on which neko-suite plugins
 * are installed. The webview receives plugin availability via
 * `pluginsAvailable` message at initialization.
 *
 * All transfers use GeneratedAsset JSON — no binary data is sent.
 */

import { memo, useCallback } from 'react';
import { VSCodeMessages } from '@/messages';
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
  });
  const targets = allowedTargets
    ? projection.targets.filter((target) => allowedTargets.includes(target.id))
    : projection.targets;

  if (targets.length === 0) return null;

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <span className="text-[9px] text-[var(--vscode-descriptionForeground)] shrink-0">
        Send to
      </span>
      {targets.map((target) => (
        <button
          key={target.id}
          onClick={() => handleSendTo(target.id)}
          className="px-1.5 py-0.5 rounded text-[10px]
            bg-[var(--vscode-button-secondaryBackground)]
            hover:bg-[var(--vscode-button-secondaryHoverBackground)]
            text-[var(--vscode-button-secondaryForeground)]
            transition-colors flex items-center gap-0.5"
          title={`Send to ${target.label}`}
        >
          <span>{getTargetIcon(target.id)}</span>
          <span>{target.label}</span>
          <span className="opacity-60">↗</span>
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

  const assets =
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

  const validAssets = assets.filter((asset) => asset.path);
  if (validAssets.length === 0) return null;
  if (validAssets.length === 1 && validAssets[0]) {
    return { kind: 'singleAsset', asset: validAssets[0] };
  }
  return { kind: 'assetBatch', assets: validAssets };
}

function getTargetIcon(target: SendToTarget): string {
  if (target === 'canvas') return '🖼️';
  if (target === 'cut') return '🎬';
  if (target === 'sketch') return '✏️';
  if (target === 'model') return '🧊';
  if (target === 'explorer') return '📁';
  return '';
}

export const SendToMenu = memo(SendToMenuComponent);
