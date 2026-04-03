/**
 * RichContentRenderer — Universal dispatcher component.
 *
 * Usage:
 *   <RichContentRenderer kind="video" data={{ src, poster, title, localPath }} inline />
 *
 * Looks up the registry for a matching renderer, validates data, then renders.
 * Falls back to a minimal "unknown content" placeholder if no match.
 */

import { memo } from 'react';
import { richContentRegistry } from './RichContentRegistry';

interface RichContentRendererProps {
  /** Content kind identifier (e.g. 'image', 'video', 'storyboard') */
  kind: string;
  /** Raw data payload — will be validated by the renderer entry */
  data: unknown;
  className?: string;
  /** Compact mode for inline embedding (e.g. inside TaskCard) */
  inline?: boolean;
}

function RichContentRendererComponent({ kind, data, className, inline }: RichContentRendererProps) {
  const entry = richContentRegistry.get(kind);

  // No renderer registered for this kind
  if (!entry) {
    return <UnknownContentFallback kind={kind} />;
  }

  // Data shape doesn't match what the renderer expects
  if (!entry.validate(data)) {
    return <UnknownContentFallback kind={kind} reason="invalid data" />;
  }

  const Renderer = entry.component;
  return <Renderer data={data} className={className} inline={inline} />;
}

export const RichContentRenderer = memo(RichContentRendererComponent);

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

function UnknownContentFallback({ kind, reason }: { kind: string; reason?: string }) {
  return (
    <div className="px-2 py-1.5 rounded text-[10px] text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-textBlockQuote-background)]">
      Unsupported content: <code>{kind}</code>
      {reason ? ` (${reason})` : ''}
    </div>
  );
}
