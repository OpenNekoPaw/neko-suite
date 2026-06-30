import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  projectStoryboardScenesAssetBatch,
  projectStoryboardScenesCutTimelinePayload,
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

  it('poisons old Markdown storyboard compiler transfer paths for new Canvas requests', async () => {
    const presenterSource = readFileSync(
      resolve(process.cwd(), 'src/presenters/storyboard-transfer-presenter.ts'),
      'utf8',
    );

    expect(presenterSource).not.toContain('@neko/draft-runtime');
    expect(presenterSource).not.toContain('@neko/storyboard-draft');
    expect(presenterSource).not.toContain('compile-storyboard-table');
    expect(presenterSource).not.toContain('agent://markdown/storyboard-table');

    const moduleExports = (await import('../storyboard-transfer-presenter')) as Record<
      string,
      unknown
    >;
    expect(moduleExports.projectMarkdownStoryboardTransferPayload).toBeUndefined();
    expect(moduleExports.projectAssistantMarkdownCanvasTransferPayload).toBeUndefined();
    expect(moduleExports.projectAssistantMarkdownCanvasDraftPayload).toBeUndefined();
  });
});
