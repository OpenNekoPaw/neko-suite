import { describe, expect, it } from 'vitest';
import {
  projectStoryboardScenesAssetBatch,
  projectStoryboardScenesCutTimelinePayload,
  projectStoryboardScenesTransferPayload,
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
});
