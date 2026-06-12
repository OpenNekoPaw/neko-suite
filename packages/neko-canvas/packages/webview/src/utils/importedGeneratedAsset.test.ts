import { describe, expect, it } from 'vitest';
import { createResourceFingerprint, createResourceRef } from '@neko/shared';
import {
  getImportedGeneratedAssetNodeInput,
  normalizeImportedGeneratedAsset,
  normalizeImportedMediaType,
} from './importedGeneratedAsset';

describe('imported generated asset normalization', () => {
  it('preserves explicit generated asset media types', () => {
    expect(normalizeImportedMediaType('generated-video', '/tmp/clip.bin')).toBe('video');
    expect(normalizeImportedMediaType('generated-audio', '/tmp/audio.bin')).toBe('audio');
    expect(normalizeImportedMediaType('generated-image', '/tmp/frame.bin')).toBe('image');
  });

  it('falls back to the asset path extension when type is absent', () => {
    expect(normalizeImportedMediaType(undefined, '/tmp/clip.webm?cache=1')).toBe('video');
    expect(normalizeImportedMediaType(undefined, '/tmp/sound.flac#frag')).toBe('audio');
    expect(normalizeImportedMediaType(undefined, '/tmp/frame.webp')).toBe('image');
  });

  it('normalizes payloads into media-node-ready DTOs', () => {
    expect(
      normalizeImportedGeneratedAsset({
        path: 'https://file+.vscode-resource.vscode-cdn.net/repo/.neko/generated/image/out.png',
        originalPath: '/repo/.neko/generated/image/out.png',
        type: 'image',
      }),
    ).toEqual({
      path: 'https://file+.vscode-resource.vscode-cdn.net/repo/.neko/generated/image/out.png',
      originalPath: '/repo/.neko/generated/image/out.png',
      mediaType: 'image',
      name: 'out.png',
    });
  });

  it('preserves document entry resource refs for linked imports', () => {
    const documentResourceRef = {
      kind: 'document-entry',
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
      entryPath: 'image/page-1.jpg',
      cachePath: '/tmp/neko_epub_1/0001_page-1.jpg',
      versionPolicy: 'versioned-export',
    };
    const resourceRef = createResourceRef({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        document: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
        filePath: '${BOOKS}/comic.epub',
      },
      locator: { kind: 'document', entryPath: 'image/page-1.jpg' },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'comic:image/page-1.jpg',
        providerId: 'document-archive',
      }),
    });

    expect(
      normalizeImportedGeneratedAsset({
        path: 'https://file+.vscode-resource.vscode-cdn.net/tmp/neko_epub_1/0001_page-1.jpg',
        originalPath: '/tmp/neko_epub_1/0001_page-1.jpg',
        type: 'image',
        documentResourceRef,
        resourceRef,
      }),
    ).toEqual({
      path: 'https://file+.vscode-resource.vscode-cdn.net/tmp/neko_epub_1/0001_page-1.jpg',
      originalPath: '/tmp/neko_epub_1/0001_page-1.jpg',
      mediaType: 'image',
      name: '0001_page-1.jpg',
      documentResourceRef,
      resourceRef,
    });
  });

  it('separates durable refs from runtime preview paths for linked imports', () => {
    const resourceRef = createResourceRef({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        document: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
        filePath: '${BOOKS}/comic.epub',
      },
      locator: { kind: 'document', entryPath: 'image/page-1.jpg' },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'comic:image/page-1.jpg',
        providerId: 'document-archive',
      }),
    });
    const asset = normalizeImportedGeneratedAsset({
      path: 'https://file+.vscode-resource.vscode-cdn.net/tmp/neko_epub_1/0001_page-1.jpg',
      originalPath: '/tmp/neko_epub_1/0001_page-1.jpg',
      type: 'image',
      resourceRef,
    });

    if (!asset) throw new Error('expected normalized asset');

    expect(getImportedGeneratedAssetNodeInput(asset)).toEqual({
      assetPath: '',
      runtimeAssetPath:
        'https://file+.vscode-resource.vscode-cdn.net/tmp/neko_epub_1/0001_page-1.jpg',
      resourceRef,
    });
  });

  it('does not treat unprojected legacy paths as runtime preview paths for linked imports', () => {
    const resourceRef = createResourceRef({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        document: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
        filePath: '${BOOKS}/comic.epub',
        metadata: {
          legacyCachePath:
            '/Users/feng/Library/Application Support/Code/User/globalStorage/neko.neko-agent/document-image-cache/neko_epub_1/page.jpg',
        },
      },
      locator: { kind: 'document', entryPath: 'image/page-1.jpg' },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'comic:image/page-1.jpg',
        providerId: 'document-archive',
      }),
    });
    const asset = normalizeImportedGeneratedAsset({
      path: '/Users/feng/Library/Application Support/Code/User/globalStorage/neko.neko-agent/document-image-cache/neko_epub_1/page.jpg',
      type: 'image',
      resourceRef,
    });

    if (!asset) throw new Error('expected normalized asset');

    expect(getImportedGeneratedAssetNodeInput(asset)).toEqual({
      assetPath: '',
      resourceRef,
    });
  });

  it('accepts linked resource imports without a private cache path', () => {
    const resourceRef = createResourceRef({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        document: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
        filePath: '${BOOKS}/comic.epub',
      },
      locator: { kind: 'document', entryPath: 'image/page-1.jpg' },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'comic:image/page-1.jpg',
        providerId: 'document-archive',
      }),
    });

    expect(
      normalizeImportedGeneratedAsset({
        type: 'image',
        name: 'page-1.jpg',
        resourceRef,
      }),
    ).toEqual({
      path: '',
      mediaType: 'image',
      name: 'page-1.jpg',
      resourceRef,
    });
  });

  it('keeps plain imports as durable asset paths when no resource ref is present', () => {
    const asset = normalizeImportedGeneratedAsset({
      path: '/repo/neko/generated/image/out.png',
      type: 'image',
    });

    if (!asset) throw new Error('expected normalized asset');

    expect(getImportedGeneratedAssetNodeInput(asset)).toEqual({
      assetPath: '/repo/neko/generated/image/out.png',
    });
  });

  it('uses originalPath as the durable path and webview URI as runtime path for plain imports', () => {
    const asset = normalizeImportedGeneratedAsset({
      path: 'https://file+.vscode-resource.vscode-cdn.net/repo/cases/test.mp3',
      originalPath: '/repo/cases/test.mp3',
      type: 'audio',
    });

    if (!asset) throw new Error('expected normalized asset');

    expect(getImportedGeneratedAssetNodeInput(asset)).toEqual({
      assetPath: '/repo/cases/test.mp3',
      runtimeAssetPath: 'https://file+.vscode-resource.vscode-cdn.net/repo/cases/test.mp3',
    });
  });

  it('preserves explicit asset names over derived file names', () => {
    expect(
      normalizeImportedGeneratedAsset({
        path: 'https://file+.vscode-resource.vscode-cdn.net/repo/.neko/generated/image/out.png',
        originalPath: '/repo/.neko/generated/image/out.png',
        type: 'image',
        name: 'Agent concept frame',
      }),
    ).toEqual({
      path: 'https://file+.vscode-resource.vscode-cdn.net/repo/.neko/generated/image/out.png',
      originalPath: '/repo/.neko/generated/image/out.png',
      mediaType: 'image',
      name: 'Agent concept frame',
    });
  });

  it('rejects missing paths', () => {
    expect(normalizeImportedGeneratedAsset({ type: 'image' })).toBeNull();
    expect(normalizeImportedGeneratedAsset(null)).toBeNull();
  });
});
