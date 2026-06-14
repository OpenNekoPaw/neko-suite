import { describe, expect, it } from 'vitest';
import { parseCompositeContentJson, type ContentBlock, type ToolCall } from '@neko-agent/types';
import { projectCompositeBlockRichContent } from '../composite-content-presenter';
import { projectStoryboardTableTransferPayload } from '../storyboard-transfer-presenter';

describe('composite content presenter', () => {
  it('projects storyboard rows from backfilled tool result assets', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        sections: [
          {
            heading: 'Shot 1',
            content: 'Wide establishing frame',
            layout: 'table-row',
            mediaRefs: [{ toolCallId: 'call-1', assetIndex: 0, caption: 'Wide', role: 'shot' }],
          },
        ],
      },
      siblingBlocks: [toolBlock(makeImageToolCall())],
    });

    expect(projection.kind).toBe('storyboard-table');
    expect(projection.data.sections).toMatchObject([
      {
        heading: 'Shot 1',
        content: 'Wide establishing frame',
        media: [
          {
            toolCallId: 'call-1',
            type: 'image',
            src: 'webview://asset-1.png',
            assetId: 'asset-1',
            stableUri: '${WORKSPACE}/.neko/generated/image/out.png',
            localPath: '/repo/.neko/generated/image/out.png',
            caption: 'Wide',
            role: 'shot',
          },
        ],
        diagnostics: [],
      },
    ]);
  });

  it('preserves semantic storyboard diagnostics for rich rendering and transfer gating', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Broken',
        storyboardDiagnostics: [
          {
            severity: 'error',
            code: 'missing-required-field',
            path: ['scenes', 0, 'shots', 0, 'visualDescription'],
            message: 'Missing required storyboard field visualDescription.',
          },
        ],
        sections: [
          {
            heading: 'Storyboard validation failed',
            content: '[error] missing-required-field',
          },
        ],
      },
    });

    expect(projection.kind).toBe('storyboard-table');
    expect(projection.data.storyboardDiagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'missing-required-field',
      }),
    ]);
  });

  it('embeds omitted semantic storyboard row media refs from sibling image tool results', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          schemaVersion: 1,
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 1',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'The title page appears.',
                  characterAction: 'Static title card.',
                  imageStrategy: 'use-as-reference',
                },
              ],
            },
          ],
        },
        sections: [
          {
            heading: 'Page 1 / Shot 1',
            content: 'The title page appears.',
            layout: 'table-row',
            mediaRefs: [
              {
                toolCallId: 'ReadImage-vision-pages-1-10',
                assetIndex: 0,
                caption: 'Page 1',
              },
            ],
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-image',
          name: 'ReadImage',
          arguments: {},
          result: {
            success: true,
            data: {
              images: [
                {
                  path: '/cache/page-1.jpg',
                  webviewUri: 'webview://page-1.jpg',
                  label: 'Page 1',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.storyboardTable?.scenes[0]?.shots[0]?.sourceMediaRefs).toEqual([
      {
        refId: 'tool-result:read-image:0',
        role: 'source',
        locator: {
          type: 'tool-result',
          toolCallId: 'read-image',
          assetIndex: 0,
        },
        label: 'Page 1',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({
        toolCallId: 'read-image',
        type: 'image',
        src: 'webview://page-1.jpg',
        localPath: '/cache/page-1.jpg',
        caption: 'Page 1',
        role: 'source',
      }),
    ]);

    const payload = projectStoryboardTableTransferPayload(projection.data);
    expect(payload).toMatchObject({
      kind: 'canvasStoryboard',
      storyboard: {
        scenes: [
          {
            shotPlans: [
              {
                referenceImagePath: '/cache/page-1.jpg',
              },
            ],
          },
        ],
      },
    });
  });

  it('projects composite artifact storyboard, entity contribution, and source images together', () => {
    const contribution = {
      contributionId: 'contribution-page-1',
      sourcePackage: 'neko-agent',
      sourceRef: { kind: 'tool-result', toolCallId: 'read-doc', assetIndex: 0 },
      reviewPolicy: 'requires-user-review',
      entityCandidates: [
        {
          id: 'candidate-rin',
          kind: 'character',
          name: 'Rin',
          status: 'open',
          identityBasis: 'user-named',
          provenance: [
            {
              providerId: 'neko-agent',
              sourceKind: 'agent',
              sourceRef: 'read-doc#0',
            },
          ],
          sourceRefs: ['read-doc#0'],
        },
      ],
    };
    const composites = parseCompositeContentJson(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'composite-artifact',
        artifactId: 'artifact-storyboard',
        title: 'Comic artifact',
        extensions: {
          'neko.entityMemoryContributionPayload': contribution,
        },
        blocks: [
          {
            blockId: 'storyboard-domain',
            kind: 'domain',
            title: 'Storyboard Payload',
            domainKind: 'StoryboardTable',
            schemaVersion: 1,
            payload: {
              schemaVersion: 1,
              kind: 'storyboard-table',
              title: 'Opening',
              scenes: [
                {
                  sceneId: 'scene-1',
                  sceneTitle: 'Page 1',
                  shots: [
                    {
                      shotNumber: 1,
                      duration: 3,
                      visualDescription: 'Panel action and composition.',
                      characterAction: 'Rin enters the frame.',
                      imageStrategy: 'use-as-reference',
                      sourceMediaRefs: [
                        {
                          refId: 'source-panel-1',
                          role: 'source',
                          locator: {
                            type: 'tool-result',
                            toolCallId: 'read-doc',
                            assetIndex: 0,
                          },
                          label: 'Original panel',
                          mimeType: 'image/jpeg',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      }),
    );
    const composite = composites[0];
    if (!composite) throw new Error('expected composite');

    const projection = projectCompositeBlockRichContent({
      composite,
      siblingBlocks: [
        toolBlock({
          id: 'read-doc',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  path: '/cache/page-1.jpg',
                  webviewUri: 'webview://page-1.jpg',
                  label: 'Page 1',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.storyboardTable?.scenes[0]?.shots[0]?.sourceMediaRefs).toEqual([
      expect.objectContaining({
        locator: { type: 'tool-result', toolCallId: 'read-doc', assetIndex: 0 },
      }),
    ]);
    expect(projection.data.entityMemoryContribution).toMatchObject({
      contributionId: 'contribution-page-1',
      entityCandidates: [expect.objectContaining({ id: 'candidate-rin' })],
    });
    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({
        src: 'webview://page-1.jpg',
        localPath: '/cache/page-1.jpg',
        role: 'source',
      }),
    ]);
  });

  it('keeps page aliases bound to stable document resources when transferring inferred storyboard refs', () => {
    const documentResourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/images/moe-018893.jpg',
      cachePath: '/workspace/.neko/.cache/resources/documents/doc_comic/OPS/images/moe-018893.jpg',
    };
    const cacheResourceRef = {
      id: 'res_stable',
      scope: 'project' as const,
      provider: 'document-archive',
      kind: 'document' as const,
      source: {
        kind: 'document' as const,
        document: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      },
      locator: { kind: 'document' as const, entryPath: 'OPS/images/moe-018893.jpg' },
      fingerprint: { strategy: 'provider' as const, value: 'comic-v1' },
    };
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          schemaVersion: 1,
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 1',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'Use page_1 as the reference.',
                  characterAction: 'Static title card.',
                  imageStrategy: 'use-as-reference',
                },
              ],
            },
          ],
        },
        sections: [{ heading: 'page_1', content: 'Use page_1.', layout: 'table-row' }],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-image',
          name: 'ReadImage',
          arguments: {},
          result: {
            success: true,
            data: {
              images: [
                {
                  path: '/cache/page_1.jpg',
                  webviewUri: 'webview://page_1.jpg',
                  label: 'page_1',
                  mimeType: 'image/jpeg',
                  resourceRef: documentResourceRef,
                  cacheResourceRef,
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    const payload = projectStoryboardTableTransferPayload(projection.data);
    if (payload?.kind !== 'canvasStoryboard') {
      throw new Error('expected canvas storyboard payload');
    }
    const shot = payload.storyboard.scenes[0]?.shotPlans[0];
    expect(shot).toMatchObject({
      referenceImageResourceRef: documentResourceRef,
      referenceResourceRef: cacheResourceRef,
    });
    expect(shot).not.toHaveProperty('referenceImagePath');
  });

  it('infers storyboard refs from ReadDocument resource refs even without webview thumbnails', () => {
    const documentResourceRef = {
      kind: 'document-entry' as const,
      source: {
        filePath: '/library/books/comic.epub',
        format: 'epub' as const,
        fileId: '/library/books/comic.epub:100:1',
        identity: {
          fileId: '/library/books/comic.epub:100:1',
          sizeBytes: 100,
          mtimeMs: 1,
        },
      },
      entryPath: 'OPS/images/moe-018893.jpg',
      cachePath: '/workspace/.neko/.cache/resources/documents/doc_comic/OPS/images/moe-018893.jpg',
    };
    const cacheResourceRef = {
      id: 'res_stable',
      scope: 'project' as const,
      provider: 'document-archive',
      kind: 'document' as const,
      source: {
        kind: 'document' as const,
        document: documentResourceRef.source,
      },
      locator: { kind: 'document' as const, entryPath: 'OPS/images/moe-018893.jpg' },
      fingerprint: { strategy: 'identity' as const, value: '/library/books/comic.epub:100:1' },
    };
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          schemaVersion: 1,
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 1',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'Use page 1 as the reference.',
                  characterAction: 'Static title card.',
                  imageStrategy: 'use-as-reference',
                },
              ],
            },
          ],
        },
        sections: [{ heading: 'Page 1 / Shot 1', content: 'Use page 1.', layout: 'table-row' }],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-doc',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  path: '/workspace/.neko/.cache/resources/documents/doc_comic/OPS/images/moe-018893.jpg',
                  label: 'page 1',
                  mimeType: 'image/jpeg',
                  resourceRef: documentResourceRef,
                  cacheResourceRef,
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    const payload = projectStoryboardTableTransferPayload(projection.data);
    if (payload?.kind !== 'canvasStoryboard') {
      throw new Error('expected canvas storyboard payload');
    }
    const shot = payload.storyboard.scenes[0]?.shotPlans[0];
    expect(shot).toMatchObject({
      referenceImageResourceRef: documentResourceRef,
      referenceResourceRef: cacheResourceRef,
    });
    expect(shot).not.toHaveProperty('referenceImagePath');
  });

  it('replaces unresolved model-authored storyboard media refs with inferred tool result refs', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          schemaVersion: 1,
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 1',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'The title page appears.',
                  characterAction: 'Static title card.',
                  imageStrategy: 'use-as-reference',
                  sourceMediaRefs: [
                    {
                      refId: 'source-page-1',
                      role: 'source',
                      locator: {
                        type: 'tool-result',
                        toolCallId: 'ReadImage-vision-pages-1-10',
                        assetIndex: 0,
                      },
                      label: 'Page 1',
                      mimeType: 'image/jpeg',
                    },
                  ],
                },
              ],
            },
          ],
        },
        sections: [
          {
            heading: 'Page 1 / Shot 1',
            content: 'The title page appears.',
            layout: 'table-row',
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-image',
          name: 'ReadImage',
          arguments: {},
          result: {
            success: true,
            data: {
              images: [
                {
                  path: '/cache/page-1.jpg',
                  webviewUri: 'webview://page-1.jpg',
                  label: 'Page 1',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.storyboardTable?.scenes[0]?.shots[0]?.sourceMediaRefs).toEqual([
      {
        refId: 'tool-result:read-image:0',
        role: 'source',
        locator: {
          type: 'tool-result',
          toolCallId: 'read-image',
          assetIndex: 0,
        },
        label: 'Page 1',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(projection.data.sections[0]?.diagnostics).toEqual([]);
    expect(projection.data.diagnostics).toEqual([]);
    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({
        toolCallId: 'read-image',
        src: 'webview://page-1.jpg',
        localPath: '/cache/page-1.jpg',
      }),
    ]);
  });

  it('uses page labels to infer repeated storyboard media refs from real image results', () => {
    const documentResourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-3.jpg',
      cachePath: '/workspace/.neko/.cache/resources/documents/doc_comic/OPS/page-3.jpg',
    };
    const cacheResourceRef = {
      id: 'res_page_3',
      scope: 'project' as const,
      provider: 'document-archive',
      kind: 'document' as const,
      source: {
        kind: 'document' as const,
        document: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      },
      locator: { kind: 'document' as const, entryPath: 'OPS/page-3.jpg' },
      fingerprint: { strategy: 'provider' as const, value: 'comic-page-3' },
    };
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          schemaVersion: 1,
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 3',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'Page 3 upper panel: the character looks out.',
                  characterAction: 'The character pauses at the window.',
                  imageStrategy: 'use-as-reference',
                },
                {
                  shotNumber: 2,
                  duration: 2,
                  visualDescription: 'Page 3 lower panel: the character turns back.',
                  characterAction: 'The character turns back.',
                  imageStrategy: 'use-as-reference',
                },
              ],
            },
          ],
        },
        sections: [
          {
            heading: 'Page 3 上半 / Shot 1',
            content: 'The character looks out.',
            layout: 'table-row',
          },
          {
            heading: 'Page 3 下半 / Shot 2',
            content: 'The character turns back.',
            layout: 'table-row',
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-doc',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  path: '/cache/page-1.jpg',
                  webviewUri: 'webview://page-1.jpg',
                  mimeType: 'image/jpeg',
                  locator: { kind: 'page', pageNumber: 1 },
                },
                {
                  path: '/cache/page-2.jpg',
                  webviewUri: 'webview://page-2.jpg',
                  mimeType: 'image/jpeg',
                  locator: { kind: 'page', pageNumber: 2 },
                },
                {
                  path: '/cache/page-3.jpg',
                  webviewUri: 'webview://page-3.jpg',
                  mimeType: 'image/jpeg',
                  locator: { kind: 'page', pageNumber: 3 },
                  resourceRef: documentResourceRef,
                  cacheResourceRef,
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(
      projection.data.storyboardTable?.scenes[0]?.shots.map(
        (shot) => shot.sourceMediaRefs?.[0]?.locator,
      ),
    ).toEqual([
      { type: 'tool-result', toolCallId: 'read-doc', assetIndex: 2 },
      { type: 'tool-result', toolCallId: 'read-doc', assetIndex: 2 },
    ]);
    expect(projection.data.sections.map((section) => section.media[0]?.localPath)).toEqual([
      '/cache/page-3.jpg',
      '/cache/page-3.jpg',
    ]);

    const payload = projectStoryboardTableTransferPayload(projection.data);
    expect(payload).toMatchObject({
      kind: 'canvasStoryboard',
      storyboard: {
        scenes: [
          {
            shotPlans: [
              {
                referenceImageResourceRef: documentResourceRef,
                referenceResourceRef: cacheResourceRef,
              },
              {
                referenceImageResourceRef: documentResourceRef,
                referenceResourceRef: cacheResourceRef,
              },
            ],
          },
        ],
      },
    });
    const shotPlans =
      payload?.kind === 'canvasStoryboard' ? (payload.storyboard.scenes[0]?.shotPlans ?? []) : [];
    expect(shotPlans[0]).not.toHaveProperty('referenceImagePath');
    expect(shotPlans[1]).not.toHaveProperty('referenceImagePath');
  });

  it('uses source page extension metadata before sequential image assignment', () => {
    const page6DocumentRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-6.jpg',
      cachePath: '/workspace/.neko/.cache/resources/documents/doc_comic/OPS/page-6.jpg',
    };
    const page7DocumentRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-7.jpg',
      cachePath: '/workspace/.neko/.cache/resources/documents/doc_comic/OPS/page-7.jpg',
    };
    const page6CacheRef = {
      id: 'res_page_6',
      scope: 'project' as const,
      provider: 'document-archive',
      kind: 'document' as const,
      source: {
        kind: 'document' as const,
        document: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      },
      locator: { kind: 'document' as const, entryPath: 'OPS/page-6.jpg' },
      fingerprint: { strategy: 'provider' as const, value: 'comic-page-6' },
    };
    const page7CacheRef = {
      id: 'res_page_7',
      scope: 'project' as const,
      provider: 'document-archive',
      kind: 'document' as const,
      source: {
        kind: 'document' as const,
        document: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      },
      locator: { kind: 'document' as const, entryPath: 'OPS/page-7.jpg' },
      fingerprint: { strategy: 'provider' as const, value: 'comic-page-7' },
    };
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          schemaVersion: 1,
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Pages 6-7',
              shots: [
                {
                  shotNumber: 10,
                  duration: 3,
                  visualDescription: 'Village wide shot.',
                  characterAction: 'The village sits under the volcano.',
                  imageStrategy: 'use-as-reference',
                  extensions: {
                    'neko.storyboardSourceImage': {
                      kind: 'page',
                      number: 6,
                      key: 'P6',
                    },
                  },
                },
                {
                  shotNumber: 11,
                  duration: 3,
                  visualDescription: 'The boy walks under the mountain.',
                  characterAction: 'The boy leads the sheep forward.',
                  imageStrategy: 'use-as-reference',
                  extensions: {
                    'neko.storyboardSourceImage': {
                      kind: 'page',
                      number: 7,
                      key: 'P7',
                    },
                  },
                },
              ],
            },
          ],
        },
        sections: [
          { heading: 'S010 / P6', content: 'Village wide shot.', layout: 'table-row' },
          { heading: 'S011 / P7', content: 'The boy walks.', layout: 'table-row' },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-doc',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  path: '/cache/page-1.jpg',
                  webviewUri: 'webview://page-1.jpg',
                  label: 'Page 1',
                  locator: { kind: 'page', pageNumber: 1 },
                },
                {
                  path: '/cache/page-6.jpg',
                  webviewUri: 'webview://page-6.jpg',
                  label: 'Page 6',
                  locator: { kind: 'page', pageNumber: 6 },
                  resourceRef: page6DocumentRef,
                  cacheResourceRef: page6CacheRef,
                },
                {
                  path: '/cache/page-7.jpg',
                  webviewUri: 'webview://page-7.jpg',
                  label: 'Page 7',
                  locator: { kind: 'page', pageNumber: 7 },
                  resourceRef: page7DocumentRef,
                  cacheResourceRef: page7CacheRef,
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    const payload = projectStoryboardTableTransferPayload(projection.data);
    const shotPlans =
      payload?.kind === 'canvasStoryboard' ? payload.storyboard.scenes[0]?.shotPlans : [];
    expect(shotPlans).toMatchObject([
      {
        referenceImageResourceRef: page6DocumentRef,
        referenceResourceRef: page6CacheRef,
      },
      {
        referenceImageResourceRef: page7DocumentRef,
        referenceResourceRef: page7CacheRef,
      },
    ]);
  });

  it('does not infer durable entity memory contribution from character analysis tables in Webview', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          schemaVersion: 1,
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 1',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: '瑞德 watches the gate.',
                  characterAction: '瑞德 hesitates before running.',
                  imageStrategy: 'generate-new',
                },
              ],
            },
          ],
        },
        sections: [
          {
            heading: '主要角色观察',
            content: [
              '| 角色 | 当前证据支撑的观察 |',
              '| --- | --- |',
              '| 瑞德 | 红色围巾，面对门口时显得犹豫。 |',
              '| 众人 | 背景里围观，没有单一身份。 |',
            ].join('\n'),
          },
        ],
      },
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.entityMemoryContribution).toBeUndefined();

    const payload = projectStoryboardTableTransferPayload(projection.data);
    expect(payload).toMatchObject({ kind: 'canvasStoryboard' });
    expect(payload).not.toHaveProperty('entityMemoryContribution');
  });

  it('projects structured entity memory contribution provided by runtime or domain', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        extensions: {
          'neko.entityMemoryContributionPayload': {
            contributionId: 'explicit-contribution',
            sourcePackage: 'neko-agent',
            sourceRef: { kind: 'manual', label: 'explicit payload' },
            reviewPolicy: 'requires-user-review',
          },
        },
        sections: [
          {
            heading: '主要角色观察',
            content: [
              '| 角色 | 当前证据支撑的观察 |',
              '| --- | --- |',
              '| 瑞德 | 红色围巾。 |',
            ].join('\n'),
          },
        ],
      },
    });

    expect(projection.data.entityMemoryContribution).toMatchObject({
      contributionId: 'explicit-contribution',
      sourceRef: { kind: 'manual', label: 'explicit payload' },
    });
    expect(projection.data.entityMemoryContribution?.metadata).toBeUndefined();
  });

  it('uses model-authored page alias fields to infer storyboard media refs', () => {
    const compositeInput = {
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          schemaVersion: 1,
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Scene',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'Use page 2 as the reference frame.',
                  characterAction: 'The character turns back.',
                  imageStrategy: 'use-as-reference',
                  page_2: true,
                },
              ],
            },
          ],
        },
        sections: [
          {
            heading: 'Shot 1',
            content: 'Use the second page.',
            layout: 'table-row',
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-doc',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  path: '/cache/page-1.jpg',
                  webviewUri: 'webview://page-1.jpg',
                  mimeType: 'image/jpeg',
                  locator: { kind: 'page', pageNumber: 1 },
                },
                {
                  path: '/cache/page-2.jpg',
                  webviewUri: 'webview://page-2.jpg',
                  mimeType: 'image/jpeg',
                  locator: { kind: 'page', pageNumber: 2 },
                },
              ],
            },
          },
        }),
      ],
    };
    const decodedInput = JSON.parse(JSON.stringify(compositeInput)) as Parameters<
      typeof projectCompositeBlockRichContent
    >[0];
    const projection = projectCompositeBlockRichContent(decodedInput);

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.storyboardTable?.scenes[0]?.shots[0]).toMatchObject({
      sourceMediaRefs: [
        {
          locator: { type: 'tool-result', toolCallId: 'read-doc', assetIndex: 1 },
          label: 'page 2',
          mimeType: 'image/jpeg',
        },
      ],
      extensions: {
        'neko.storyboardImageAlias': {
          kind: 'page',
          number: 2,
          key: 'page_2',
        },
      },
    });
    expect(projection.data.sections[0]?.media[0]).toMatchObject({
      toolCallId: 'read-doc',
      assetIndex: 1,
      localPath: '/cache/page-2.jpg',
      src: 'webview://page-2.jpg',
    });
  });

  it('diagnoses duplicate page aliases across image batches instead of binding the first match', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          schemaVersion: 1,
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 1',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'Use page_1 as the reference.',
                  characterAction: 'Static title card.',
                  imageStrategy: 'use-as-reference',
                  referenceImagePath: 'page_1',
                },
              ],
            },
          ],
        },
        sections: [{ heading: 'page_1', content: 'Use page_1.', layout: 'table-row' }],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-doc-a',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  path: '/cache/a/page-1.jpg',
                  webviewUri: 'webview://a/page-1.jpg',
                  alias: 'page_1',
                  aliasScope: 'document:comic-a',
                  sourceDocumentId: 'comic-a',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
        toolBlock({
          id: 'read-doc-b',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  path: '/cache/b/page-1.jpg',
                  webviewUri: 'webview://b/page-1.jpg',
                  alias: 'page_1',
                  aliasScope: 'document:comic-b',
                  sourceDocumentId: 'comic-b',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.storyboardTable?.scenes[0]?.shots[0]?.sourceMediaRefs).toBeUndefined();
    expect(projection.data.diagnostics).toEqual([
      expect.objectContaining({
        code: 'ambiguous-media-alias',
        message: expect.stringContaining('page_1'),
      }),
    ]);
    expect(projection.data.storyboardDiagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'ambiguous-media-alias',
      }),
    ]);
    const payload = projectStoryboardTableTransferPayload(projection.data);
    if (payload?.kind !== 'canvasStoryboard') {
      throw new Error('expected canvas storyboard payload');
    }
    const shot = payload.storyboard.scenes[0]?.shotPlans[0];
    expect(shot).toMatchObject({
      visualDescription: 'Use page_1 as the reference.',
    });
    expect(shot).not.toHaveProperty('referenceImagePath');
    expect(shot).not.toHaveProperty('referenceImageResourceRef');
  });

  it('preserves explicit sourceMediaRefs when duplicate readable aliases exist', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          schemaVersion: 1,
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 1',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'Use the second page_1.',
                  characterAction: 'Static title card.',
                  imageStrategy: 'use-as-reference',
                  sourceMediaRefs: [
                    {
                      refId: 'explicit-page',
                      role: 'source',
                      locator: { type: 'tool-result', toolCallId: 'read-doc-b', assetIndex: 0 },
                      label: 'page_1',
                      mimeType: 'image/jpeg',
                    },
                  ],
                },
              ],
            },
          ],
        },
        sections: [{ heading: 'page_1', content: 'Use page_1.', layout: 'table-row' }],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-doc-a',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  path: '/cache/a/page-1.jpg',
                  webviewUri: 'webview://a/page-1.jpg',
                  alias: 'page_1',
                  aliasScope: 'document:comic-a',
                  sourceDocumentId: 'comic-a',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
        toolBlock({
          id: 'read-doc-b',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  path: '/cache/b/page-1.jpg',
                  webviewUri: 'webview://b/page-1.jpg',
                  alias: 'page_1',
                  aliasScope: 'document:comic-b',
                  sourceDocumentId: 'comic-b',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.storyboardTable?.scenes[0]?.shots[0]?.sourceMediaRefs).toEqual([
      {
        refId: 'explicit-page',
        role: 'source',
        locator: { type: 'tool-result', toolCallId: 'read-doc-b', assetIndex: 0 },
        label: 'page_1',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(projection.data.sections[0]?.media[0]).toMatchObject({
      toolCallId: 'read-doc-b',
      assetIndex: 0,
      localPath: '/cache/b/page-1.jpg',
    });
    expect(projection.data.diagnostics).toEqual([]);
  });

  it('reports missing explicit tool results when no scoped repair is possible', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          schemaVersion: 1,
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Shot 1',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'Missing tool result should not be replaced by sequence.',
                  characterAction: 'Static title card.',
                  imageStrategy: 'use-as-reference',
                  sourceMediaRefs: [
                    {
                      refId: 'missing-page',
                      role: 'source',
                      locator: {
                        type: 'tool-result',
                        toolCallId: 'ReadImage-vision-pages-1-10',
                        assetIndex: 0,
                      },
                      mimeType: 'image/jpeg',
                    },
                  ],
                },
              ],
            },
          ],
        },
        sections: [{ heading: 'Shot 1', content: 'No page alias.', layout: 'table-row' }],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-doc-a',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  path: '/cache/a/page-1.jpg',
                  webviewUri: 'webview://a/page-1.jpg',
                  alias: 'page_1',
                  aliasScope: 'document:comic-a',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
        toolBlock({
          id: 'read-doc-b',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  path: '/cache/b/page-1.jpg',
                  webviewUri: 'webview://b/page-1.jpg',
                  alias: 'page_1',
                  aliasScope: 'document:comic-b',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.storyboardTable?.scenes[0]?.shots[0]?.sourceMediaRefs).toEqual([
      expect.objectContaining({
        locator: {
          type: 'tool-result',
          toolCallId: 'ReadImage-vision-pages-1-10',
          assetIndex: 0,
        },
      }),
    ]);
    expect(projection.data.sections[0]?.media).toEqual([]);
    expect(projection.data.storyboardDiagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'unresolved-tool-result',
      }),
    ]);
    const payload = projectStoryboardTableTransferPayload(projection.data);
    if (payload?.kind !== 'canvasStoryboard') {
      throw new Error('expected canvas storyboard payload');
    }
    const shot = payload.storyboard.scenes[0]?.shotPlans[0];
    expect(shot).toMatchObject({
      visualDescription: 'Missing tool result should not be replaced by sequence.',
    });
    expect(shot).not.toHaveProperty('referenceImagePath');
    expect(shot).not.toHaveProperty('referenceImageResourceRef');
  });

  it('repairs invented explicit tool result ids through a single eligible image batch', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          schemaVersion: 1,
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 2',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'Use the second page from the analysis batch.',
                  characterAction: 'Static page reference.',
                  imageStrategy: 'use-as-reference',
                  sourceMediaRefs: [
                    {
                      refId: 'invented-page',
                      role: 'source',
                      locator: {
                        type: 'tool-result',
                        toolCallId: 'ReadImage.front10pages',
                        assetIndex: 1,
                      },
                      label: 'Page 2',
                      mimeType: 'image/jpeg',
                    },
                  ],
                },
              ],
            },
          ],
        },
        sections: [{ heading: 'Page 2 / Shot 1', content: 'Use page 2.', layout: 'table-row' }],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-image-real',
          name: 'ReadImage',
          arguments: {},
          result: {
            success: true,
            data: {
              images: [
                {
                  path: '/cache/page-1.jpg',
                  webviewUri: 'webview://page-1.jpg',
                  label: 'Page 1',
                  mimeType: 'image/jpeg',
                },
                {
                  path: '/cache/page-2.jpg',
                  webviewUri: 'webview://page-2.jpg',
                  label: 'Page 2',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.storyboardTable?.scenes[0]?.shots[0]?.sourceMediaRefs).toEqual([
      {
        refId: 'tool-result:read-image-real:1',
        role: 'source',
        locator: {
          type: 'tool-result',
          toolCallId: 'read-image-real',
          assetIndex: 1,
        },
        label: 'Page 2',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({
        toolCallId: 'read-image-real',
        assetIndex: 1,
        localPath: '/cache/page-2.jpg',
        src: 'webview://page-2.jpg',
      }),
    ]);
    expect(projection.data.diagnostics).toEqual([]);
  });

  it('resolves semantic storyboard row media from explicit shot media refs', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          schemaVersion: 1,
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 1',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'The title page appears.',
                  characterAction: 'Static title card.',
                  imageStrategy: 'use-as-reference',
                  sourceMediaRefs: [
                    {
                      refId: 'page-1',
                      role: 'source',
                      locator: {
                        type: 'tool-result',
                        toolCallId: 'read-image',
                        assetIndex: 0,
                      },
                      label: 'Page 1',
                      mimeType: 'image/jpeg',
                    },
                  ],
                },
              ],
            },
          ],
        },
        sections: [
          {
            heading: 'Page 1 / Shot 1',
            content: 'The title page appears.',
            layout: 'table-row',
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-image',
          name: 'ReadImage',
          arguments: {},
          result: {
            success: true,
            data: {
              images: [
                {
                  path: '/cache/page-1.jpg',
                  webviewUri: 'webview://page-1.jpg',
                  label: 'Page 1',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({
        toolCallId: 'read-image',
        type: 'image',
        src: 'webview://page-1.jpg',
        localPath: '/cache/page-1.jpg',
        caption: 'Page 1',
        role: 'source',
      }),
    ]);
  });

  it('projects comparison variants from ordered media refs', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'comparison',
        sections: [
          {
            heading: 'Variant A',
            mediaRefs: [{ toolCallId: 'call-1', assetIndex: 0 }],
          },
          {
            heading: 'Variant B',
            mediaRefs: [{ toolCallId: 'call-1', assetIndex: 1 }],
          },
        ],
      },
      siblingBlocks: [toolBlock(makeImageToolCall())],
    });

    expect(projection.kind).toBe('comparison-grid');
    expect(projection.data.sections.map((section) => section.media[0]?.src)).toEqual([
      'webview://asset-1.png',
      'webview://asset-2.png',
    ]);
  });

  it('projects storyboard media refs from document image pages and generated variants', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        sections: [
          {
            heading: 'Shot 1',
            content: 'Use the original page, color pass, and final generated keyframe.',
            mediaRefs: [
              {
                toolCallId: 'read-doc',
                assetIndex: 0,
                caption: '原始页图',
                role: 'original',
              },
              {
                toolCallId: 'colorize',
                assetIndex: 0,
                caption: '上色图',
                role: 'colorized',
              },
              {
                toolCallId: 'generate',
                assetIndex: 0,
                caption: '生成图',
                role: 'generated',
              },
            ],
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-doc',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              filePath: '/books/story.epub',
              imagePaths: ['/cache/page-1.jpg'],
              imagePathWebviewUris: ['webview://page-1.jpg'],
              imageInfo: [
                {
                  path: '/cache/page-1.jpg',
                  width: 1493,
                  height: 2133,
                  mimeType: 'image/jpeg',
                  locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
                },
              ],
            },
          },
        }),
        toolBlock(makeImageToolCall('colorize', 'color-1', 'webview://color.png')),
        toolBlock(makeImageToolCall('generate', 'generated-1', 'webview://generated.png')),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    expect(projection.data.sections[0]?.media).toMatchObject([
      {
        toolCallId: 'read-doc',
        type: 'image',
        src: 'webview://page-1.jpg',
        localPath: '/cache/page-1.jpg',
        mimeType: 'image/jpeg',
        caption: '原始页图',
        role: 'original',
      },
      {
        toolCallId: 'colorize',
        src: 'webview://color.png',
        caption: '上色图',
        role: 'colorized',
      },
      {
        toolCallId: 'generate',
        src: 'webview://generated.png',
        caption: '生成图',
        role: 'generated',
      },
    ]);
  });

  it('projects read image results when webview URIs are available on image entries', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'gallery',
        sections: [
          {
            mediaRefs: [{ toolCallId: 'read-image', assetIndex: 0 }],
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-image',
          name: 'ReadImage',
          arguments: {},
          result: {
            success: true,
            data: {
              mode: 'metadata',
              analysis: 'describe',
              images: [
                {
                  path: '/images/reference.png',
                  webviewUri: 'webview://reference.png',
                  label: 'reference',
                  mimeType: 'image/png',
                  byteSize: 100,
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({
        toolCallId: 'read-image',
        type: 'image',
        src: 'webview://reference.png',
        localPath: '/images/reference.png',
        caption: 'reference',
      }),
    ]);
  });

  it('projects gallery assets and bounds missing media diagnostics', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'gallery',
        sections: Array.from({ length: 12 }, (_, index) => ({
          heading: `Asset ${index}`,
          mediaRefs: [{ toolCallId: `missing-${index}`, assetIndex: index }],
        })),
      },
      siblingBlocks: [toolBlock(makeImageToolCall())],
    });

    expect(projection.kind).toBe('asset-gallery');
    expect(projection.data.diagnostics).toHaveLength(8);
    expect(projection.data.diagnostics[0]).toMatchObject({
      code: 'missing-tool-result',
      toolCallId: 'missing-0',
    });
  });

  it('projects local 3D model assets without requiring a renderable preview URI', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'gallery',
        sections: [
          {
            heading: 'Character',
            mediaRefs: [{ toolCallId: 'call-model', assetIndex: 0 }],
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'call-model',
          name: 'GenerateModel',
          arguments: {},
          result: {
            success: true,
            data: {
              assets: [
                {
                  id: 'model-1',
                  type: 'generated-model',
                  path: '/repo/.neko/generated/model/character.glb',
                  mimeType: 'model/gltf-binary',
                },
              ],
            },
          },
        }),
      ],
      plugins: { model: true },
    });

    expect(projection.kind).toBe('asset-gallery');
    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({
        type: 'model',
        src: '/repo/.neko/generated/model/character.glb',
        localPath: '/repo/.neko/generated/model/character.glb',
        assetId: 'model-1',
      }),
    ]);
    expect(projection.data.plugins).toEqual({ model: true });
  });

  it('diagnoses stable asset refs that lack adapter-provided webview URIs', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        sections: [
          {
            mediaRefs: [{ toolCallId: 'call-stable', assetIndex: 0 }],
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'call-stable',
          name: 'GenerateImage',
          arguments: {},
          result: {
            success: true,
            data: {
              resultAssetRefs: [
                {
                  assetId: 'asset-stable',
                  uri: '${WORKSPACE}/out.png',
                  mimeType: 'image/png',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.data.sections[0]?.media).toEqual([]);
    expect(projection.data.sections[0]?.diagnostics).toEqual([
      {
        code: 'missing-uri',
        toolCallId: 'call-stable',
        assetIndex: 0,
        assetId: 'asset-stable',
        message: 'Asset 0 does not have a renderable webview URI',
      },
    ]);
  });

  it('does not leak provider context, file URIs, inline base64, or absolute paths into render srcs', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'gallery',
        sections: [
          {
            mediaRefs: [
              { toolCallId: 'call-provider', assetIndex: 0 },
              { toolCallId: 'call-provider', assetIndex: 1 },
              { toolCallId: 'call-provider', assetIndex: 2 },
            ],
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'call-provider',
          name: 'GenerateImage',
          arguments: {},
          result: {
            success: true,
            data: {
              provider: 'openai',
              urls: ['file:///repo/out.png', 'data:image/png;base64,abc', 'webview://safe.png'],
              localPaths: ['/repo/out.png'],
            },
          },
        }),
      ],
    });

    expect(JSON.stringify(projection)).not.toContain('openai');
    expect(JSON.stringify(projection)).not.toContain('file://');
    expect(JSON.stringify(projection)).not.toContain('base64');
    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({ src: 'webview://safe.png' }),
    ]);
  });

  it('projects AnimationPlan domain blocks as storyboard shot overlays', () => {
    const composites = parseCompositeContentJson(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'composite-artifact',
        artifactId: 'artifact-1',
        title: 'Storyboard With Plan',
        blocks: [
          {
            blockId: 'storyboard',
            kind: 'domain',
            domainKind: 'StoryboardTable',
            payload: {
              schemaVersion: 1,
              kind: 'storyboard-table',
              title: 'Storyboard',
              scenes: [
                {
                  sceneId: 'scene-1',
                  sceneTitle: 'Opening',
                  shots: [
                    {
                      shotId: 'scene-1-shot-1',
                      shotNumber: 1,
                      duration: 3,
                      visualDescription: 'Mika opens the door.',
                      characterAction: 'Mika steps in.',
                      imageStrategy: 'generate-new',
                    },
                  ],
                },
              ],
            },
          },
          {
            blockId: 'animation',
            kind: 'domain',
            domainKind: 'AnimationPlan',
            payload: {
              kind: 'animation-plan-overlay',
              sourceStoryboardRef: { kind: 'artifact', artifactId: 'artifact-1' },
              shotOverlays: [
                {
                  sceneId: 'scene-1',
                  shotId: 'scene-1-shot-1',
                  motionIntent: 'cloth moves in the doorway',
                  cameraIntent: 'slow push-in',
                  videoPromptIntent: { positive: 'video prompt' },
                  requiresVideoGeneration: true,
                },
              ],
            },
          },
        ],
      }),
    );
    const projection = projectCompositeBlockRichContent({ composite: composites[0]! });

    expect(projection.kind).toBe('storyboard-table');
    expect(projection.data.storyboardPlanOverlays?.[0]?.shotOverlays[0]).toMatchObject({
      shotId: 'scene-1-shot-1',
      motionIntent: 'cloth moves in the doorway',
      cameraIntent: 'slow push-in',
      videoPromptIntent: { positive: 'video prompt' },
      requiresVideoGeneration: true,
    });
  });
});

