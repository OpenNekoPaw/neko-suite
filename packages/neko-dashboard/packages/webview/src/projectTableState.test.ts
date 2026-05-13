import { describe, expect, it } from 'vitest';
import { filterAndSortProjects } from './projectTableState';
import type { DashboardProject } from './types';

const projects: readonly DashboardProject[] = [
  {
    name: 'b.nkc',
    type: 'canvas',
    relativePath: 'boards/b.nkc',
    workspaceFolder: 'workspace',
    lastModified: 2,
    size: 20,
  },
  {
    name: 'a.nkv',
    type: 'video',
    relativePath: 'cuts/a.nkv',
    workspaceFolder: 'workspace',
    lastModified: 3,
    size: 10,
  },
  {
    name: 'c.nka',
    type: 'audio',
    relativePath: 'audio/c.nka',
    workspaceFolder: 'workspace',
    lastModified: 1,
    size: 30,
  },
];

describe('project table state', () => {
  it('sorts by last modified descending', () => {
    const rows = filterAndSortProjects(projects, {
      query: '',
      typeFilter: 'all',
      sortKey: 'lastModified',
    });

    expect(rows.map((project) => project.name)).toEqual(['a.nkv', 'b.nkc', 'c.nka']);
  });

  it('filters by project type', () => {
    const rows = filterAndSortProjects(projects, {
      query: '',
      typeFilter: 'canvas',
      sortKey: 'name',
    });

    expect(rows.map((project) => project.name)).toEqual(['b.nkc']);
  });

  it('searches by relative path', () => {
    const rows = filterAndSortProjects(projects, {
      query: 'audio/',
      typeFilter: 'all',
      sortKey: 'name',
    });

    expect(rows.map((project) => project.name)).toEqual(['c.nka']);
  });
});
