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
import type { AgentCapabilityInvocationInput, CanvasMarkdownCapabilityInput } from '@neko/shared';
import type {
  PluginTransferAssetRef,
  PluginTransferMediaType,
  PluginTransferPayload,
  PluginTransferTarget,
  PluginsAvailable as SharedPluginsAvailable,
} from '@neko-agent/types';
import { projectPluginTransferMenu } from '../../presenters/plugin-transfer-presenter';
import type { CanvasMarkdownHandoffRequest } from '@/presenters/canvas-markdown-handoff-presenter';

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
  /** Canvas Markdown handoff context. Sent through the capability lifecycle backend. */
  canvasMarkdownHandoff?: CanvasMarkdownHandoffRequest;
  /** Conversation scope for Canvas Markdown lifecycle results. */
  conversationId?: string | null;
  /** Optional target allow-list for composite UIs that split structured and flat transfers. */
  allowedTargets?: readonly PluginTransferTarget[];
  /** Media type hint for determining valid targets */
  mediaType: PluginTransferMediaType;
  /** Detected installed plugins */
  plugins: PluginsAvailable;
  /** Hide the leading "Send to" text for compact contexts such as thumbnails. */
  hidePrefixLabel?: boolean;
  /** Override the leading action phrase for explicit draft-only flows. */
  labelOverride?: string;
  /** Hide Explorer from contexts that already have a primary view/reveal affordance. */
  hideExplorerTarget?: boolean;
  className?: string;
}

function SendToMenuComponent({
  assetPath,
  assetPaths,
  assets,
  payload,
  canvasMarkdownHandoff,
  conversationId,
  allowedTargets,
  mediaType,
  plugins,
  hidePrefixLabel = false,
  labelOverride = 'Send to',
  hideExplorerTarget = false,
  className,
}: SendToMenuProps) {
  const handleSendTo = useCallback(
    (target: SendToTarget) => {
      if (canvasMarkdownHandoff) {
        if (target !== 'canvas' || !conversationId) return;
        VSCodeMessages.invokeAgentCapabilityLifecycle(
          conversationId,
          createCanvasMarkdownLifecycleRequestId(),
          createCanvasMarkdownLifecycleInvocation(canvasMarkdownHandoff, conversationId),
        );
        return;
      }
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
    [assetPath, assetPaths, assets, canvasMarkdownHandoff, conversationId, mediaType, payload],
  );

  const projection = projectPluginTransferMenu({
    mediaType,
    plugins,
    ...(payload?.kind === 'cutStoryboard' ? { structuredKind: 'cutStoryboard' } : {}),
  });
  const targets = allowedTargets
    ? projection.targets.filter((target) => allowedTargets.includes(target.id))
    : projection.targets;
  const capabilityTargets = canvasMarkdownHandoff
    ? targets.filter((target) => target.id === 'canvas' && Boolean(conversationId))
    : targets;
  const visibleTargets = hideExplorerTarget
    ? capabilityTargets.filter((target) => target.id !== 'explorer')
    : capabilityTargets;

  if (visibleTargets.length === 0) return null;

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      {!hidePrefixLabel && (
        <span className="shrink-0 text-[10px] text-[var(--vscode-descriptionForeground)]">
          {labelOverride}
        </span>
      )}
      {visibleTargets.map((target) => (
        <button
          key={target.id}
          onClick={() => handleSendTo(target.id)}
          className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded border border-[var(--agent-input-border)]
            bg-[var(--agent-surface)] px-2 text-[11px] font-medium text-[var(--agent-fg)]
            transition-colors hover:border-[var(--agent-accent)] hover:bg-[var(--agent-hover)]
            focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--agent-accent)]"
          title={`Send to ${target.label}`}
        >
          {getTargetIcon(target.id)}
          <span>{target.label}</span>
          <ArrowRightIcon className="h-3 w-3 opacity-70" />
        </button>
      ))}
    </div>
  );
}

function createCanvasMarkdownLifecycleRequestId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `canvas-markdown-lifecycle:${random}`;
}

function createCanvasMarkdownLifecycleInvocation(
  handoff: CanvasMarkdownHandoffRequest,
  conversationId: string,
): AgentCapabilityInvocationInput {
  const payload: CanvasMarkdownCapabilityInput = {
    capabilityId: 'canvas.ingestMarkdown',
    markdown: handoff.markdown,
    ...(handoff.title ? { title: handoff.title } : {}),
    ...(handoff.sourceFormat ? { sourceFormat: handoff.sourceFormat } : {}),
    ...(handoff.resources ? { resources: handoff.resources } : {}),
    ...(handoff.target ? { target: handoff.target } : {}),
    provenance: {
      source: handoff.provenance?.source ?? 'webview',
      conversationId: handoff.provenance?.conversationId ?? conversationId,
      ...(handoff.provenance?.messageId ? { messageId: handoff.provenance.messageId } : {}),
      ...(handoff.provenance?.toolCallId ? { toolCallId: handoff.provenance.toolCallId } : {}),
      ...(handoff.provenance?.label ? { label: handoff.provenance.label } : {}),
    },
    ...(handoff.declaredIntentHint ? { intentHint: handoff.declaredIntentHint } : {}),
    ...(handoff.declaredProfileHint ? { profileHint: handoff.declaredProfileHint } : {}),
  };

  return {
    capabilityId: 'canvas.ingestMarkdown',
    phase: 'review',
    payload,
    ...(handoff.target
      ? {
          target: {
            packageId: 'neko-canvas',
            ...(handoff.target.canvasId ? { canvasId: handoff.target.canvasId } : {}),
            ...(handoff.target.nodeId ? { nodeId: handoff.target.nodeId } : {}),
            ...(handoff.target.containerId ? { containerId: handoff.target.containerId } : {}),
            ...(handoff.target.slotId ? { slotId: handoff.target.slotId } : {}),
            ...(handoff.target.fieldPath ? { fieldPath: handoff.target.fieldPath } : {}),
            ...(handoff.target.insertionPoint
              ? { insertionPoint: handoff.target.insertionPoint }
              : {}),
          },
        }
      : {}),
    provenance: {
      source: 'webview',
      conversationId,
      ...(handoff.provenance?.messageId ? { messageId: handoff.provenance.messageId } : {}),
      ...(handoff.provenance?.toolCallId ? { toolCallId: handoff.provenance.toolCallId } : {}),
      ...(handoff.provenance?.label ? { label: handoff.provenance.label } : {}),
    },
  };
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
