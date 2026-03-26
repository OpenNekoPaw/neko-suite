import { memo, useState } from 'react';
import { useTranslation } from '../../../i18n/I18nContext';

export interface CollapsibleSectionProps {
  titleKey: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export const CollapsibleSection = memo(function CollapsibleSection({
  titleKey,
  children,
  defaultExpanded = true,
}: CollapsibleSectionProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border-b border-[var(--vscode-panel-border)]">
      <button
        className="w-full flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`transform transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
        {t(titleKey)}
      </button>
      {expanded && <div className="px-2 pb-2 space-y-1.5">{children}</div>}
    </div>
  );
});
