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
