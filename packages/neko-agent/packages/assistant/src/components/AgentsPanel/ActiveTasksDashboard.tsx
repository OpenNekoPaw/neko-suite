/**
 * ActiveTasksDashboard - Real-time progress dashboard for active tasks
 *
 * Features:
 * - Circular progress indicators
 * - Parallel task group aggregation
 * - Live status updates with phase indicators
 * - Cancel functionality
 */

import { useTranslation } from '@/i18n/I18nContext';
import type { BackgroundTask } from '@/components/TaskListView';
import type { ActiveTasksDashboardProps, ParallelTaskGroup } from './types';

export function ActiveTasksDashboard({
  tasks,
  parallelGroups = [],
  onCancelTask,
  onViewResult,
}: ActiveTasksDashboardProps) {
  const { t } = useTranslation();

  if (tasks.length === 0 && parallelGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--vscode-descriptionForeground)]">
        <svg className="w-12 h-12 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <p className="text-[11px]">{t('agents.noActiveTasks')}</p>
        <p className="text-[9px] mt-1">{t('agents.noActiveTasksHint')}</p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-3">
      {/* Parallel Task Groups */}
      {parallelGroups.map((group) => (
        <ParallelGroupCard
          key={group.id}
          group={group}
          tasks={tasks.filter(t => group.taskIds.includes(t.id))}
          onCancelTask={onCancelTask}
        />
      ))}

      {/* Individual Active Tasks (not in groups) */}
      {tasks
        .filter(t => !parallelGroups.some(g => g.taskIds.includes(t.id)))
        .map((task) => (
          <ActiveTaskCard
            key={task.id}
            task={task}
            onCancel={() => onCancelTask(task.id)}
            onViewResult={() => onViewResult(task.id)}
          />
        ))}
    </div>
  );
}

/**
 * ParallelGroupCard - Card showing multiple parallel tasks
 */
interface ParallelGroupCardProps {
  group: ParallelTaskGroup;
  tasks: BackgroundTask[];
  onCancelTask: (taskId: string) => void;
}

function ParallelGroupCard({ group, tasks, onCancelTask }: ParallelGroupCardProps) {
  const { t } = useTranslation();
  const totalTasks = group.taskIds.length;

  return (
    <div className="border border-[var(--vscode-panel-border)] rounded-lg overflow-hidden">
      {/* Group Header */}
      <div className="flex items-center justify-between p-2 bg-[var(--vscode-sideBar-background)]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[var(--vscode-button-background)] flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-[var(--vscode-button-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </div>
          <div>
            <div className="text-[11px] font-medium">{group.name}</div>
            <div className="text-[9px] text-[var(--vscode-descriptionForeground)]">
              {group.completedCount}/{totalTasks} {t('agents.completed')}
              {group.failedCount > 0 && (
                <span className="text-[var(--vscode-errorForeground)]"> • {group.failedCount} {t('agents.failed')}</span>
              )}
            </div>
          </div>
        </div>

        {/* Overall Progress */}
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-medium">{Math.round(group.overallProgress)}%</div>
          <CircularProgress progress={group.overallProgress} size={28} strokeWidth={3} />
        </div>
      </div>

      {/* Individual Tasks in Group */}
      <div className="divide-y divide-[var(--vscode-panel-border)]">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2 p-2">
            <TaskStatusDot status={task.status} />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] truncate">{task.name}</div>
            </div>
            <div className="text-[9px] text-[var(--vscode-descriptionForeground)]">
              {task.progress}%
            </div>
            <button
              onClick={() => onCancelTask(task.id)}
              className="p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
              title={t('common.cancel')}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * ActiveTaskCard - Single active task card with detailed progress
 */
interface ActiveTaskCardProps {
  task: BackgroundTask;
  onCancel: () => void;
  onViewResult: () => void;
}

function ActiveTaskCard({ task, onCancel }: ActiveTaskCardProps) {
  const { t } = useTranslation();
  const progress = task.progress || 0;

  // Get phase from task metadata if available
  const phase = (task as BackgroundTask & { phase?: string }).phase || 'executing';
  const phaseLabel = getPhaseLabel(phase, t);

  return (
    <div className="border border-[var(--vscode-panel-border)] rounded-lg p-3 hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <CircularProgress progress={progress} size={32} strokeWidth={3} />
          <div>
            <div className="text-[11px] font-medium">{task.name}</div>
            <div className="flex items-center gap-1.5 text-[9px] text-[var(--vscode-descriptionForeground)]">
              <span className="px-1 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
                {task.type}
              </span>
              <span>•</span>
              <span className="flex items-center gap-0.5">
                <PhaseDot phase={phase} />
                {phaseLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Cancel button */}
        <button
          onClick={onCancel}
          className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
          title={t('common.cancel')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 bg-[var(--vscode-input-background)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--vscode-progressBar-background)] rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Progress Text */}
      <div className="flex justify-between mt-1.5 text-[9px] text-[var(--vscode-descriptionForeground)]">
        <span>{progress}% {t('agents.complete')}</span>
        {task.eta && <span>ETA: {formatETA(task.eta)}</span>}
      </div>

      {/* Current Step (if available) */}
      {task.currentStepId && (
        <div className="mt-2 p-1.5 bg-[var(--vscode-input-background)] rounded text-[9px]">
          <span className="opacity-60">{t('agents.currentStep')}:</span> {task.currentStepId}
        </div>
      )}
    </div>
  );
}

