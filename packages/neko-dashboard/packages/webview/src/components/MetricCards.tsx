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
  const engineEndpoint = runtime.engine?.value?.endpoint?.address;
  const engineDetail = runtime.engine?.available
    ? (engineEndpoint ?? t('dashboard.status.endpointUnknown'))
    : undefined;
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
    <section className="metric-cards" aria-label={t('dashboard.status')}>
      <MetricCard
        label={t('dashboard.status.engine')}
        value={engineState}
        detail={engineDetail}
        indicator={engineOnline ? 'online' : 'offline'}
        tone={engineOnline ? 'success' : 'neutral'}
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
  readonly detail?: string;
  readonly indicator?: 'online' | 'offline';
  readonly tone?: 'neutral' | 'success';
}

function MetricCard({ label, value, detail, indicator, tone = 'neutral' }: MetricCardProps) {
  return (
    <div className={`metric-card metric-card--${tone}`}>
      <span className="metric-card-label">{label}</span>
      <span className="metric-card-value">
        {indicator !== undefined ? (
          <span className={`metric-indicator ${indicator}`} aria-hidden="true" />
        ) : null}
        {value}
      </span>
      {detail ? <span className="metric-card-detail">{detail}</span> : null}
    </div>
  );
}
