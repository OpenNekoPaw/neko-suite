import { useMemo } from 'react';
import type { DashboardTask } from '@neko/shared';
import { Badge, Button, Progress } from '@neko/ui/primitives';
import { useTranslation } from '../i18n/I18nContext';

export interface TaskTableProps {
  readonly tasks: readonly DashboardTask[];
  readonly onCancel: (taskId: string) => void;
  readonly onRetry: (taskId: string) => void;
  readonly onRevealOutput: (taskId: string) => void;
}

export function TaskTable({ tasks, onCancel, onRetry, onRevealOutput }: TaskTableProps) {
  const { t } = useTranslation();

  const { running, queued, completed } = useMemo(() => {
    const lanes = {
      running: [] as DashboardTask[],
      queued: [] as DashboardTask[],
      completed: [] as DashboardTask[],
    };
    for (const task of tasks) {
      if (task.status === 'running') lanes.running.push(task);
      else if (task.status === 'queued') lanes.queued.push(task);
      else lanes.completed.push(task);
    }
    return lanes;
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <section className="panel" aria-label={t('tasks.title')}>
        <h2>{t('tasks.title')}</h2>
        <p className="empty-cell">{t('tasks.empty')}</p>
      </section>
    );
  }

  return (
    <section className="panel" aria-label={t('tasks.title')}>
      <h2>{t('tasks.title')}</h2>
      <div className="task-board">
        {queued.length > 0 ? (
          <TaskLane
            label={t('tasks.lane.queued', { count: queued.length })}
            tasks={queued}
            onCancel={onCancel}
            onRetry={onRetry}
            onRevealOutput={onRevealOutput}
          />
        ) : null}
        {running.length > 0 ? (
          <TaskLane
            label={t('tasks.lane.running', { count: running.length })}
            tasks={running}
            onCancel={onCancel}
            onRetry={onRetry}
            onRevealOutput={onRevealOutput}
          />
        ) : null}
        {completed.length > 0 ? (
          <TaskLane
            label={t('tasks.lane.completed', { count: completed.length })}
            tasks={completed}
            onCancel={onCancel}
            onRetry={onRetry}
            onRevealOutput={onRevealOutput}
          />
        ) : null}
      </div>
    </section>
  );
}

interface TaskLaneProps {
  readonly label: string;
  readonly tasks: readonly DashboardTask[];
  readonly onCancel: (taskId: string) => void;
  readonly onRetry: (taskId: string) => void;
  readonly onRevealOutput: (taskId: string) => void;
}

function TaskLane({ label, tasks, onCancel, onRetry, onRevealOutput }: TaskLaneProps) {
  const { t } = useTranslation();

  return (
    <div className="task-lane">
      <div className="task-lane-header">{label}</div>
      <div className="task-cards">
        {tasks.map((task) => (
          <div key={task.taskId} className="task-card">
            <div className="task-card-title">{task.title}</div>
            <div className="task-card-meta">
              <Badge className="mr-1 h-auto rounded-full px-2 py-0.5">{task.kind}</Badge>
              {task.sourceDisplayName ?? task.source}
            </div>
            {task.progress !== undefined ? (
              <Progress label={task.title} value={task.progress} />
            ) : null}
            <div className="task-card-actions">
              {task.actions.includes('cancel') ? (
                <Button size="xs" variant="secondary" onClick={() => onCancel(task.taskId)}>
                  {t('common.cancel')}
                </Button>
              ) : null}
              {task.actions.includes('retry') ? (
                <Button size="xs" onClick={() => onRetry(task.taskId)}>
                  {t('common.retry')}
                </Button>
              ) : null}
              {task.actions.includes('reveal-output') ? (
                <Button size="xs" variant="ghost" onClick={() => onRevealOutput(task.taskId)}>
                  {t('common.reveal')}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
