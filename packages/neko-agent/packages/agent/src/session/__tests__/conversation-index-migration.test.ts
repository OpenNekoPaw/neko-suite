import { describe, expect, it, vi } from 'vitest';
import {
  discoverLegacyConversationWorkDirs,
  migrateLegacyConversationIndex,
} from '../conversation-index-migration';

describe('conversation index migration', () => {
  it('discovers unique workDirs from legacy conversation files', async () => {
    const fsOps = createMemoryFs({
      '/tmp/conversations/a.json': JSON.stringify({
        records: [{ workDir: '/workspace/a' }, { workDir: '/workspace/b' }],
      }),
      '/tmp/conversations/b.json': JSON.stringify({
        records: [{ workDir: '/workspace/a' }],
      }),
      '/tmp/conversations/ignored.txt': 'noop',
    });

    const result = await discoverLegacyConversationWorkDirs('/tmp/conversations', fsOps);

    expect(result).toEqual({
      scannedFiles: 2,
      workDirs: ['/workspace/a', '/workspace/b'],
      failedFiles: [],
    });
  });

  it('migrates every discovered workDir through FileConversationStorage', async () => {
    const fsOps = createMemoryFs({
      '/tmp/conversations/a.json': JSON.stringify({
        records: [{ workDir: '/workspace/a' }],
      }),
      '/tmp/conversations/b.json': JSON.stringify({
        records: [{ workDir: '/workspace/b' }],
      }),
    });
    const migratedWorkDirs: string[] = [];

    const result = await migrateLegacyConversationIndex({
      legacyConversationsDir: '/tmp/conversations',
      fsOps,
      createStorage: (workDir: string) => ({
        list: vi.fn(async () => {
          migratedWorkDirs.push(workDir);
          return [];
        }),
        dispose: vi.fn(async () => undefined),
      }),
    });

    expect(migratedWorkDirs).toEqual(['/workspace/a', '/workspace/b']);
    expect(result).toEqual({
      scannedFiles: 2,
      discoveredWorkDirs: 2,
      migratedWorkDirs: 2,
      failedFiles: [],
      failedWorkDirs: [],
    });
  });

  it('reports failed legacy files and failed workDirs separately', async () => {
    const fsOps = createMemoryFs({
      '/tmp/conversations/a.json': JSON.stringify({
        records: [{ workDir: '/workspace/a' }],
      }),
      '/tmp/conversations/b.json': '{invalid-json',
    });

    const result = await migrateLegacyConversationIndex({
      legacyConversationsDir: '/tmp/conversations',
      fsOps,
      createStorage: (workDir: string) => ({
        list: vi.fn(async () => {
          if (workDir === '/workspace/a') {
            throw new Error('boom');
          }
          return [];
        }),
        dispose: vi.fn(async () => undefined),
      }),
    });

    expect(result).toEqual({
      scannedFiles: 2,
      discoveredWorkDirs: 1,
      migratedWorkDirs: 0,
      failedFiles: ['/tmp/conversations/b.json'],
      failedWorkDirs: ['/workspace/a'],
    });
  });
});

function createMemoryFs(filesByPath: Record<string, string>) {
  const files = new Map<string, string>(Object.entries(filesByPath));

  return {
    readdir: vi.fn(async (dirPath: string) => {
      const entries = new Set<string>();
      for (const filePath of files.keys()) {
        if (!filePath.startsWith(`${dirPath}/`)) continue;
        const relativePath = filePath.slice(dirPath.length + 1);
        if (relativePath.length > 0 && !relativePath.includes('/')) {
          entries.add(relativePath);
        }
      }
      return Array.from(entries);
    }),
    readFile: vi.fn(async (filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) {
        throw new Error(`File not found: ${filePath}`);
      }
      return content;
    }),
  };
}
