import type { DashboardProject, DashboardProjectType } from './types';

export type ProjectSortKey = 'name' | 'type' | 'lastModified' | 'size';

export function filterAndSortProjects(
  projects: readonly DashboardProject[],
  options: {
    readonly query: string;
    readonly typeFilter: DashboardProjectType | 'all';
    readonly sortKey: ProjectSortKey;
  },
): DashboardProject[] {
  const normalizedQuery = options.query.trim().toLowerCase();

  return [...projects]
    .filter((project) => options.typeFilter === 'all' || project.type === options.typeFilter)
    .filter((project) => {
      if (!normalizedQuery) return true;
      return (
        project.name.toLowerCase().includes(normalizedQuery) ||
        project.relativePath.toLowerCase().includes(normalizedQuery)
      );
    })
    .sort((a, b) => compareProjects(a, b, options.sortKey));
}

function compareProjects(
  a: DashboardProject,
  b: DashboardProject,
  sortKey: ProjectSortKey,
): number {
  switch (sortKey) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'type':
      return a.type.localeCompare(b.type);
    case 'size':
      return b.size - a.size;
    case 'lastModified':
      return b.lastModified - a.lastModified;
  }
}
