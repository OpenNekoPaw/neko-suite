import { describe, expect, it } from 'vitest';
import {
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
