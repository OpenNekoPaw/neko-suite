import type { DashboardTask } from '@neko/shared';

export interface TaskTableProps {
  readonly tasks: readonly DashboardTask[];
  readonly onCancel: (taskId: string) => void;
  readonly onRetry: (taskId: string) => void;
  readonly onRevealOutput: (taskId: string) => void;
}

export function TaskTable({ tasks, onCancel, onRetry, onRevealOutput }: TaskTableProps) {
  return (
    <section className="panel" aria-label="Tasks">
      <h2>Tasks</h2>
      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>Source</th>
            <th>Type</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Started</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.taskId}>
              <td>{task.title}</td>
              <td>{task.sourceDisplayName ?? task.source}</td>
              <td>
                <span className="badge">{task.kind}</span>
              </td>
              <td>{task.status}</td>
              <td>
                {task.progress === undefined ? (
                  'n/a'
                ) : (
                  <progress max={100} value={task.progress}>
                    {task.progress}%
                  </progress>
                )}
              </td>
              <td>{new Date(task.startedAt).toLocaleString()}</td>
              <td className="actions-cell">
                {task.actions.includes('cancel') ? (
                  <button type="button" onClick={() => onCancel(task.taskId)}>
                    Cancel
                  </button>
                ) : null}
                {task.actions.includes('retry') ? (
                  <button type="button" onClick={() => onRetry(task.taskId)}>
                    Retry
                  </button>
                ) : null}
                {task.actions.includes('reveal-output') ? (
                  <button type="button" onClick={() => onRevealOutput(task.taskId)}>
                    Reveal
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
          {tasks.length === 0 ? (
            <tr>
              <td colSpan={7} className="empty-cell">
                No active tasks.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