function makeImageToolCall(
  id = 'call-1',
  assetId = 'asset-1',
  webviewUri = 'webview://asset-1.png',
): ToolCall {
  return {
    id,
    name: 'GenerateImage',
    arguments: { prompt: 'cat' },
    result: {
      success: true,
      data: {
        assets: [
          {
            id: assetId,
            type: 'generated-image',
            path: '/repo/.neko/generated/image/out.png',
            webviewUri,
            mimeType: 'image/png',
            generatedAt: '2026-01-01T00:00:00.000Z',
            width: 1024,
            height: 1024,
            ratio: '1:1',
            assetRef: {
              assetId,
              uri: '${WORKSPACE}/.neko/generated/image/out.png',
              mimeType: 'image/png',
            },
          },
          {
            id: 'asset-2',
            type: 'generated-image',
            path: '/repo/.neko/generated/image/out-2.png',
            webviewUri: 'webview://asset-2.png',
            mimeType: 'image/png',
            generatedAt: '2026-01-01T00:00:00.000Z',
            width: 1024,
            height: 1024,
            ratio: '1:1',
          },
        ],
      },
    },
  };
}

function toolBlock(toolCall: ToolCall): ContentBlock {
  return {
    id: `block-${toolCall.id}`,
    type: 'tool_call',
    timestamp: 1,
    toolCall,
  };
}
