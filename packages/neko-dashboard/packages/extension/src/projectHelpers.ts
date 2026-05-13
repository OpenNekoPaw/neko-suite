import * as path from 'path';
import type { DashboardProject } from './protocol';

export function createRecentActivity(projects: readonly DashboardProject[]) {
  return [...projects]
    .sort((a, b) => b.lastModified - a.lastModified)
    .slice(0, 5)
    .map((file) => ({
      file,
      action: 'modified' as const,
      time: file.lastModified,
    }));
}

export function normalizePath(value: string): string {
  return value.split(path.sep).join('/').replaceAll('\\', '/');
}
