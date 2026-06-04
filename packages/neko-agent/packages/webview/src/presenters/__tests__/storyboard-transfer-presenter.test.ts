import { describe, expect, it } from 'vitest';
import {
  projectStoryboardScenesAssetBatch,
  projectStoryboardScenesCutTimelinePayload,
  projectStoryboardScenesTransferPayload,
  projectAssistantMarkdownCanvasTransferPayload,
  projectMarkdownStoryboardTransferPayload,
  projectStoryboardTableAssetBatch,
  projectStoryboardTableCutTimelinePayload,
  projectStoryboardTableTransferPayload,
} from '../storyboard-transfer-presenter';
import type { StoryboardTableRichData } from '../composite-content-presenter';

describe('storyboard transfer presenter', () => {
  it('projects scene-grouped storyboard content to a canvas storyboard payload', () => {
    expect(
      projectStoryboardScenesTransferPayload([
        {
          sceneIndex: 1,
          heading: 'INT. CAFE - DAY',
          shots: [
            {
              url: 'webview://shot-1.png',
              localPath: '/repo/shot-1.png',
              shotScale: 'LS',
              shotIndex: 1,
            },
          ],
        },
      ]),
    ).toEqual({
      kind: 'canvasStoryboard',
      storyboard: {
        mode: 'semantic',
        sourceScriptUri: 'agent://rich-content/storyboard',
        scenes: [
          {
            sceneId: 'agent-storyboard-scene-1',
            sceneTitle: 'INT. CAFE - DAY',
            sceneNumber: 1,
            shotPlans: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'Scene 1 shot 1',
                characters: [],
                shotScale: 'LS',
                characterAction: '',
                emotion: [],
                sceneTags: [],
              },
            ],
          },
        ],
      },
    });
  });

  it('projects storyboard scenes to an image asset batch', () => {
    expect(
      projectStoryboardScenesAssetBatch([
        {
          sceneIndex: 2,
          heading: 'EXT. STREET - NIGHT',
          shots: [
            { url: 'webview://shot-1.png', localPath: '/repo/shot-1.png', shotIndex: 1 },
            { url: 'webview://shot-2.png', shotIndex: 2 },
          ],
        },
      ]),
    ).toEqual({
      kind: 'assetBatch',
      assets: [{ path: '/repo/shot-1.png', mediaType: 'image', name: 'scene-2-shot-1' }],
    });
  });

  it('projects storyboard scenes to a cut storyboard timeline payload', () => {
    expect(
      projectStoryboardScenesCutTimelinePayload([
        {
          sceneIndex: 2,
          heading: 'EXT. STREET - NIGHT',
          shots: [
            {
              url: 'webview://shot-1.png',
              localPath: '/repo/shot-1.png',
              shotScale: 'LS',
              shotIndex: 1,
            },
            { url: 'webview://shot-2.png', shotIndex: 2 },
          ],
        },
      ]),
    ).toEqual({
      kind: 'cutStoryboard',
      storyboard: {
        projectName: 'Agent Storyboard',
        shots: [
          {
            id: 'agent-scene-2-shot-1',
            shotNumber: 1,
            duration: 3,
            imagePath: '/repo/shot-1.png',
            label: '#001 LS',
          },
        ],
      },
    });
  });

  it('projects composite storyboard tables to semantic canvas payloads and asset batches', () => {
    const data: StoryboardTableRichData = {
      template: 'storyboard-table',
      title: 'Opening',
      sections: [
        {
          id: 'section-0',
          index: 0,
          heading: 'Shot 1',
          content: 'Wide establishing frame',
          media: [
            {
              id: 'media-1',
              toolCallId: 'call-1',
              assetIndex: 0,
              type: 'image',
              src: 'webview://asset.png',
              localPath: '/repo/asset.png',
              caption: 'Wide',
            },
          ],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    expect(projectStoryboardTableTransferPayload(data)).toEqual({
      kind: 'canvasStoryboard',
      storyboard: {
        mode: 'semantic',
        sourceScriptUri: 'agent://rich-content/storyboard-table',
        scenes: [
          {
            sceneId: 'agent-composite-section-1',
            sceneTitle: 'Shot 1',
            sceneNumber: 1,
            shotPlans: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'Wide establishing frame',
                characters: [],
                shotScale: 'MS',
                characterAction: 'Wide establishing frame',
                emotion: [],
                sceneTags: ['Wide'],
                referenceImagePath: '/repo/asset.png',
              },
            ],
          },
        ],
      },
    });

    expect(projectStoryboardTableAssetBatch(data)).toEqual({
      kind: 'assetBatch',
      assets: [{ path: '/repo/asset.png', mediaType: 'image', name: 'Wide' }],
    });

    expect(projectStoryboardTableCutTimelinePayload(data)).toEqual({
      kind: 'cutStoryboard',
      storyboard: {
        projectName: 'Opening',
        shots: [
          {
            id: 'media-1',
            shotNumber: 1,
            duration: 3,
            imagePath: '/repo/asset.png',
            dialogue: 'Wide establishing frame',
            label: 'Wide',
          },
        ],
      },
    });
  });

  it('prefers semantic storyboard table projection over legacy section inference', () => {
    const data: StoryboardTableRichData = {
      template: 'storyboard-table',
      title: 'Opening',
      storyboardTable: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Semantic Opening',
        scenes: [
          {
            sceneId: 'scene-semantic',
            sceneTitle: 'Semantic Scene',
            shots: [
              {
                shotNumber: 7,
                duration: 5,
                visualDescription: 'Semantic visual description.',
                characterAction: 'Rin follows the signal.',
                shotScale: 'CU',
                emotion: ['focused'],
                sceneTags: ['signal'],
                dialogue: 'There it is.',
                imageStrategy: 'generate-new',
                generationPrompt: 'semantic prompt',
              },
            ],
          },
        ],
      },
      sections: [
        {
          id: 'section-0',
          index: 0,
          heading: 'Legacy Shot',
          content: 'Legacy content should not drive projection.',
          media: [],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    expect(projectStoryboardTableTransferPayload(data)).toEqual({
      kind: 'canvasStoryboard',
      storyboard: {
        mode: 'semantic',
        sourceScriptUri: 'agent://rich-content/storyboard-table',
        scenes: [
          {
            sceneId: 'scene-semantic',
            sceneTitle: 'Semantic Scene',
            sceneNumber: 1,
            shotPlans: [
              {
                shotNumber: 7,
                duration: 5,
                visualDescription: 'Semantic visual description.',
                characters: [],
                shotScale: 'CU',
                characterAction: 'Rin follows the signal.',
                emotion: ['focused'],
                sceneTags: ['signal'],
                dialogue: 'There it is.',
                generationPrompt: 'semantic prompt',
              },
            ],
          },
        ],
      },
    });
  });

  it('resolves semantic storyboard source media refs to canvas reference images', () => {
    const data: StoryboardTableRichData = {
      template: 'storyboard-table',
      title: 'Opening',
      storyboardTable: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Semantic Opening',
        profile: 'manga-to-video',
        scenes: [
          {
            sceneId: 'scene-page-1',
            sceneTitle: 'Page 1',
            shots: [
              {
                shotNumber: 1,
                duration: 4,
                visualDescription: 'Panel composition.',
                characterAction: 'Rin reacts.',
                imageStrategy: 'use-as-reference',
                sourceMediaRefs: [
                  {
                    refId: 'panel-1',
                    role: 'source',
                    locator: {
                      type: 'tool-result',
                      toolCallId: 'read-image-call',
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
      sections: [
        {
          id: 'section-0',
          index: 0,
          heading: 'Shot 1',
          content: 'Panel composition.',
          media: [
            {
              id: 'read-image-call:0:panel-1',
              toolCallId: 'read-image-call',
              assetIndex: 0,
              type: 'image',
              src: 'webview://panel-1.jpg',
              localPath: '/cache/panel-1.jpg',
              stableUri: 'asset://panel-1',
              resourceRef: {
                kind: 'document-entry',
                source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
                entryPath: 'image/panel-1.jpg',
                cachePath: '/cache/panel-1.jpg',
                versionPolicy: 'versioned-export',
              },
            },
          ],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    expect(projectStoryboardTableTransferPayload(data)).toMatchObject({
      kind: 'canvasStoryboard',
      storyboard: {
        scenes: [
          {
            shotPlans: [
              {
                referenceImagePath: '/cache/panel-1.jpg',
                referenceImageResourceRef: {
                  kind: 'document-entry',
                  source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
                  entryPath: 'image/panel-1.jpg',
                  cachePath: '/cache/panel-1.jpg',
                  versionPolicy: 'versioned-export',
                },
              },
            ],
          },
        ],
      },
    });
  });

  it('resolves semantic storyboard source media refs for Canvas image previews', () => {
    const resourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-1.jpg',
      cachePath: '/tmp/neko-cache/page-1.jpg',
      versionPolicy: 'read-only-source' as const,
    };
    const data: StoryboardTableRichData = {
      template: 'storyboard-table',
      title: 'Opening',
      storyboardTable: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Semantic Opening',
        profile: 'manga-to-video',
        scenes: [
          {
            sceneId: 'scene-page-1',
            sceneTitle: 'Page 1',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'A panel from the page.',
                characterAction: 'The character turns.',
                imageStrategy: 'use-as-reference',
                sourceMediaRefs: [
                  {
                    refId: 'page-1-panel',
                    role: 'source',
                    locator: {
                      type: 'tool-result',
                      toolCallId: 'read-image-1',
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
      sections: [
        {
          id: 'section-0',
          index: 0,
          heading: 'Shot 1',
          media: [
            {
              id: 'read-image-1:0:/tmp/neko-cache/page-1.jpg',
              toolCallId: 'read-image-1',
              assetIndex: 0,
              type: 'image',
              src: 'webview://page-1.jpg',
              localPath: '/tmp/neko-cache/page-1.jpg',
              resourceRef,
              mimeType: 'image/jpeg',
            },
          ],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    expect(projectStoryboardTableTransferPayload(data)).toEqual({
      kind: 'canvasStoryboard',
      storyboard: {
        mode: 'semantic',
        sourceScriptUri: 'agent://rich-content/storyboard-table',
        scenes: [
          {
            sceneId: 'scene-page-1',
            sceneTitle: 'Page 1',
            sceneNumber: 1,
            shotPlans: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'A panel from the page.',
                characters: [],
                shotScale: 'MS',
                characterAction: 'The character turns.',
                emotion: [],
                sceneTags: [],
                referenceImagePath: '/tmp/neko-cache/page-1.jpg',
                referenceImageResourceRef: resourceRef,
              },
            ],
          },
        ],
      },
    });
  });

  it('does not send agent-only blob preview URLs as Canvas reference image paths', () => {
    const data: StoryboardTableRichData = {
      template: 'storyboard-table',
      title: 'Opening',
      storyboardTable: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Semantic Opening',
        scenes: [
          {
            sceneId: 'scene-page-1',
            sceneTitle: 'Page 1',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'A panel from the page.',
                characterAction: 'The character turns.',
                imageStrategy: 'use-as-reference',
                sourceMediaRefs: [
                  {
                    refId: 'page-1-panel',
                    role: 'source',
                    locator: {
                      type: 'tool-result',
                      toolCallId: 'read-image-1',
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
      sections: [
        {
          id: 'section-0',
          index: 0,
          heading: 'Shot 1',
          media: [
            {
              id: 'read-image-1:0:blob-preview',
              toolCallId: 'read-image-1',
              assetIndex: 0,
              type: 'image',
              src: 'blob:vscode-webview://preview-only',
              mimeType: 'image/jpeg',
            },
          ],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    const payload = projectStoryboardTableTransferPayload(data);
    if (payload?.kind !== 'canvasStoryboard') {
      throw new Error('expected canvas storyboard payload');
    }

    const shotPlan = payload.storyboard.scenes[0]?.shotPlans[0];
    expect(shotPlan).not.toHaveProperty('referenceImagePath');
    expect(shotPlan).not.toHaveProperty('referenceImageResourceRef');
  });

  it('does not infer semantic storyboard canvas reference images from rendered row media', () => {
    const resourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-2.jpg',
      cachePath: '/tmp/neko-cache/page-2.jpg',
      versionPolicy: 'read-only-source' as const,
    };
    const data: StoryboardTableRichData = {
      template: 'storyboard-table',
      title: 'Opening',
      storyboardTable: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Semantic Opening',
        profile: 'manga-to-video',
        scenes: [
          {
            sceneId: 'scene-page-2',
            sceneTitle: 'Page 2',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'First panel.',
                characterAction: 'The character looks up.',
                imageStrategy: 'generate-new',
                generationPrompt: 'animated keyframe from panel',
              },
            ],
          },
        ],
      },
      sections: [
        {
          id: 'section-0',
          index: 0,
          heading: 'Shot 1',
          media: [
            {
              id: 'read-image-2:0:/tmp/neko-cache/page-2.jpg',
              toolCallId: 'read-image-2',
              assetIndex: 0,
              type: 'image',
              src: 'webview://page-2.jpg',
              localPath: '/tmp/neko-cache/page-2.jpg',
              resourceRef,
              mimeType: 'image/jpeg',
            },
          ],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    const payload = projectStoryboardTableTransferPayload(data);
    if (payload?.kind !== 'canvasStoryboard') {
      throw new Error('expected canvas storyboard payload');
    }

    const shotPlan = payload.storyboard.scenes[0]?.shotPlans[0];
    expect(shotPlan).not.toHaveProperty('referenceImagePath');
    expect(shotPlan).not.toHaveProperty('referenceImageResourceRef');
  });

  it('keeps explicit media refs aligned when shot numbers repeat across scenes', () => {
    const firstResourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-1.jpg',
      cachePath: '/tmp/neko-cache/page-1.jpg',
      versionPolicy: 'read-only-source' as const,
    };
    const secondResourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-2.jpg',
      cachePath: '/tmp/neko-cache/page-2.jpg',
      versionPolicy: 'read-only-source' as const,
    };
    const data: StoryboardTableRichData = {
      template: 'storyboard-table',
      title: 'Opening',
      storyboardTable: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Semantic Opening',
        scenes: [
          {
            sceneId: 'scene-page-1',
            sceneTitle: 'Page 1',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'First page.',
                characterAction: 'The character enters.',
                imageStrategy: 'generate-new',
                sourceMediaRefs: [
                  {
                    refId: 'page-1',
                    role: 'source',
                    locator: {
                      type: 'tool-result',
                      toolCallId: 'read-image-1',
                      assetIndex: 0,
                    },
                    mimeType: 'image/jpeg',
                  },
                ],
              },
            ],
          },
          {
            sceneId: 'scene-page-2',
            sceneTitle: 'Page 2',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'Second page.',
                characterAction: 'The character reacts.',
                imageStrategy: 'generate-new',
                sourceMediaRefs: [
                  {
                    refId: 'page-2',
                    role: 'source',
                    locator: {
                      type: 'tool-result',
                      toolCallId: 'read-image-2',
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
      sections: [
        {
          id: 'section-0',
          index: 0,
          heading: 'Page 1 Shot 1',
          media: [
            {
              id: 'read-image-1:0:/tmp/neko-cache/page-1.jpg',
              toolCallId: 'read-image-1',
              assetIndex: 0,
              type: 'image',
              src: 'webview://page-1.jpg',
              localPath: '/tmp/neko-cache/page-1.jpg',
              resourceRef: firstResourceRef,
              mimeType: 'image/jpeg',
            },
          ],
          diagnostics: [],
        },
        {
          id: 'section-1',
          index: 1,
          heading: 'Page 2 Shot 1',
          media: [
            {
              id: 'read-image-2:0:/tmp/neko-cache/page-2.jpg',
              toolCallId: 'read-image-2',
              assetIndex: 0,
              type: 'image',
              src: 'webview://page-2.jpg',
              localPath: '/tmp/neko-cache/page-2.jpg',
              resourceRef: secondResourceRef,
              mimeType: 'image/jpeg',
            },
          ],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    const payload = projectStoryboardTableTransferPayload(data);

    expect(payload).toMatchObject({
      kind: 'canvasStoryboard',
      storyboard: {
        scenes: [
          {
            shotPlans: [
              {
                referenceImagePath: '/tmp/neko-cache/page-1.jpg',
                referenceImageResourceRef: firstResourceRef,
              },
            ],
          },
          {
            shotPlans: [
              {
                referenceImagePath: '/tmp/neko-cache/page-2.jpg',
                referenceImageResourceRef: secondResourceRef,
              },
            ],
          },
        ],
      },
    });
  });

  it('disables storyboard semantic transfer payloads when validation has errors', () => {
    const data: StoryboardTableRichData = {
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
          id: 'section-0',
          index: 0,
          heading: 'Storyboard validation failed',
          content: '[error] missing-required-field',
          media: [],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    expect(projectStoryboardTableTransferPayload(data)).toBeNull();
    expect(projectStoryboardTableCutTimelinePayload(data)).toBeNull();
  });

  it('projects markdown storyboard tables to canvas storyboard payloads', () => {
    const payload = projectMarkdownStoryboardTransferPayload(`
## 瑞德发现神灯

| 镜头 | 画面 | 时长 | 景别 | 提示词 | 对白 |
| --- | --- | --- | --- | --- | --- |
| 1 | 瑞德在黄昏牧场发现古老神灯 | 4 秒 | LS | wide anime frame, magic lamp glow | 这是什么？ |
| 2 | 神灯喷出紫色烟雾，瑞德后退 | 3 秒 | CU | close-up, purple smoke, surprised boy |  |
`);

    expect(payload).toEqual({
      kind: 'canvasStoryboard',
      storyboard: {
        mode: 'semantic',
        sourceScriptUri: 'agent://markdown/storyboard-table',
        scenes: [
          {
            sceneId: 'agent-markdown-scene-1-1',
            sceneTitle: '瑞德发现神灯',
            sceneNumber: 1,
            shotPlans: [
              {
                shotNumber: 1,
                duration: 4,
                visualDescription: '瑞德在黄昏牧场发现古老神灯',
                characters: [],
                shotScale: 'LS',
                characterAction: '瑞德在黄昏牧场发现古老神灯',
                emotion: [],
                sceneTags: ['瑞德发现神灯'],
                dialogue: '这是什么？',
                generationPrompt: 'wide anime frame, magic lamp glow',
              },
              {
                shotNumber: 2,
                duration: 3,
                visualDescription: '神灯喷出紫色烟雾，瑞德后退',
                characters: [],
                shotScale: 'CU',
                characterAction: '神灯喷出紫色烟雾，瑞德后退',
                emotion: [],
                sceneTags: ['瑞德发现神灯'],
                generationPrompt: 'close-up, purple smoke, surprised boy',
              },
            ],
          },
        ],
      },
    });
  });

  it('projects only storyboard-ready assistant markdown for Canvas transfer', () => {
    expect(
      projectAssistantMarkdownCanvasTransferPayload({
        content: `
| 镜头 | 画面 |
| --- | --- |
| 1 | 角色进入森林 |
`,
        target: { plugin: 'canvas', mode: 'insert' },
        provenance: { source: 'webview', label: 'assistant-text-block' },
      }),
    ).toMatchObject({ kind: 'canvasStoryboard' });

    expect(
      projectAssistantMarkdownCanvasTransferPayload({
        content: '建议采用 60 秒标准序章版：既能保留传说说明，也能完整呈现悬念。',
        target: { plugin: 'canvas', mode: 'insert' },
        provenance: { source: 'webview', label: 'assistant-text-block' },
      }),
    ).toBeNull();
  });
});
