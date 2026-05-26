import { Button } from '@neko/ui/primitives';
import { useTranslation } from '../i18n/I18nContext';
import type { DashboardProjectType } from '../types';

const ACTION_TYPES: readonly DashboardProjectType[] = [
  'video',
  'canvas',
  'sketch',
  'audio',
  'model',
  'puppet',
];

export interface QuickActionsProps {
  readonly onCreateProject: (type: DashboardProjectType) => void;
}

export function QuickActions({ onCreateProject }: QuickActionsProps) {
  const { t } = useTranslation();

  return (
    <section className="panel quick-actions" aria-label={t('dashboard.quickStart')}>
      <h2>{t('dashboard.quickStart')}</h2>
      <div className="button-row">
        {ACTION_TYPES.map((type) => (
          <Button key={type} size="sm" onClick={() => onCreateProject(type)}>
            {t(`dashboard.quickStart.${type}`)}
          </Button>
        ))}
      </div>
    </section>
  );
}
