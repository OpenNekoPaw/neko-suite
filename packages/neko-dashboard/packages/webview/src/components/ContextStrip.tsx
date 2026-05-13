import { useTranslation } from '../i18n/I18nContext';
import type { DashboardRuntimeStatus } from '../types';

export interface ContextStripProps {
  readonly runtime: DashboardRuntimeStatus;
}

export function ContextStrip({ runtime }: ContextStripProps) {
  const { t } = useTranslation();

  const engine = runtime.engine?.available
    ? (runtime.engine.value?.state ?? 'unknown')
    : t('common.na');
  const agent = runtime.agent?.available
    ? t('dashboard.status.running', {
        running: runtime.agent.value?.running ?? 0,
        total: runtime.agent.value?.total ?? 0,
      })
    : t('common.na');
  const assets = runtime.assets?.available
    ? t('dashboard.status.files', { count: runtime.assets.value?.fileCount ?? 0 })
    : t('common.na');

  return (
    <section className="context-strip" aria-label={t('dashboard.status.engine')}>
      <span>
        {t('dashboard.status.engine')}: {engine}
      </span>
      <span>
        {t('dashboard.status.agent')}: {agent}
      </span>
      <span>
        {t('dashboard.status.assets')}: {assets}
      </span>
    </section>
  );
}
