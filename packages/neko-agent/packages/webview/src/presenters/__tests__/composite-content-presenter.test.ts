import { describe, expect, it } from 'vitest';
import type { ContentBlock, ToolCall } from '@neko-agent/types';
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
              { referenceImagePath: '/cache/page-3.jpg' },
              { referenceImagePath: '/cache/page-3.jpg' },
            ],
          },
        ],
      },
    });
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
