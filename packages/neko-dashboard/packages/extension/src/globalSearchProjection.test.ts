import { describe, expect, it } from 'vitest';
import { registerCommandHandler, vscodeCommandState } from './vscode-test-double';
import { queryProjectGlobalSearch } from '@neko/search/host-vscode';

describe('Dashboard global search projection', () => {
  it('consumes host-projected project search results without cache file access', async () => {
    vscodeCommandState.reset();
    registerCommandHandler('neko.projectSearch.query', (query) => ({
      query,
      context: { projectRoot: '/workspace' },
      freshness: 'fresh',
      partitions: [],
      items: [
        {
          id: 'entity:xiaoju',
          kind: 'creative-entity',
          label: '小橘',
          source: {
            partition: 'creative-entities',
            sourceId: 'xiaoju',
            projectRelativePath: 'characters.json',
          },
          projectRoot: '/workspace',
          searchText: '小橘',
          freshness: 'fresh',
          metadata: { internalCachePath: '.neko/.cache/asset-graph.json' },
        },
      ],
    }));

    const result = await queryProjectGlobalSearch({ text: '小橘', limit: 10 });

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'entity:xiaoju',
        source: expect.objectContaining({ projectRelativePath: 'characters.json' }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('.neko/.cache');
  });
});
