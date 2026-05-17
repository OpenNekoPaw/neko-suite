/**
 * AgentContextChip — inline chip showing an attached agent context payload.
 *
 * Rendered above the textarea in InputArea when the user has attached
 * context from canvas nodes, cut clips, or story selections via the
 * neko.agent.sendContext command.
 */

import type { AgentContextPayload } from '@neko/shared';

const TYPE_ICONS: Record<string, string> = {
  'canvas-node': '⬡',
  'cut-clip': '🎬',
  'story-selection': '📄',
  file: '📎',
  image: '🖼',
  asset: '◈',
  media: '🎞',
  entity: '◇',
};

interface AgentContextChipProps {
  payload: AgentContextPayload;
  /** Omit to render a non-removable ambient chip (no × button). */
  onRemove?: (id: string) => void;
  /** Click handler for navigation (e.g. jump to source in message history). */
  onClick?: () => void;
}

export function AgentContextChip({ payload, onRemove, onClick }: AgentContextChipProps) {
  const icon = TYPE_ICONS[payload.type] ?? '◈';
  const clickable = Boolean(onClick);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] select-none${clickable ? ' cursor-pointer hover:brightness-125' : ''}`}
      title={payload.summary || payload.label}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick?.();
            }
          : undefined
      }
    >
      <span aria-hidden="true">{icon}</span>
      <span className="max-w-[120px] truncate">{payload.label}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${payload.label}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(payload.id);
          }}
          className="ml-0.5 opacity-60 hover:opacity-100 leading-none"
        >
          ×
        </button>
      )}
    </span>
  );
}
