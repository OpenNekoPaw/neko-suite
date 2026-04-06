/**
 * CollapsiblePanel — collapsible sidebar section
 *
 * Thin wrapper around the shared CollapsibleSection component.
 * Preserves the original `titleKey` API so all callers need no changes.
 */
import { CollapsibleSection } from '@neko/shared/components';
import { useTranslation } from '../i18n/I18nContext';

interface CollapsiblePanelProps {
  titleKey: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function CollapsiblePanel({
  titleKey,
  children,
  defaultExpanded = true,
}: CollapsiblePanelProps) {
  const { t } = useTranslation();
  return (
    <CollapsibleSection title={t(titleKey)} defaultExpanded={defaultExpanded}>
      {children}
    </CollapsibleSection>
  );
}
