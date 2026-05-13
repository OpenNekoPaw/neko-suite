import type { MessageBundle } from '@neko/shared';

export const projects = {
  'projects.search': 'Search projects',
  'projects.filterByType': 'Filter by type',
  'projects.column.name': 'Name',
  'projects.column.type': 'Type',
  'projects.column.lastModified': 'Last Modified',
  'projects.column.size': 'Size',
  'projects.column.path': 'Path',
  'projects.column.actions': 'Actions',
  'projects.empty': 'No projects match the current filters.',
} as const satisfies MessageBundle;
