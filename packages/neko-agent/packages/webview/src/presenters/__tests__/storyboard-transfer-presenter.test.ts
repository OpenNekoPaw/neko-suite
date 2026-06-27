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
            {
              url: 'webview://shot-1.png',
              localPath: '${WORKSPACE}/shots/shot-1.png',
              shotIndex: 1,
            },
            { url: 'webview://shot-2.png', shotIndex: 2 },
          ],
        },
      ]),
    ).toEqual({
      kind: 'assetBatch',
      assets: [
        {
          path: '${WORKSPACE}/shots/shot-1.png',
          mediaType: 'image',
          name: 'scene-2-shot-1',
        },
      ],
    });
  });

  it('does not transfer scene cache paths as image assets or cut shots', () => {
    const scenes = [
      {
        sceneIndex: 2,
        heading: 'EXT. STREET - NIGHT',
        shots: [
          {
            url: 'webview://shot-1.png',
            localPath: '/repo/.neko/.cache/generated/shot-1.png',
            shotIndex: 1,
          },
          {
            url: 'webview://shot-2.png',
            localPath: 'blob:webview-shot-2',
            shotIndex: 2,
          },
        ],
      },
    ];

    expect(projectStoryboardScenesAssetBatch(scenes)).toBeNull();
    expect(projectStoryboardScenesCutTimelinePayload(scenes)).toBeNull();
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
              localPath: '${WORKSPACE}/shots/shot-1.png',
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
            imagePath: '${WORKSPACE}/shots/shot-1.png',
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
              stableUri: '${WORKSPACE}/assets/asset.png',
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
                referenceImagePath: '${WORKSPACE}/assets/asset.png',
              },
            ],
          },
        ],
      },
    });

    expect(projectStoryboardTableAssetBatch(data)).toEqual({
      kind: 'assetBatch',
      assets: [{ path: '${WORKSPACE}/assets/asset.png', mediaType: 'image', name: 'Wide' }],
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
            imagePath: '${WORKSPACE}/assets/asset.png',
            dialogue: 'Wide establishing frame',
            label: 'Wide',
          },
        ],
      },
    });
  });

  it('does not transfer composite media localPath as a content identity', () => {
    const data: StoryboardTableRichData = {
      template: 'storyboard-table',
      sections: [
        {
          id: 'section-0',
          index: 0,
          content: 'Local path only.',
          media: [
            {
              id: 'media-1',
              toolCallId: 'call-1',
              assetIndex: 0,
              type: 'image',
              src: 'webview://asset.png',
              localPath: '${WORKSPACE}/assets/asset.png',
            },
          ],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

	    const payload = projectStoryboardTableTransferPayload(data);
	    const shotPlans =
	      payload?.kind === 'canvasStoryboard' ? (payload.storyboard.scenes[0]?.shotPlans ?? []) : [];
	    expect(shotPlans[0]).not.toHaveProperty('referenceImagePath');
	    expect(projectStoryboardTableAssetBatch(data)).toBeNull();
	    expect(projectStoryboardTableCutTimelinePayload(data)).toBeNull();
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
        creativeScope: {
          kind: 'scene',
          workId: 'scene-semantic',
          title: 'Semantic Scene',
          sceneIds: ['scene-semantic'],
          shotIds: ['scene-semantic-shot-7'],
          sourceStoryboardRef: 'agent://rich-content/storyboard-table',
        },
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
                shotImagePrepPlan: {
                  schemaVersion: 1,
                  kind: 'shot-image-prep-plan',
                  planId: 'scene-semantic-shot-7-image-prep',
                  sceneId: 'scene-semantic',
                  shotId: 'scene-semantic-shot-7',
                  sourceMediaRefs: [],
                  imageStrategy: 'generate-new',
                  operationPlan: ['generate-keyframe'],
                  generationPrompt: 'semantic prompt',
                  status: 'planned',
                },
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
                referenceImageResourceRef: {
                  kind: 'document-entry',
                  source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
                  entryPath: 'image/panel-1.jpg',
                  versionPolicy: 'versioned-export',
                },
              },
            ],
          },
        ],
      },
    });

    expect(projectStoryboardTableAssetBatch(data)).toMatchObject({
      kind: 'assetBatch',
      assets: [
        {
          documentResourceRef: {
            kind: 'document-entry',
            entryPath: 'image/panel-1.jpg',
          },
        },
      ],
    });
  });

  it('resolves semantic storyboard source media refs for Canvas image previews', () => {
    const resourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-1.jpg',
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
        creativeScope: {
          kind: 'scene',
          workId: 'scene-page-1',
          title: 'Page 1',
          sceneIds: ['scene-page-1'],
          shotIds: ['scene-page-1-shot-1'],
          sourceStoryboardRef: 'agent://rich-content/storyboard-table',
        },
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
                referenceImageResourceRef: resourceRef,
                shotImagePrepPlan: {
                  schemaVersion: 1,
                  kind: 'shot-image-prep-plan',
                  planId: 'scene-page-1-shot-1-image-prep',
                  sceneId: 'scene-page-1',
                  shotId: 'scene-page-1-shot-1',
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
                  imageStrategy: 'use-as-reference',
                  operationPlan: [],
                  status: 'planned',
                },
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
      versionPolicy: 'read-only-source' as const,
    };
    const secondResourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-2.jpg',
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
                referenceImageResourceRef: firstResourceRef,
              },
            ],
          },
          {
            shotPlans: [
              {
                referenceImageResourceRef: secondResourceRef,
              },
            ],
          },
        ],
      },
    });
  });

  it('binds multiple selected shot media refs to distinct Canvas preview resources', () => {
    const firstDocumentRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/panel-a.jpg',
      versionPolicy: 'read-only-source' as const,
    };
    const secondDocumentRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/panel-b.jpg',
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
            sceneId: 'scene-page',
            sceneTitle: 'Page',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                characterAction: 'The first selected panel anchors the shot.',
                visualDescription: 'First selected panel.',
                imageStrategy: 'use-as-reference',
                sourceMediaRefs: [
                  {
                    refId: 'selected-panel-a',
                    role: 'source',
                    locator: { type: 'tool-result', toolCallId: 'read-image', assetIndex: 0 },
                    mimeType: 'image/jpeg',
                  },
                ],
              },
              {
                shotNumber: 1,
                duration: 3,
                characterAction: 'The second selected panel anchors the shot.',
                visualDescription: 'Second selected panel.',
                imageStrategy: 'use-as-reference',
                sourceMediaRefs: [
                  {
                    refId: 'selected-panel-b',
                    role: 'source',
                    locator: { type: 'tool-result', toolCallId: 'read-image', assetIndex: 1 },
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
          heading: 'Selected panels',
          media: [
            {
              id: 'read-image:0:/tmp/neko-cache/panel-a.jpg',
              toolCallId: 'read-image',
              assetIndex: 0,
              type: 'image',
              src: 'webview://panel-a.jpg',
              localPath: '/tmp/neko-cache/panel-a.jpg',
              resourceRef: firstDocumentRef,
              mimeType: 'image/jpeg',
            },
            {
              id: 'read-image:1:/tmp/neko-cache/panel-b.jpg',
              toolCallId: 'read-image',
              assetIndex: 1,
              type: 'image',
              src: 'webview://panel-b.jpg',
              localPath: '/tmp/neko-cache/panel-b.jpg',
              resourceRef: secondDocumentRef,
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

    const shotPlans = payload.storyboard.scenes[0]?.shotPlans ?? [];
    expect(shotPlans).toHaveLength(2);
    expect(shotPlans[0]).toMatchObject({
      referenceImageResourceRef: firstDocumentRef,
    });
    expect(shotPlans[1]).toMatchObject({
      referenceImageResourceRef: secondDocumentRef,
    });
    expect(shotPlans[0]?.referenceImageResourceRef?.entryPath).not.toBe(
      shotPlans[1]?.referenceImageResourceRef?.entryPath,
    );
    expect(shotPlans[0]).not.toHaveProperty('referenceResourceRef');
    expect(shotPlans[1]).not.toHaveProperty('referenceResourceRef');
    expect(shotPlans[0]).not.toHaveProperty('referenceImagePath');
    expect(shotPlans[1]).not.toHaveProperty('referenceImagePath');
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

  it('keeps semantic storyboard canvas transfer available when only media refs are unresolved', () => {
    const data: StoryboardTableRichData = {
      template: 'storyboard-table',
      title: 'Media Ref Warning',
      storyboardTable: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Media Ref Warning',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Page 1',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'The hero studies an unreadable page.',
                characterAction: 'The hero leans closer.',
                imageStrategy: 'use-as-reference',
                sourceMediaRefs: [
                  {
                    refId: 'missing-page',
                    role: 'source',
                    locator: {
                      type: 'tool-result',
                      toolCallId: 'missing-read-image',
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
      storyboardDiagnostics: [
        {
          severity: 'error',
          code: 'unresolved-tool-result',
          path: ['scenes', 0, 'shots', 0, 'sourceMediaRefs', 0],
          message: 'Storyboard media references a tool result that is not available.',
        },
      ],
      sections: [{ id: 'section-0', index: 0, heading: 'Shot 1', media: [], diagnostics: [] }],
      diagnostics: [],
    };

    const payload = projectStoryboardTableTransferPayload(data);
    if (payload?.kind !== 'canvasStoryboard') {
      throw new Error('expected canvas storyboard payload');
    }

    const shot = payload.storyboard.scenes[0]?.shotPlans[0];
    expect(shot).toMatchObject({
      visualDescription: 'The hero studies an unreadable page.',
      characterAction: 'The hero leans closer.',
    });
    expect(shot).not.toHaveProperty('referenceImagePath');
    expect(shot).not.toHaveProperty('referenceImageResourceRef');
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

  it('binds markdown storyboard source pages to sibling tool result resource refs', () => {
    const page6DocumentRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-6.jpg',
    };
    const page7DocumentRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-7.jpg',
    };
    const payload = projectMarkdownStoryboardTransferPayload(
      `
## 前十页分镜

| Shot ID | 原页 | 时长 | 景别 | 画面内容 |
| --- | --- | --- | --- | --- |
| S010 | P6 | 5s | 大远景 | 火山压在废墟村庄之后 |
| S011 | P6 | 5s | 中景 | 瑞德手持牧羊杖站在废墟前 |
| S015 | P7 | 6s | 大远景 | 瑞德带两只羊走在山坡下方 |
`,
      {
        toolCalls: [
          {
            id: 'read-doc',
            name: 'ReadDocument',
            arguments: {},
            result: {
              success: true,
              data: {
                imageInfo: [
                  {
                    path: '/cache/page-6.jpg',
                    label: 'Page 6',
                    locator: { kind: 'page', pageNumber: 6 },
                    resourceRef: page6DocumentRef,
                  },
                  {
                    path: '/cache/page-7.jpg',
                    label: 'Page 7',
                    locator: { kind: 'page', pageNumber: 7 },
                    resourceRef: page7DocumentRef,
                  },
                ],
              },
            },
          },
        ],
      },
    );

    expect(payload).toMatchObject({
      kind: 'canvasStoryboard',
      storyboard: {
        scenes: [
          {
            shotPlans: [
              {
                referenceImageResourceRef: page6DocumentRef,
              },
              {
                referenceImageResourceRef: page6DocumentRef,
              },
              {
                referenceImageResourceRef: page7DocumentRef,
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
    expect(shotPlans[2]).not.toHaveProperty('referenceImagePath');
  });

  it('does not attach markdown images when source page aliases are ambiguous across batches', () => {
    const payload = projectMarkdownStoryboardTransferPayload(
      `
## 前十页分镜

| Shot ID | 原页 | 时长 | 景别 | 画面内容 |
| --- | --- | --- | --- | --- |
| S001 | P1 | 5s | 大远景 | 第一页画面 |
`,
      {
        toolCalls: [
          {
            id: 'read-doc-a',
            name: 'ReadDocument',
            arguments: {},
            result: {
              success: true,
              data: {
                imageInfo: [
                  {
                    path: '/cache/a/page-1.jpg',
                    label: 'Page 1',
                    alias: 'page_1',
                    aliasScope: 'document:comic-a',
                    sourceDocumentId: 'comic-a',
                  },
                ],
              },
            },
          },
          {
            id: 'read-doc-b',
            name: 'ReadDocument',
            arguments: {},
            result: {
              success: true,
              data: {
                imageInfo: [
                  {
                    path: '/cache/b/page-1.jpg',
                    label: 'Page 1',
                    alias: 'page_1',
                    aliasScope: 'document:comic-b',
                    sourceDocumentId: 'comic-b',
                  },
                ],
              },
            },
          },
        ],
      },
    );

    const shotPlans =
      payload?.kind === 'canvasStoryboard' ? (payload.storyboard.scenes[0]?.shotPlans ?? []) : [];
    expect(shotPlans[0]).not.toHaveProperty('referenceImagePath');
    expect(shotPlans[0]).not.toHaveProperty('referenceImageResourceRef');
    expect(shotPlans[0]).not.toHaveProperty('referenceResourceRef');
  });

  it('does not use runtime cache paths as markdown Canvas image identity', () => {
    const payload = projectMarkdownStoryboardTransferPayload(`
## 前十页分镜

| Shot ID | 原页 | 画面内容 | 参考图 |
| --- | --- | --- | --- |
| S001 | P1 | 第一页画面 | /mock/workspace/.neko/.cache/resources/documents/doc_comic/OPS/page-1.jpg |
`);

    const shotPlans =
      payload?.kind === 'canvasStoryboard' ? (payload.storyboard.scenes[0]?.shotPlans ?? []) : [];
    expect(shotPlans[0]).not.toHaveProperty('referenceImagePath');
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

  it('merges storyboard animation overlays into Canvas shot plans', () => {
    const payload = projectStoryboardTableTransferPayload({
      template: 'storyboard-table',
      title: 'Opening',
      storyboardTable: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Opening',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Scene 1',
            shots: [
              {
                shotId: 'shot-1',
                shotNumber: 1,
                duration: 4,
                visualDescription: 'Rin sees the signal.',
                characterAction: 'Rin leans closer.',
                visualStyle: 'watercolor manga',
                sceneTags: ['signal'],
                imageStrategy: 'use-as-reference',
                generationPrompt: 'base storyboard prompt',
              },
            ],
          },
        ],
      },
      storyboardPlanOverlays: [
        {
          schemaVersion: 1,
          kind: 'storyboard-plan-overlay',
          overlayType: 'AnimationPlan',
          sourceStoryboardRef: { kind: 'artifact', artifactId: 'storyboard-1' },
          shotOverlays: [
            {
              shotId: 'shot-1',
              motionIntent: 'hair moves in the rain',
              cameraIntent: 'slow push-in',
              imagePrep: { operations: ['text-removal', 'upscale'], notes: 'clean speech text' },
              videoPromptIntent: { positive: 'cinematic rain motion' },
              requiresImagePrep: true,
              requiresVideoGeneration: true,
            },
          ],
        },
      ],
      sections: [{ id: 'section-0', index: 0, media: [], diagnostics: [] }],
      diagnostics: [],
    });

    const shotPlan =
      payload?.kind === 'canvasStoryboard' ? payload.storyboard.scenes[0]?.shotPlans[0] : undefined;
    expect(shotPlan).toMatchObject({
      shotId: 'shot-1',
      generationPrompt:
        'base storyboard prompt\ncinematic rain motion\nhair moves in the rain\nslow push-in',
      shotImagePrepPlan: {
        shotId: 'shot-1',
        imageStrategy: 'use-as-reference',
        operationPlan: ['remove-text', 'upscale', 'generate-keyframe'],
        targetStyle: 'watercolor manga',
        editInstruction: 'clean speech text',
        generationPrompt:
          'base storyboard prompt\ncinematic rain motion\nhair moves in the rain\nslow push-in',
        metadata: {
          motionIntent: 'hair moves in the rain',
          cameraIntent: 'slow push-in',
          requiresVideoGeneration: true,
        },
      },
    });
  });
});
