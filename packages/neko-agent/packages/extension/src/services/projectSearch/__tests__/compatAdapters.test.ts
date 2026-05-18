import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createCompatibilityProjectSearchAdapters } from '../compatAdapters';

vi.mock('vscode', async () => await import('../../../__mocks__/vscode'));

interface MockUri {
  readonly fsPath: string;
}

const storyText = `Title: 猫猫上学记

# 第一幕

EXT. 猫猫家门口 - 清晨

@小橘
今天是上学的第一天！

@猫妈妈
围巾忘了！
`;

describe('compatibility project search adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: true,
      exports: {
        parseScript: (content: string) => ({
          elements: parseFixtureScript(content),
        }),
      },
    } as any);
    vi.mocked(vscode.workspace.fs.readFile).mockImplementation(async (uri: { fsPath?: string }) => {
      if (uri.fsPath === '/workspace/cases/test.fountain') {
        return new TextEncoder().encode(storyText);
      }
      return new Uint8Array();
    });
  });

  it('projects script roles and scenes without requiring visual identity', async () => {
    const adapter = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: {
        findFiles: async () => [vscode.Uri.file('/workspace/cases/test.fountain') as MockUri],
      },
      jsonReader: makeJsonReader({}),
    }).find((item) => item.partition === 'story-symbols');

    expect(adapter).toBeDefined();
    const roleItems = await adapter!.query(
      { text: '小橘', projectRoot: '/workspace' },
      { projectRoot: '/workspace' },
    );
    const sceneItems = await adapter!.query(
      { text: '猫猫家门口', projectRoot: '/workspace' },
      { projectRoot: '/workspace' },
    );

    expect(roleItems).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'script-role', label: '小橘' })]),
    );
    expect(sceneItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'story-scene', label: 'EXT. 猫猫家门口 - 清晨' }),
      ]),
    );
  });

  it('projects asset aliases, media files, documents, confirmed entities, and entity requirements', async () => {
    const adapters = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: { findFiles: async () => [] },
      jsonReader: makeJsonReader({
        '/workspace/neko/assets/library.json': {
          entities: [
            {
              id: 'asset-1',
              name: '橘猫参考图',
              aliases: ['小橘'],
              category: 'character',
              variants: [
                { id: 'v1', files: [{ id: 'f1', path: 'assets/xiaoju.png', mediaType: 'image' }] },
              ],
            },
            {
              id: 'asset-doc-1',
              name: '世界观设定集',
              aliases: ['设定集'],
              category: 'document',
              variants: [
                {
                  id: 'v1',
                  files: [{ id: 'doc-file', path: 'docs/world.pdf', mediaType: 'document' }],
                },
              ],
            },
          ],
        },
        '/workspace/.neko/.cache/search-index.json': {
          entries: [
            { filePath: '/media/cat-school.mp4', fileName: 'cat-school.mp4', mediaType: 'video' },
          ],
        },
        '/workspace/.neko/.cache/asset-graph.json': {
          nodes: [{ id: 'node-1', kind: 'entity', refId: '小橘', label: '小橘' }],
        },
        '/workspace/characters.json': {
          characters: [
            {
              id: 'char-mom',
              canonicalName: '猫妈妈',
              displayName: '猫妈妈',
              aliases: ['妈妈猫'],
            },
          ],
        },
        '/workspace/neko/entity-asset-requirements.json': {
          requirements: [
            {
              id: 'req-1',
              entityId: '小灰',
              entityKind: 'character',
              source: 'story',
              sourceRef: 'cases/test.fountain',
              requiredKinds: ['portrait'],
              status: 'missing',
            },
          ],
        },
      }),
    });

    const assetItems = await adapters
      .find((item) => item.partition === 'asset-library')!
      .query({ text: '小橘', projectRoot: '/workspace' }, { projectRoot: '/workspace' });
    const mediaItems = await adapters
      .find((item) => item.partition === 'media-library')!
      .query({ text: 'cat-school', projectRoot: '/workspace' }, { projectRoot: '/workspace' });
    const documentItems = await adapters
      .find((item) => item.partition === 'asset-library')!
      .query({ text: '设定集', projectRoot: '/workspace' }, { projectRoot: '/workspace' });
    const confirmedEntityItems = await adapters
      .find((item) => item.partition === 'creative-entities')!
      .query({ text: '妈妈猫', projectRoot: '/workspace' }, { projectRoot: '/workspace' });
    const candidateItems = await adapters
      .find((item) => item.partition === 'creative-entities')!
      .query({ text: '小灰', projectRoot: '/workspace' }, { projectRoot: '/workspace' });

    expect(assetItems[0]).toEqual(expect.objectContaining({ kind: 'asset', label: '橘猫参考图' }));
    expect(mediaItems[0]).toEqual(
      expect.objectContaining({ kind: 'media', label: 'cat-school.mp4' }),
    );
    expect(documentItems[0]).toEqual(
      expect.objectContaining({ kind: 'document', label: '世界观设定集' }),
    );
    expect(confirmedEntityItems[0]).toEqual(
      expect.objectContaining({ kind: 'creative-entity', label: '猫妈妈' }),
    );
    expect(candidateItems[0]).toEqual(
      expect.objectContaining({ kind: 'entity-candidate', label: '小灰' }),
    );
  });
});

function makeJsonReader(files: Record<string, unknown>) {
  return {
    async read<T>(filePath: string): Promise<T | null> {
      return (files[filePath] as T | undefined) ?? null;
    },
  };
}

function parseFixtureScript(content: string): ReadonlyArray<Record<string, unknown>> {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .flatMap((line) => {
      if (line.startsWith('@')) {
        return [{ type: 'character', text: line.slice(1), name: line.slice(1) }];
      }
      if (/^(INT|EXT|内景|外景)[.\s]/.test(line)) {
        return [{ type: 'scene_heading', text: line, raw: line }];
      }
      if (line.startsWith('#')) {
        return [{ type: 'section', text: line.replace(/^#+\s*/, '') }];
      }
      return [];
    });
}
