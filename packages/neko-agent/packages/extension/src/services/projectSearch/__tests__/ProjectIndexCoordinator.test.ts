import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ProjectSearchAdapter, ProjectSearchItem } from '@neko/shared';
import { ProjectIndexCoordinator } from '../ProjectIndexCoordinator';

vi.mock('vscode', async () => await import('../../../__mocks__/vscode'));
vi.mock('../../../base', () => ({
  getLogger: () => ({
    warn: vi.fn(),
  }),
}));
vi.mock('../projectResolver', () => ({
  resolveProjectSearchContext: vi.fn(async (query: { projectRoot?: string }) => ({
    projectRoot: query.projectRoot ?? '/mock/workspace',
    fallbackDerived: !query.projectRoot,
  })),
}));

describe('ProjectIndexCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.workspaceFolders = [
      { uri: { fsPath: '/mock/workspace' }, name: 'mock', index: 0 },
    ] as any;
  });

  it('fans out queries, ranks results, and keeps partition failures isolated', async () => {
    const coordinator = new ProjectIndexCoordinator();
    coordinator.registerAdapter(
      makeAdapter('asset-library', [
        makeItem('asset-1', 'asset', '小橘 portrait', 'asset-library', 5),
      ]),
    );
    coordinator.registerAdapter(makeFailingAdapter('media-library'));

    const result = await coordinator.query({
      text: '小橘',
      projectRoot: '/mock/workspace',
      limit: 10,
      freshness: 'allow-stale',
    });

    expect(result.items.map((item) => item.id)).toEqual(['asset-1']);
    expect(result.freshness).toBe('partial');
    expect(result.partitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ partition: 'asset-library', status: 'ready' }),
        expect.objectContaining({ partition: 'media-library', status: 'failed' }),
      ]),
    );
  });

  it('supports fresh-only queries', async () => {
    const coordinator = new ProjectIndexCoordinator();
    coordinator.registerAdapter(
      makeAdapter('media-library', [
        { ...makeItem('media-1', 'media', 'stale clip', 'media-library', 0), freshness: 'stale' },
        makeItem('media-2', 'media', 'fresh clip', 'media-library', 0),
      ]),
    );

    const result = await coordinator.query({
      text: 'clip',
      projectRoot: '/mock/workspace',
      freshness: 'fresh-only',
    });

    expect(result.items.map((item) => item.id)).toEqual(['media-2']);
  });
});

function makeAdapter(
  partition: ProjectSearchAdapter['partition'],
  items: readonly ProjectSearchItem[],
): ProjectSearchAdapter {
  return {
    partition,
    ensureInitialized: vi.fn(async () => undefined),
    query: vi.fn(async () => items),
    getStatus: () => ({
      partition,
      status: 'ready',
      freshness: 'fresh',
      itemCount: items.length,
    }),
  };
}

function makeFailingAdapter(partition: ProjectSearchAdapter['partition']): ProjectSearchAdapter {
  return {
    partition,
    ensureInitialized: vi.fn(async () => undefined),
    query: vi.fn(async () => {
      throw new Error('boom');
    }),
    getStatus: () => ({
      partition,
      status: 'failed',
      freshness: 'failed',
      error: 'boom',
    }),
  };
}

function makeItem(
  id: string,
  kind: ProjectSearchItem['kind'],
  label: string,
  partition: ProjectSearchAdapter['partition'],
  priority: number,
): ProjectSearchItem {
  return {
    id,
    kind,
    label,
    source: { partition },
    projectRoot: '/mock/workspace',
    searchText: label,
    scoreHints: { priority },
    freshness: 'fresh',
  };
}
