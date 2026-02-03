/**
 * TaskStatisticsPanel - Task statistics and analytics
 *
 * Features:
 * - Today's completion statistics
 * - Success rate visualization
 * - Average duration metrics
 * - Recent task timeline
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n/I18nContext';
import type { TaskStatisticsPanelProps } from './types';

export function TaskStatisticsPanel({
  statistics,
  completedTasks,
}: TaskStatisticsPanelProps) {
  const { t } = useTranslation();

  // Group completed tasks by type
  const tasksByType = useMemo(() => {
    const grouped: Record<string, number> = {};
    for (const task of completedTasks) {
      grouped[task.type] = (grouped[task.type] || 0) + 1;
    }
    return grouped;
  }, [completedTasks]);

  return (
    <div className="p-3 space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label={t('agents.stats.completed')}
          value={statistics.todayCompleted}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          }
          color="green"
        />
        <StatCard
          label={t('agents.stats.failed')}
          value={statistics.todayFailed}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          }
          color="red"
        />
        <StatCard
          label={t('agents.stats.cancelled')}
          value={statistics.todayCancelled}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          }
          color="gray"
        />
        <StatCard
          label={t('agents.stats.avgDuration')}
          value={formatDuration(statistics.averageDuration)}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="blue"
          isText
        />
      </div>

      {/* Success Rate */}
      <div className="border border-[var(--vscode-panel-border)] rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium">{t('agents.stats.successRate')}</span>
          <span className="text-[12px] font-bold">{Math.round(statistics.successRate)}%</span>
        </div>
        <SuccessRateBar rate={statistics.successRate} />
        <div className="flex justify-between mt-1.5 text-[9px] text-[var(--vscode-descriptionForeground)]">
          <span>{statistics.todayCompleted} {t('agents.stats.success')}</span>
          <span>{statistics.todayFailed} {t('agents.stats.failures')}</span>
        </div>
      </div>

      {/* Tasks by Type */}
      {Object.keys(tasksByType).length > 0 && (
        <div className="border border-[var(--vscode-panel-border)] rounded-lg p-3">
          <h4 className="text-[11px] font-medium mb-2">{t('agents.stats.byType')}</h4>
          <div className="space-y-1.5">
            {Object.entries(tasksByType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <TaskTypeBar
                  key={type}
                  type={type}
                  count={count}
                  total={completedTasks.length}
                />
              ))}
          </div>
        </div>
      )}

      {/* Total Duration */}
      <div className="text-center p-3 bg-[var(--vscode-input-background)] rounded-lg">
        <div className="text-[9px] text-[var(--vscode-descriptionForeground)] mb-1">
          {t('agents.stats.totalDuration')}
        </div>
        <div className="text-[16px] font-bold">
          {formatDuration(statistics.totalDuration)}
        </div>
      </div>
    </div>
  );
}

/**
 * StatCard - Small statistics card
 */
interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'green' | 'red' | 'gray' | 'blue';
  isText?: boolean;
}

function StatCard({ label, value, icon, color, isText }: StatCardProps) {
  const colorClasses: Record<string, string> = {
    green: 'bg-[var(--vscode-charts-green)]/10 text-[var(--vscode-charts-green)]',
    red: 'bg-[var(--vscode-charts-red)]/10 text-[var(--vscode-charts-red)]',
    gray: 'bg-[var(--vscode-charts-gray)]/10 text-[var(--vscode-charts-gray)]',
    blue: 'bg-[var(--vscode-charts-blue)]/10 text-[var(--vscode-charts-blue)]',
  };

  return (
    <div className="border border-[var(--vscode-panel-border)] rounded-lg p-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`p-1 rounded ${colorClasses[color]}`}>
          {icon}
        </div>
        <span className="text-[9px] text-[var(--vscode-descriptionForeground)]">{label}</span>
      </div>
      <div className={`${isText ? 'text-[14px]' : 'text-[18px]'} font-bold`}>
        {value}
      </div>
    </div>
  );
}

/**
 * SuccessRateBar - Visual success rate indicator
 */
function SuccessRateBar({ rate }: { rate: number }) {
  const getColor = (rate: number): string => {
    if (rate >= 80) return 'bg-[var(--vscode-charts-green)]';
    if (rate >= 50) return 'bg-[var(--vscode-charts-yellow)]';
    return 'bg-[var(--vscode-charts-red)]';
  };

  return (
    <div className="h-2 bg-[var(--vscode-input-background)] rounded-full overflow-hidden">
      <div
        className={`h-full ${getColor(rate)} rounded-full transition-all duration-500`}
        style={{ width: `${rate}%` }}
      />
    </div>
  );
}

/**
 * TaskTypeBar - Horizontal bar showing task type distribution
 */
interface TaskTypeBarProps {
  type: string;
  count: number;
  total: number;
}

function TaskTypeBar({ type, count, total }: TaskTypeBarProps) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  // Type color mapping using VSCode theme variables
  const typeColors: Record<string, string> = {
    image_generation: 'bg-[var(--vscode-charts-purple)]',
    video_generation: 'bg-[var(--vscode-charts-blue)]',
    audio_generation: 'bg-[var(--vscode-charts-green)]',
    text_generation: 'bg-[var(--vscode-charts-yellow)]',
    default: 'bg-[var(--vscode-charts-gray)]',
  };

  const color = typeColors[type] || typeColors.default;

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 text-[9px] truncate">{formatTaskType(type)}</div>
      <div className="flex-1 h-1.5 bg-[var(--vscode-input-background)] rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="w-8 text-right text-[9px] text-[var(--vscode-descriptionForeground)]">
        {count}
      </div>
    </div>
  );
}

/**
 * Format task type for display
 */
function formatTaskType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return '< 1s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export default TaskStatisticsPanel;
