import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import {
  createBuiltInNodeCardPolicyRegistry,
  evaluateActionCondition,
  fallbackCardPolicy,
  getNodeCardPolicy,
  getStableSafeVariantUrl,
  mediaCardPolicy,
  shotCardPolicy,
  textCardPolicy,
} from './index';

describe('node card policies', () => {
  it('builds media preview descriptors without runtime URLs', () => {
    const node = createMediaNode('media-1', {
      assetPath: 'assets/ref.png',
      thumbnailPath: 'assets/ref-thumb.png',
      mediaType: 'image',
    });

    const source = mediaCardPolicy.resolvePreviewSource(node);

    expect(source).toMatchObject({
      renderForm: 'asset-thumbnail',
      source: {
        id: 'node-card:media-1:media',
        role: 'image',
        asset: {
          kind: 'asset-identity',
          path: 'assets/ref-thumb.png',
          mediaType: 'image',
        },
        variants: [{ id: 'stable-source', role: 'image', sourcePath: 'assets/ref-thumb.png' }],
      },
    });
    expect(JSON.stringify(source)).not.toContain('runtimeUrl');
  });

  it('uses document entry refs as stable media titles while rendering from runtime paths', () => {
    const node = createMediaNode('media-doc-entry', {
      assetPath: '',
      documentResourceRef: {
        kind: 'document-entry',
        source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
        entryPath: 'image/page-1.jpg',
        cachePath: '/tmp/neko_epub_1/0001_page-1.jpg',
        versionPolicy: 'versioned-export',
      },
      runtimeAssetPath:
        'https://file+.vscode-resource.vscode-cdn.net/tmp/neko_epub_1/0001_page-1.jpg',
      mediaType: 'image',
    });

    const source = mediaCardPolicy.resolvePreviewSource(node);

    expect(mediaCardPolicy.resolveTitle(node)).toBe('page-1.jpg');
    expect(source).toMatchObject({
      renderForm: 'asset-thumbnail',
      source: {
        asset: {
          kind: 'asset-identity',
          path: 'https://file+.vscode-resource.vscode-cdn.net/tmp/neko_epub_1/0001_page-1.jpg',
          mediaType: 'image',
        },
        metadata: { documentResourceRef: expect.objectContaining({ kind: 'document-entry' }) },
      },
    });
    if (source.renderForm !== 'asset-thumbnail') {
      throw new Error('Expected asset thumbnail preview');
    }
    expect(JSON.stringify(source.source.variants ?? [])).not.toContain('cachePath');
  });

  it('shows document cache expiry without treating cache paths as previews', () => {
    const node = createMediaNode('media-doc-missing', {
      assetPath: '',
      documentResourceRef: {
        kind: 'document-entry',
        source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
        entryPath: 'image/page-1.jpg',
        cachePath: '/tmp/neko_epub_1/0001_page-1.jpg',
        versionPolicy: 'versioned-export',
      },
      documentResourceStatus: {
        state: 'unavailable',
        reason: 'cache-missing',
        message: 'Document cache expired. Reopen the source document to regenerate the preview.',
      },
      mediaType: 'image',
    });

    const source = mediaCardPolicy.resolvePreviewSource(node);

    expect(source).toMatchObject({
      renderForm: 'asset-thumbnail',
      source: {
        asset: undefined,
        variants: undefined,
      },
    });
    expect(mediaCardPolicy.resolveSubtitle?.(node)).toBe(
      'Document cache expired. Reopen the source document to regenerate the preview.',
    );
    expect(mediaCardPolicy.resolveBadges?.(node)).toContainEqual({
      label: 'Cache',
      tone: 'warning',
    });
  });

  it('maps video media to media-poster and audio to waveform', () => {
    expect(
      mediaCardPolicy.resolvePreviewSource(
        createMediaNode('video-1', { assetPath: 'clip.mp4', mediaType: 'video' }),
      ).renderForm,
    ).toBe('media-poster');
    expect(
      mediaCardPolicy.resolvePreviewSource(
        createMediaNode('audio-1', { assetPath: 'voice.wav', mediaType: 'audio' }),
      ).renderForm,
    ).toBe('waveform');
  });

  it('represents shot inline preview as role-matched safe variant', () => {
    const node = createShotNode({
      id: 'shot-1',
      data: {
        shotNumber: 7,
        visualDescription: 'A bright doorway',
        generationStatus: 'done',
        generationHistory: [
          {
            id: 'candidate-1',
            dataUrl: 'data:image/png;base64,shot',
            selected: true,
          },
        ],
      },
    });

    const source = shotCardPolicy.resolvePreviewSource(node);

    expect(source.renderForm).toBe('asset-thumbnail');
    if (source.renderForm !== 'asset-thumbnail') {
      throw new Error('expected asset preview');
    }
    expect(source.source.role).toBe('generation-candidate');
    expect(source.source.variants).toEqual([
      {
        id: 'candidate-1',
        role: 'generation-candidate',
        sourcePath: 'data:image/png;base64,shot',
        selected: true,
      },
    ]);
    expect(getStableSafeVariantUrl(source.source)).toBe('data:image/png;base64,shot');
  });

  it('builds text card previews from bounded excerpts', () => {
    const node = createTextNode('text-1', 'A compact note for the scene');

    expect(textCardPolicy.resolvePreviewSource(node)).toEqual({
      renderForm: 'text',
      textExcerpt: 'A compact note for the scene',
    });
    expect(textCardPolicy.resolveTitle(node)).toBe('A compact note for the scene');
  });

  it('uses fallback policy for unknown or unregistered node types', () => {
    const registry = createBuiltInNodeCardPolicyRegistry();
    const node = {
      id: 'storyboard-1',
      type: 'storyboard',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 80 },
      zIndex: 1,
      data: { title: 'Legacy board' },
    } as CanvasNode;

    expect(getNodeCardPolicy(registry, node)).toBe(fallbackCardPolicy);
    expect(fallbackCardPolicy.resolvePreviewSource(node).renderForm).toBe('icon');
  });
});

