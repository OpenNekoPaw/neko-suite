import { useMemo, useState } from 'react';
import { DASHBOARD_PROJECT_TYPES } from '@neko/shared/types/dashboard-project';
import type { DashboardProject, DashboardProjectType } from '../types';
import { filterAndSortProjects, type ProjectSortKey } from '../projectTableState';

export interface ProjectTableProps {
  readonly projects: readonly DashboardProject[];
  readonly onOpen: (path: string) => void;
  readonly onReveal: (path: string) => void;
}

export function ProjectTable({ projects, onOpen, onReveal }: ProjectTableProps) {
  const [sortKey, setSortKey] = useState<ProjectSortKey>('lastModified');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<DashboardProjectType | 'all'>('all');

  const rows = useMemo(() => {
    return filterAndSortProjects(projects, { query, typeFilter, sortKey });
  }, [projects, query, sortKey, typeFilter]);

  return (
    <section className="panel" aria-label="Projects">
      <div className="table-toolbar">
        <input
          aria-label="Search projects"
          placeholder="Search projects"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Filter by type"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as DashboardProjectType | 'all')}
        >
          <option value="all">All types</option>
          {DASHBOARD_PROJECT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <ColumnHeader label="Name" sortKey="name" active={sortKey} onSort={setSortKey} />
            <ColumnHeader label="Type" sortKey="type" active={sortKey} onSort={setSortKey} />
            <ColumnHeader
              label="Last Modified"
              sortKey="lastModified"
              active={sortKey}
              onSort={setSortKey}
            />
            <ColumnHeader label="Size" sortKey="size" active={sortKey} onSort={setSortKey} />
            <th>Path</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((project) => (
            <tr key={`${project.workspaceFolder}:${project.relativePath}`}>
              <td>{project.name}</td>
              <td>
                <span className="badge">{project.type}</span>
              </td>
              <td>{formatDate(project.lastModified)}</td>
              <td>{formatBytes(project.size)}</td>
              <td className="path-cell">{project.relativePath}</td>
              <td className="actions-cell">
                <button type="button" onClick={() => onOpen(project.relativePath)}>
                  Open
                </button>
                <button type="button" onClick={() => onReveal(project.relativePath)}>
                  Reveal
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-cell">
                No projects match the current filters.
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
      <button className="column-button" type="button" onClick={() => onSort(sortKey)}>
        {label}
        {active === sortKey ? ' ↓' : ''}
      </button>
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
