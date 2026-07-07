import { describe, expect, it } from 'vitest';
import {
  projectStoryboardScenesAssetBatch,
  projectStoryboardTableAssetBatch,
  projectStoryboardTableCutTimelinePayload,
} from '../storyboard-transfer-presenter';
import type { StoryboardTableRichData } from '../composite-content-presenter';

describe('storyboard transfer presenter', () => {
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

  it('does not transfer scene cache paths as image assets', () => {
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
  });

  it('does not project composite-only storyboard sections to cut storyboard payloads', () => {
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

    expect(projectStoryboardTableAssetBatch(data)).toEqual({
      kind: 'assetBatch',
      assets: [{ path: '${WORKSPACE}/assets/asset.png', mediaType: 'image', name: 'Wide' }],
    });

    expect(projectStoryboardTableCutTimelinePayload(data)).toBeNull();
  });

  it('projects typed storyboard tables to cut storyboard payloads', () => {
    const data: StoryboardTableRichData = {
      template: 'storyboard-table',
      title: 'Opening',
      diagnostics: [],
      storyboardTable: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Opening',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Opening',
            shots: [
              {
                shotNumber: 1,
                duration: 4,
                visualDescription: 'Wide establishing frame',
                characterAction: 'The character looks across the hallway.',
                imageStrategy: 'reuse-original',
                mediaRefs: [
                  {
                    refId: 'asset-1',
                    role: 'source',
                    locator: {
                      type: 'workspace-path',
                      path: '${WORKSPACE}/assets/asset.png',
                    },
                    mimeType: 'image/png',
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
          content: 'Wide establishing frame',
          media: [
            {
              id: 'media-1',
              toolCallId: 'readimage-current-result',
              assetIndex: 0,
              assetId: 'asset-1',
              type: 'image',
              src: 'webview://asset.png',
              stableUri: '${WORKSPACE}/assets/asset.png',
              caption: 'Wide',
            },
          ],
          diagnostics: [],
        },
      ],
    };

    expect(projectStoryboardTableCutTimelinePayload(data)).toEqual({
      kind: 'cutStoryboard',
      storyboard: {
        projectName: 'Opening',
        shots: [
          {
            id: 'scene-1-shot-1',
            shotNumber: 1,
            duration: 4,
            imagePath: '${WORKSPACE}/assets/asset.png',
            label: '#001 Opening',
          },
        ],
      },
    });
  });

  it('poisons old Markdown storyboard compiler transfer paths for new Canvas requests', async () => {
    const moduleExports = (await import('../storyboard-transfer-presenter')) as Record<
      string,
      unknown
    >;
    expect(moduleExports.projectStoryboardScenesCutTimelinePayload).toBeUndefined();
    expect(moduleExports.projectMarkdownStoryboardTransferPayload).toBeUndefined();
    expect(moduleExports.projectAssistantMarkdownCanvasTransferPayload).toBeUndefined();
    expect(moduleExports.projectAssistantMarkdownCanvasDraftPayload).toBeUndefined();
  });
});