describe('action condition evaluator', () => {
  it('evaluates card and container scopes', () => {
    const idle = createShotNode({
      id: 'idle',
      data: { generationStatus: 'idle', generationHistory: [] },
    });
    const generating = createShotNode({
      id: 'generating',
      data: { generationStatus: 'generating', generationHistory: [] },
    });

    expect(
      evaluateActionCondition('has-selection', {
        node: idle,
        selection: { nodeIds: ['idle'] },
      }),
    ).toBe(true);
    expect(
      evaluateActionCondition('not-generating', {
        node: idle,
        childNodes: [idle, generating],
        selection: { nodeIds: [] },
      }),
    ).toBe(false);
    expect(
      evaluateActionCondition('has-asset', {
        node: createMediaNode('media-1', { assetPath: 'assets/ref.png' }),
        selection: { nodeIds: [] },
      }),
    ).toBe(true);
    expect(
      evaluateActionCondition('has-asset', {
        node: createMediaNode('media-2', {
          assetPath: '',
          runtimeAssetPath:
            'https://file+.vscode-resource.vscode-cdn.net/tmp/neko_epub_1/0001_page-1.jpg',
        }),
        selection: { nodeIds: [] },
      }),
    ).toBe(true);
  });

  it('uses resolved preview source for has-preview', () => {
    const node = createShotNode({
      id: 'shot-1',
      data: {
        generationHistory: [
          { id: 'candidate-1', dataUrl: 'data:image/png;base64,x', selected: true },
        ],
      },
    });
    const previewSource = shotCardPolicy.resolvePreviewSource(node);

    expect(
      evaluateActionCondition('has-preview', {
        node,
        previewSource,
        selection: { nodeIds: [] },
      }),
    ).toBe(true);
  });
});

function createMediaNode(
  id: string,
  data: Partial<Extract<CanvasNode, { type: 'media' }>['data']>,
): CanvasNode {
  return {
    id,
    type: 'media',
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 },
    zIndex: 1,
    data: {
      assetPath: '',
      ...data,
    },
  } as CanvasNode;
}

function createShotNode(input: { id: string; data?: Record<string, unknown> }): CanvasNode {
  return {
    id: input.id,
    type: 'shot',
    position: { x: 0, y: 0 },
    size: { width: 220, height: 200 },
    zIndex: 1,
    data: {
      shotNumber: 1,
      duration: 3,
      visualDescription: '',
      characters: [],
      shotScale: 'MS',
      characterAction: '',
      emotion: [],
      sceneTags: [],
      generationStatus: 'idle',
      generationHistory: [],
      ...input.data,
    },
  } as CanvasNode;
}

function createTextNode(id: string, content: string): CanvasNode {
  return {
    id,
    type: 'text',
    position: { x: 0, y: 0 },
    size: { width: 160, height: 100 },
    zIndex: 1,
    data: { content },
  } as CanvasNode;
}
