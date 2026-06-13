import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { PROJECT_SEARCH_QUERY_COMMAND } from '@neko/search/host-vscode';
import { searchProjectMentionCandidates } from '../projectMentionSearch';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

describe('projectMentionSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.window.activeTextEditor = {
      document: { uri: vscode.Uri.file('/workspace/cases/test.fountain') },
    } as any;
  });

  it('queries the project search service and maps shared items to mention candidates', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue({
      items: [
        {
          id: 'script-role:/workspace/cases/test.fountain:小橘',
          kind: 'script-role',
          label: '小橘',
          description: 'Script role',
          icon: '@',
          source: {
            partition: 'story-symbols',
            sourceId: '小橘',
            sourceKind: 'script-role',
          },
          projectRoot: '/workspace',
          filePath: '/workspace/cases/test.fountain',
          searchText: '小橘',
          freshness: 'fresh',
        },
        {
          id: 'asset:asset-1',
          kind: 'asset',
          label: '橘猫参考图',
          description: 'Asset',
          icon: '🎭',
          source: {
            partition: 'asset-library',
            sourceId: 'asset-1',
            sourceKind: 'character',
          },
          projectRoot: '/workspace',
          filePath: 'assets/xiaoju.png',
          searchText: '橘猫参考图 小橘',
          freshness: 'fresh',
          metadata: { mediaType: 'image', entityType: 'character' },
          visualResource: {
            projectedUri: 'webview:/workspace/.neko/.cache/resources/thumbnails/asset-1.jpg',
            status: 'ready',
            alt: '橘猫参考图',
          },
        },
        {
          id: 'entity-requirement:req-1',
          kind: 'entity-candidate',
          label: '小灰',
          description: 'Missing portrait',
          source: {
            partition: 'creative-entities',
            sourceId: 'req-1',
            sourceKind: 'entity-asset-requirement',
          },
          projectRoot: '/workspace',
          searchText: '小灰 portrait',
          freshness: 'fresh',
          metadata: { entityType: 'character' },
        },
        {
          id: 'entity:scene:scene-narration',
          kind: 'creative-entity',
          label: '讲述',
          description: 'scene · confirmed',
          source: {
            partition: 'creative-entities',
            sourceId: 'neko-entity',
            sourceKind: 'registry',
            refId: 'scene-narration',
            metadata: { entityKind: 'scene', status: 'confirmed' },
          },
          projectRoot: '/workspace',
          canonicalName: '讲述',
          aliases: ['旁白段落'],
          searchText: '讲述 旁白段落 scene confirmed',
          freshness: 'fresh',
        },
      ],
      partitions: [],
      freshness: 'fresh',
      context: { projectRoot: '/workspace' },
      query: { text: '小橘' },
    });

    const candidates = await searchProjectMentionCandidates({
      includePattern: '**/*小橘*',
      excludePattern: '**/node_modules/**',
      limit: 30,
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      PROJECT_SEARCH_QUERY_COMMAND,
      expect.objectContaining({
        text: '小橘',
        contextFilePath: '/workspace/cases/test.fountain',
      }),
    );
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'character',
          label: '小橘',
          source: 'story',
        }),
        expect.objectContaining({
          type: 'asset',
          label: '橘猫参考图',
          source: 'asset-library',
          mediaType: 'image',
          thumbnailUri: 'webview:/workspace/.neko/.cache/resources/thumbnails/asset-1.jpg',
          entityType: 'character',
          navigationData: expect.objectContaining({
            assetId: 'asset-1',
            partition: 'asset-library',
            sourceId: 'asset-1',
          }),
        }),
        expect.objectContaining({
          type: 'entity',
          label: '小灰',
          source: 'entity-graph',
          entityType: 'character',
        }),
        expect.objectContaining({
          type: 'entity',
          label: '讲述',
          source: 'entity-graph',
          entityType: 'scene',
        }),
      ]),
    );
    expect(candidates[0]?.navigationData).toEqual(
      expect.objectContaining({
        partition: 'story-symbols',
        freshness: 'fresh',
      }),
    );
  });
});
