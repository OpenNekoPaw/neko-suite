/**
 * CollapsiblePanel — collapsible sidebar section
 *
 * Thin wrapper around the shared CollapsibleSection component.
 * Preserves the original `titleKey` API so all callers need no changes.
 */
import { useState, type ReactNode } from 'react';
import { Collapsible } from '@neko/ui/primitives';
import { useTranslation } from '../i18n/I18nContext';

interface CollapsiblePanelProps {
  titleKey: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}

export function CollapsiblePanel({
  titleKey,
  children,
  defaultExpanded = true,
}: CollapsiblePanelProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Collapsible
      className="neko-collapsible"
      contentClassName="neko-collapsible-body"
      onOpenChange={setExpanded}
      open={expanded}
      trigger={
        <button aria-expanded={expanded} className="neko-collapsible-header" type="button">
          <span className={`neko-collapsible-chevron${expanded ? ' expanded' : ''}`}>
            <ChevronIcon />
          </span>
          {t(titleKey)}
        </button>
      }
    >
      {expanded ? children : null}
    </Collapsible>
  );
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
      <path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L9.19 8 6.22 5.03a.75.75 0 0 1 0-1.06z" />
    </svg>
  );
}
