import { describe, expect, it, vi } from 'vitest';
import { NEKO_EXTENSION_IDS, TOOL_NAMES_SYSTEM } from '@neko/shared';
import {
  DEFAULT_PLUGIN_SKILL_PROVIDER_EXTENSION_IDS,
  createPluginSkillDiscoveryTools,
} from '../plugin-skill-discovery-tool';

describe('createPluginSkillDiscoveryTools', () => {
  it('exposes the default Neko plugin skill provider ids outside the Extension layer', () => {
    expect(DEFAULT_PLUGIN_SKILL_PROVIDER_EXTENSION_IDS).toEqual([
      NEKO_EXTENSION_IDS.NEKO_CUT,
      NEKO_EXTENSION_IDS.NEKO_CANVAS,
      NEKO_EXTENSION_IDS.NEKO_STORY,
      NEKO_EXTENSION_IDS.NEKO_SKETCH,
      NEKO_EXTENSION_IDS.NEKO_AUTH,
    ]);
  });

  it('creates a read-only system tool for plugin skill discovery', () => {
    const [tool] = createPluginSkillDiscoveryTools({
      listPluginSkills: vi.fn(async () => []),
    });

    expect(tool?.name).toBe(TOOL_NAMES_SYSTEM.LIST_PLUGIN_SKILLS);
    expect(tool?.category).toBe('system');
    expect(tool?.isReadOnly).toBe(true);
    expect(tool?.isConcurrencySafe).toBe(true);
  });

  it('filters skills by tag and projects catalogue totals', async () => {
    const [tool] = createPluginSkillDiscoveryTools({
      listPluginSkills: vi.fn(async () => [
        {
          extensionId: 'neko.neko-canvas',
          skills: [
            {
              id: 'batch',
              name: 'Batch Generate',
              description: 'Generate images.',
              command: 'neko.canvas.batch',
              tags: ['generation', 'image'],
            },
            {
              id: 'layout',
              name: 'Layout',
              description: 'Arrange nodes.',
              command: 'neko.canvas.layout',
              tags: ['canvas'],
            },
          ],
        },
        {
          extensionId: 'neko.neko-cut',
          skills: [
            {
              id: 'timeline',
              name: 'Timeline',
              description: 'Edit timeline.',
              command: 'neko.cut.timeline',
              tags: ['timeline'],
            },
          ],
        },
      ]),
    });

    await expect(tool!.execute({ tag: 'image' })).resolves.toEqual({
      success: true,
      data: {
        catalogue: [
          {
            extensionId: 'neko.neko-canvas',
            skills: [
              {
                id: 'batch',
                name: 'Batch Generate',
                description: 'Generate images.',
                command: 'neko.canvas.batch',
                tags: ['generation', 'image'],
              },
            ],
          },
        ],
        totalSkills: 1,
      },
    });
  });

  it('returns a failed tool result when the host source throws', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };
    const [tool] = createPluginSkillDiscoveryTools(
      {
        listPluginSkills: vi.fn(async () => {
          throw new Error('source unavailable');
        }),
      },
      logger,
    );

    await expect(tool!.execute({})).resolves.toEqual({
      success: false,
      error: 'source unavailable',
    });
    expect(logger.warn).toHaveBeenCalledWith('ListPluginSkills failed', {
      error: 'source unavailable',
    });
  });
});
