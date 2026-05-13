import { useTranslation } from '../i18n/I18nContext';
import type { DashboardRuntimeStatus } from '../types';

export interface MetricCardsProps {
  readonly runtime: DashboardRuntimeStatus;
  readonly projectCount: number;
  readonly taskCount: number;
}

export function MetricCards({ runtime, projectCount, taskCount }: MetricCardsProps) {
  const { t } = useTranslation();

  const engineState = runtime.engine?.available
    ? (runtime.engine.value?.state ?? 'unknown')
    : t('common.na');
  const engineOnline = runtime.engine?.available && runtime.engine.value?.state === 'ready';

  const agentText = runtime.agent?.available
    ? runtime.agent.value
      ? t('dashboard.status.running', {
          running: runtime.agent.value.running,
          total: runtime.agent.value.total,
        })
      : t('dashboard.status.ready')
    : t('common.na');

  const assetText = runtime.assets?.available
    ? runtime.assets.value
      ? t('dashboard.status.files', { count: runtime.assets.value.fileCount })
      : t('dashboard.status.ready')
    : t('common.na');

  return (
    <section className="metric-cards" aria-label="Status">
      <MetricCard
        label={t('dashboard.status.engine')}
        value={engineState}
        indicator={engineOnline ? 'online' : 'offline'}
      />
      <MetricCard label={t('dashboard.status.projects')} value={String(projectCount)} />
      <MetricCard label={t('tasks.title')} value={String(taskCount)} />
      <MetricCard label={t('dashboard.status.agent')} value={agentText} />
      <MetricCard label={t('dashboard.status.assets')} value={assetText} />
    </section>
  );
}

interface MetricCardProps {
  readonly label: string;
  readonly value: string;
  readonly indicator?: 'online' | 'offline';
}

function MetricCard({ label, value, indicator }: MetricCardProps) {
  return (
    <div className="metric-card">
      <span className="metric-card-label">{label}</span>
      <span className="metric-card-value">
        {indicator !== undefined ? (
          <span className={`metric-indicator ${indicator}`} aria-hidden="true" />
        ) : null}
        {value}
      </span>
    </div>
  );
}
