import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { MediaLibrarySearchService } from './MediaLibrarySearchService';
import type { MediaLibrarySettingsService } from './MediaLibrarySettingsService';
import type { MediaMetadataCache } from './MediaMetadataCache';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('vscode', () => ({
  RelativePattern: vi.fn(function RelativePattern(base: string, pattern: string) {
    return { base, pattern };
  }),
  workspace: {
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    })),
  },
}));

vi.mock('../utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('MediaLibrarySearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warms persisted filename index and installs watchers without metadata probing', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        version: 1,
        updatedAt: '2026-05-18T00:00:00.000Z',
        entries: [
          {
            filePath: '/library/cat.mp4',
            fileName: 'cat.mp4',
            libraryName: 'Library',
            mediaType: 'video',
          },
        ],
      }),
    );
    const settings = {
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      getResolvedLibraries: vi.fn(async () => [
        {
          name: 'Library',
          resolvedPath: '/library',
          enabled: true,
          accessible: true,
        },
      ]),
    } as unknown as MediaLibrarySettingsService;
    const metadataCache = {
      get: vi.fn(),
    } as unknown as MediaMetadataCache;
    const service = new MediaLibrarySearchService(
      settings,
      metadataCache,
      '/workspace/.neko/.cache/search-index.json',
    );

    await service.warmup();

    expect(service.indexSize).toBe(1);
    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
    expect(metadataCache.get).not.toHaveBeenCalled();
  });
});
