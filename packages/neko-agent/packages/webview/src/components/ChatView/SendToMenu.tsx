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

/** Which plugins are installed */
export interface PluginsAvailable {
  canvas?: boolean;
  cut?: boolean;
  sketch?: boolean;
}

export type SendToTarget = 'canvas' | 'cut' | 'sketch' | 'explorer';

interface SendToMenuProps {
  /** Asset path on disk (absolute) */
  assetPath: string;
  /** Media type hint for determining valid targets */
  mediaType: 'image' | 'video' | 'audio';
  /** Detected installed plugins */
  plugins: PluginsAvailable;
  className?: string;
}

/** Target configuration */
interface TargetConfig {
  id: SendToTarget;
  label: string;
  icon: string;
  /** Which media types this target accepts */
  accepts: Array<'image' | 'video' | 'audio'>;
  /** Which plugin must be installed (undefined = always available) */
  requiresPlugin?: keyof PluginsAvailable;
}

const TARGETS: TargetConfig[] = [
  {
    id: 'canvas',
    label: 'Canvas',
    icon: '🖼️',
    accepts: ['image'],
    requiresPlugin: 'canvas',
  },
  {
    id: 'cut',
    label: 'Timeline',
    icon: '🎬',
    accepts: ['image', 'video', 'audio'],
    requiresPlugin: 'cut',
  },
  {
    id: 'explorer',
    label: 'Explorer',
    icon: '📁',
    accepts: ['image', 'video', 'audio'],
    // Always available — no plugin required
  },
];

function SendToMenuComponent({ assetPath, mediaType, plugins, className }: SendToMenuProps) {
  const handleSendTo = useCallback(
    (target: SendToTarget) => {
      VSCodeMessages.sendToPlugin(target, assetPath, mediaType);
    },
    [assetPath, mediaType],
  );

  // Filter targets: must accept the media type AND have its plugin installed
  const availableTargets = TARGETS.filter((t) => {
    if (!t.accepts.includes(mediaType)) return false;
    if (t.requiresPlugin && !plugins[t.requiresPlugin]) return false;
    return true;
  });

  if (availableTargets.length === 0) return null;

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <span className="text-[9px] text-[var(--vscode-descriptionForeground)] shrink-0">
        Send to
      </span>
      {availableTargets.map((target) => (
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
          <span>{target.icon}</span>
          <span>{target.label}</span>
          <span className="opacity-60">↗</span>
        </button>
      ))}
    </div>
  );
}

export const SendToMenu = memo(SendToMenuComponent);
