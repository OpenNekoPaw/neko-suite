import { describe, expect, it } from 'vitest';
import type { ToolGroup } from '@neko/shared';
import { projectRuntimeToolGroups } from '../tool-group-projector';

describe('tool group projector', () => {
  it('projects runtime tool groups into config/UI-safe copies', () => {
    const group: ToolGroup = {
      name: 'media',
      description: 'Media tools',
      tools: ['GenerateImage'],
      dependencies: ['core'],
      source: 'builtin',
      enabled: true,
      loadingTier: 'eager',
    };
    const projected = projectRuntimeToolGroups({ list: () => [group] });

    expect(projected).toEqual([group]);
    expect(projected[0]).not.toBe(group);
    expect(projected[0]?.tools).not.toBe(group.tools);
    expect(projected[0]?.dependencies).not.toBe(group.dependencies);
  });

  it('returns an empty list when the runtime registry is unavailable', () => {
    expect(projectRuntimeToolGroups(undefined)).toEqual([]);
  });
});
