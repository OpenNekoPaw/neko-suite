import type { DashboardRecentActivity } from '../types';

export interface RecentActivityProps {
  readonly items: readonly DashboardRecentActivity[];
  readonly onOpen: (path: string) => void;
}

export function RecentActivity({ items, onOpen }: RecentActivityProps) {
  return (
    <section className="panel" aria-label="Recent activity">
      <h2>Recent Activity</h2>
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Action</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.file.workspaceFolder}:${item.file.relativePath}`}>
              <td>
                <button
                  className="link-button"
                  type="button"
                  onClick={() => onOpen(item.file.relativePath)}
                >
                  {item.file.name}
                </button>
              </td>
              <td>
                <span className="badge">{item.action}</span>
              </td>
              <td>{new Date(item.time).toLocaleString()}</td>
            </tr>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={3} className="empty-cell">
                No recent project activity.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
