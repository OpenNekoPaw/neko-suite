import { describe, expect, it } from 'vitest';
import { createRecentActivity, normalizePath } from './projectHelpers';
import type { DashboardProject } from './protocol';

const baseProject: DashboardProject = {
  name: 'scene.nkv',
  type: 'video',
  relativePath: 'scene.nkv',
  workspaceFolder: 'workspace',
  lastModified: 100,
  size: 10,
};

describe('projectScanner helpers', () => {
  it('normalizes platform separators to workspace-relative slash paths', () => {
    expect(normalizePath('folder\\scene.nkv')).toBe('folder/scene.nkv');
  });

  it('selects five most recent files for recent activity', () => {
    const projects = Array.from({ length: 7 }, (_, index) => ({
      ...baseProject,
      name: `scene-${index}.nkv`,
      relativePath: `scene-${index}.nkv`,
      lastModified: index,
    }));

    const recent = createRecentActivity(projects);

    expect(recent).toHaveLength(5);
    expect(recent.map((item) => item.file.name)).toEqual([
      'scene-6.nkv',
      'scene-5.nkv',
      'scene-4.nkv',
      'scene-3.nkv',
      'scene-2.nkv',
    ]);
  });
});
