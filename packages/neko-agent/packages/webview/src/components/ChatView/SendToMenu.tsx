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
  PluginTransferMediaType,
  PluginTransferTarget,
  PluginsAvailable as SharedPluginsAvailable,
} from '@neko-agent/types';
import { projectPluginTransferMenu } from '../../presenters/plugin-transfer-presenter';

/** Which plugins are installed */
export type PluginsAvailable = SharedPluginsAvailable;

export type SendToTarget = PluginTransferTarget;

interface SendToMenuProps {
  /** Asset path on disk (absolute) */
  assetPath: string;
  /** Media type hint for determining valid targets */
  mediaType: PluginTransferMediaType;
  /** Detected installed plugins */
  plugins: PluginsAvailable;
  className?: string;
}

function SendToMenuComponent({ assetPath, mediaType, plugins, className }: SendToMenuProps) {
  const handleSendTo = useCallback(
    (target: SendToTarget) => {
      VSCodeMessages.sendToPlugin(target, assetPath, mediaType);
    },
    [assetPath, mediaType],
  );

  const projection = projectPluginTransferMenu({ mediaType, plugins });

  if (!projection.showMenu) return null;

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <span className="text-[9px] text-[var(--vscode-descriptionForeground)] shrink-0">
        Send to
      </span>
      {projection.targets.map((target) => (
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

function getTargetIcon(target: SendToTarget): string {
  if (target === 'canvas') return '🖼️';
  if (target === 'cut') return '🎬';
  if (target === 'explorer') return '📁';
  return '';
}

export const SendToMenu = memo(SendToMenuComponent);
