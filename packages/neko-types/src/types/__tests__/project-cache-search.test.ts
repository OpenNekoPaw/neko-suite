import { describe, expect, it } from 'vitest';
import {
  isProjectIndexFreshness,
  isProjectSearchCacheManifest,
  isProjectSearchItem,
  isProjectSearchItemKind,
  isProjectSearchPartitionKind,
  isProjectSearchQuery,
  type ProjectSearchItem,
  type ProjectSearchQuery,
} from '../project-cache-search';

describe('project cache/search contracts', () => {
  it('validates enum-like project search fields', () => {
    expect(isProjectSearchItemKind('script-role')).toBe(true);
    expect(isProjectSearchItemKind('file')).toBe(false);
    expect(isProjectSearchPartitionKind('asset-library')).toBe(true);
    expect(isProjectSearchPartitionKind('asset-cache')).toBe(false);
    expect(isProjectIndexFreshness('fresh')).toBe(true);
    expect(isProjectIndexFreshness('unknown')).toBe(false);
  });

  it('accepts typed search queries with optional context and filters', () => {
    const query: ProjectSearchQuery = {
      text: '小橘',
      contextFilePath: '${PROJECT}/cases/test.fountain',
      kinds: ['script-role', 'entity-candidate'],
      limit: 20,
      freshness: 'allow-stale',
    };

    expect(isProjectSearchQuery(query)).toBe(true);
    expect(isProjectSearchQuery({ ...query, kinds: ['file'] })).toBe(false);
    expect(isProjectSearchQuery({ text: 123 })).toBe(false);
  });

  it('represents normalized search items with source and freshness metadata', () => {
    const item: ProjectSearchItem = {
      id: 'script-role:/workspace/cases/test.fountain:小橘',
      kind: 'script-role',
      label: '小橘',
      description: 'Script role',
      source: {
        partition: 'story-symbols',
        sourceKind: 'fountain',
        filePath: '/workspace/cases/test.fountain',
      },
      projectRoot: '/workspace',
      filePath: '/workspace/cases/test.fountain',
      canonicalName: '小橘',
      aliases: [],
      searchText: '小橘 Script role /workspace/cases/test.fountain',
      freshness: 'fresh',
    };

    expect(isProjectSearchItem(item)).toBe(true);
    expect(isProjectSearchItem({ ...item, freshness: 'old' })).toBe(false);
  });

  it('validates cache manifests with partition generation metadata', () => {
    expect(
      isProjectSearchCacheManifest({
        version: 1,
        projectRoot: '/workspace',
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
        generation: 3,
        sourceIdentity: 'workspace:123',
        partitions: [
          {
            partition: 'asset-library',
            version: 1,
            generation: 3,
            freshness: 'fresh',
            itemCount: 12,
            sourceIdentity: 'asset-library:mtime',
            updatedAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      }),
    ).toBe(true);
    expect(
      isProjectSearchCacheManifest({
        version: 1,
        projectRoot: '/workspace',
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
        generation: 3,
        partitions: [{ partition: 'unknown' }],
      }),
    ).toBe(false);
  });
});
