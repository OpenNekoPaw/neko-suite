import { useMemo, useState } from 'react';
import { DASHBOARD_PROJECT_TYPES } from '@neko/shared/types/dashboard-project';
import { Badge, Button, Select } from '@neko/ui/primitives';
import { useTranslation } from '../i18n/I18nContext';
import type { DashboardProject, DashboardProjectType } from '../types';
import { filterAndSortProjects, type ProjectSortKey } from '../projectTableState';

export interface ProjectTableProps {
  readonly projects: readonly DashboardProject[];
  readonly onOpen: (path: string) => void;
  readonly onReveal: (path: string) => void;
}

export function ProjectTable({ projects, onOpen, onReveal }: ProjectTableProps) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<ProjectSortKey>('lastModified');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<DashboardProjectType | 'all'>('all');

  const rows = useMemo(() => {
    return filterAndSortProjects(projects, { query, typeFilter, sortKey });
  }, [projects, query, sortKey, typeFilter]);

  return (
    <section className="panel" aria-label={t('projects.column.name')}>
      <div className="table-toolbar">
        <input
          aria-label={t('projects.search')}
          placeholder={t('projects.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select
          label={t('projects.filterByType')}
          value={typeFilter}
          options={[
            { value: 'all', label: t('common.allTypes') },
            ...DASHBOARD_PROJECT_TYPES.map((type) => ({ value: type, label: type })),
          ]}
          onValueChange={(value) => setTypeFilter(value as DashboardProjectType | 'all')}
        />
      </div>
      <table>
        <thead>
          <tr>
            <ColumnHeader
              label={t('projects.column.name')}
              sortKey="name"
              active={sortKey}
              onSort={setSortKey}
            />
            <ColumnHeader
              label={t('projects.column.type')}
              sortKey="type"
              active={sortKey}
              onSort={setSortKey}
            />
            <ColumnHeader
              label={t('projects.column.lastModified')}
              sortKey="lastModified"
              active={sortKey}
              onSort={setSortKey}
            />
            <ColumnHeader
              label={t('projects.column.size')}
              sortKey="size"
              active={sortKey}
              onSort={setSortKey}
            />
            <th>{t('projects.column.path')}</th>
            <th>{t('projects.column.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((project) => (
            <tr key={`${project.workspaceFolder}:${project.relativePath}`}>
              <td>{project.name}</td>
              <td>
                <Badge className="h-auto rounded-full px-2 py-0.5">{project.type}</Badge>
              </td>
              <td>{formatDate(project.lastModified)}</td>
              <td>{formatBytes(project.size)}</td>
              <td className="path-cell">{project.relativePath}</td>
              <td className="actions-cell">
                <Button size="xs" onClick={() => onOpen(project.relativePath)}>
                  {t('common.open')}
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => onReveal(project.relativePath)}
                >
                  {t('common.reveal')}
                </Button>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-cell">
                {t('projects.empty')}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

interface ColumnHeaderProps {
  readonly label: string;
  readonly sortKey: ProjectSortKey;
  readonly active: ProjectSortKey;
  readonly onSort: (key: ProjectSortKey) => void;
}

function ColumnHeader({ label, sortKey, active, onSort }: ColumnHeaderProps) {
  return (
    <th>
      <Button
        className="column-button h-auto px-0"
        size="xs"
        variant="ghost"
        onClick={() => onSort(sortKey)}
      >
        {label}
        {active === sortKey ? ' ↓' : ''}
      </Button>
    </th>
  );
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString();
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
