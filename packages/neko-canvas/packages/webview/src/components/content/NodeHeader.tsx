export interface NodeHeaderBadge {
  label: string;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

export interface NodeHeaderProps {
  tagLabel: string;
  tagColor: string;
  title: string;
  badges?: NodeHeaderBadge[];
  collapsible: boolean;
  isCollapsed: boolean;
  onToggleCollapse?: () => void;
  onOpenPreview?: () => void;
  onExpand?: () => void;
}

export function NodeHeader({
  tagLabel,
  tagColor,
  title,
  badges,
  collapsible,
  isCollapsed,
  onToggleCollapse,
  onOpenPreview,
  onExpand,
}: NodeHeaderProps) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{
        backgroundColor: 'var(--node-header-bg)',
        borderBottom: '1px solid var(--node-divider)',
      }}
    >
      {collapsible && (
        <button
          type="button"
          className="flex-shrink-0 text-[10px]"
          style={{ color: 'var(--node-fg-secondary)' }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse?.();
          }}
        >
          {isCollapsed ? '▶' : '▼'}
        </button>
      )}
      <span
        className="flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium"
        style={{ backgroundColor: `${tagColor}20`, color: tagColor }}
      >
        {tagLabel}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-sm font-medium"
        style={{ color: 'var(--node-fg)' }}
      >
        {title}
      </span>
      {badges?.map((badge) => (
        <span
          key={badge.label}
          className={`flex-shrink-0 rounded px-1 py-0.5 text-[9px] leading-none ${getBadgeClassName(badge.tone)}`}
        >
          {badge.label}
        </span>
      ))}
      {onExpand && (
        <button
          type="button"
          className="flex-shrink-0 rounded px-1 py-0.5 text-xs"
          style={{ color: 'var(--node-fg-secondary)' }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
        >
          ⛶
        </button>
      )}
      {onOpenPreview && (
        <button
          type="button"
          className="flex-shrink-0 rounded px-1 py-0.5 text-xs"
          style={{ color: 'var(--node-fg-secondary)' }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenPreview();
          }}
        >
          ↗
        </button>
      )}
    </div>
  );
}

function getBadgeClassName(tone: NodeHeaderBadge['tone']): string {
  switch (tone) {
    case 'success':
      return 'bg-green-900/40 text-green-300';
    case 'warning':
      return 'bg-yellow-900/40 text-yellow-300';
    case 'danger':
      return 'bg-red-900/40 text-red-300';
    case 'info':
      return 'bg-blue-900/40 text-blue-300';
    default:
      return 'bg-black/30 text-[var(--node-fg-secondary)]';
  }
}
