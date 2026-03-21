/**
 * CollapsiblePanel — collapsible sidebar section
 *
 * Mirrors neko-cut's PropertyGroup pattern: chevron toggle, uppercase title,
 * border divider. Used to wrap each sidebar panel in the sketch editor.
 */
import { useState } from 'react';
import { useTranslation } from '../i18n/I18nContext';

interface CollapsiblePanelProps {
  titleKey: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function CollapsiblePanel({ titleKey, children, defaultExpanded = true }: CollapsiblePanelProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="sketch-group">
      <button
        className="sketch-group-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <svg
          className={`sketch-group-chevron${expanded ? ' expanded' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 2.5L7.5 6 4 9.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="sketch-group-title">{t(titleKey)}</span>
      </button>
      {expanded && <div className="sketch-group-body">{children}</div>}
    </div>
  );
}