/**
 * CircularProgress - Circular progress indicator
 */
interface CircularProgressProps {
  progress: number;
  size: number;
  strokeWidth: number;
}

function CircularProgress({ progress, size, strokeWidth }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--vscode-input-background)"
        strokeWidth={strokeWidth}
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--vscode-progressBar-background)"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300"
      />
    </svg>
  );
}

/**
 * TaskStatusDot - Small status indicator
 */
function TaskStatusDot({ status }: { status: BackgroundTask['status'] }) {
  const colors: Record<string, string> = {
    processing: 'bg-[var(--vscode-charts-blue)] animate-pulse',
    queued: 'bg-[var(--vscode-charts-yellow)]',
    completed: 'bg-[var(--vscode-charts-green)]',
    failed: 'bg-[var(--vscode-charts-red)]',
    cancelled: 'bg-[var(--vscode-charts-gray)]',
  };

  return (
    <div className={`w-2 h-2 rounded-full ${colors[status] || 'bg-[var(--vscode-charts-gray)]'}`} />
  );
}

/**
 * PhaseDot - Phase indicator dot
 */
function PhaseDot({ phase }: { phase: string }) {
  const colors: Record<string, string> = {
    idle: 'bg-[var(--vscode-charts-gray)]',
    thinking: 'bg-[var(--vscode-charts-purple)] animate-pulse',
    executing: 'bg-[var(--vscode-charts-blue)] animate-pulse',
    waiting: 'bg-[var(--vscode-charts-yellow)]',
    paused: 'bg-[var(--vscode-charts-orange)]',
    completed: 'bg-[var(--vscode-charts-green)]',
    failed: 'bg-[var(--vscode-charts-red)]',
  };

  return (
    <div className={`w-1.5 h-1.5 rounded-full ${colors[phase] || 'bg-[var(--vscode-charts-gray)]'}`} />
  );
}

/**
 * Get human-readable phase label
 */
function getPhaseLabel(phase: string, t: (key: string) => string): string {
  const labels: Record<string, string> = {
    idle: t('agents.phase.idle'),
    thinking: t('agents.phase.thinking'),
    executing: t('agents.phase.executing'),
    waiting: t('agents.phase.waiting'),
    paused: t('agents.phase.paused'),
    completed: t('agents.phase.completed'),
    failed: t('agents.phase.failed'),
  };
  return labels[phase] || phase;
}

/**
 * Format ETA in human-readable format
 */
function formatETA(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export default ActiveTasksDashboard;
