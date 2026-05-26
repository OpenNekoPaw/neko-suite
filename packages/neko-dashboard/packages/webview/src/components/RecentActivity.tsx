import { Badge, Button } from '@neko/ui/primitives';
import { useTranslation } from '../i18n/I18nContext';
import type { DashboardRecentActivity } from '../types';

export interface RecentActivityProps {
  readonly items: readonly DashboardRecentActivity[];
  readonly onOpen: (path: string) => void;
}

export function RecentActivity({ items, onOpen }: RecentActivityProps) {
  const { t } = useTranslation();

  return (
    <section className="panel" aria-label={t('recent.title')}>
      <h2>{t('recent.title')}</h2>
      <table>
        <thead>
          <tr>
            <th>{t('recent.column.file')}</th>
            <th>{t('recent.column.action')}</th>
            <th>{t('recent.column.time')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.file.workspaceFolder}:${item.file.relativePath}`}>
              <td>
                <Button
                  className="link-button"
                  size="xs"
                  variant="ghost"
                  onClick={() => onOpen(item.file.relativePath)}
                >
                  {item.file.name}
                </Button>
              </td>
              <td>
                <Badge className="h-auto rounded-full px-2 py-0.5">{item.action}</Badge>
              </td>
              <td>{new Date(item.time).toLocaleString()}</td>
            </tr>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={3} className="empty-cell">
                {t('recent.empty')}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
