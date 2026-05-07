import { describe, expect, it } from 'vitest';
import type { ContentBlock, ToolCall } from '@neko-agent/types';
import { projectCompositeBlockRichContent } from '../composite-content-presenter';

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

function makeImageToolCall(): ToolCall {
  return {
    id: 'call-1',
    name: 'GenerateImage',
    arguments: { prompt: 'cat' },
    result: {
      success: true,
      data: {
        assets: [
          {
            id: 'asset-1',
            type: 'generated-image',
            path: '/repo/.neko/generated/image/out.png',
            webviewUri: 'webview://asset-1.png',
            mimeType: 'image/png',
            generatedAt: '2026-01-01T00:00:00.000Z',
            width: 1024,
            height: 1024,
            ratio: '1:1',
            assetRef: {
              assetId: 'asset-1',
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
