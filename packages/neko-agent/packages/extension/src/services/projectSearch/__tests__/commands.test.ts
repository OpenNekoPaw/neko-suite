import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { registerProjectSearchService } from '../commands';

vi.mock('vscode', async () => await import('../../../__mocks__/vscode'));
vi.mock('../compatAdapters', () => ({
  createCompatibilityProjectSearchAdapters: () => [],
}));

describe('project search commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(
      Object.assign(new Error('missing'), {
        code: 'ENOENT',
      }),
    );
    vscode.workspace.workspaceFolders = [
      { uri: { fsPath: '/workspace' }, name: 'w', index: 0 },
    ] as any;
  });

  it('debounces text document refreshes into partition-scoped changes', async () => {
    const context = { subscriptions: [] as { dispose(): void }[] } as vscode.ExtensionContext;
    const service = registerProjectSearchService(context);
    const refresh = vi.spyOn(service, 'refresh').mockResolvedValue(undefined);
    const listener = vi.mocked(vscode.workspace.onDidChangeTextDocument).mock.calls[0]?.[0];

    expect(listener).toBeDefined();
    listener?.({
      document: {
        languageId: 'nekostory',
        uri: vscode.Uri.file('/workspace/cases/test.fountain'),
      },
    } as any);
    listener?.({
      document: {
        languageId: 'nekostory',
        uri: vscode.Uri.file('/workspace/cases/test.fountain'),
      },
    } as any);

    await vi.advanceTimersByTimeAsync(399);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(
      '/workspace',
      'document-change',
      expect.objectContaining({
        partition: 'story-symbols',
        changedRefs: expect.arrayContaining([
          expect.objectContaining({ filePath: '/workspace/cases/test.fountain' }),
        ]),
      }),
    );

    service.dispose();
    vi.useRealTimers();
  });

  it('refreshes the nearest marked Neko project instead of the parent workspace', async () => {
    vscode.workspace.workspaceFolders = [
      { uri: { fsPath: '/workspace' }, name: 'w', index: 0 },
    ] as any;
    vi.mocked(vscode.workspace.fs.stat).mockImplementation(async (uri: unknown) => {
      const filePath = isUriLike(uri) ? uri.fsPath : '';
      if (filePath === '/workspace/neko-test/neko/settings.json') {
        return { type: vscode.FileType.File } as never;
      }
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    });
    const context = { subscriptions: [] as { dispose(): void }[] } as vscode.ExtensionContext;
    const service = registerProjectSearchService(context);
    const refresh = vi.spyOn(service, 'refresh').mockResolvedValue(undefined);
    const entityWatcher = watcherForPattern('**/neko/entities/*.json');
    const onDidChange = vi.mocked(entityWatcher?.onDidChange).mock.calls[0]?.[0];

    expect(onDidChange).toBeDefined();
    onDidChange?.(vscode.Uri.file('/workspace/neko-test/neko/entities/scenes.json'));

    await vi.advanceTimersByTimeAsync(300);

    expect(refresh).toHaveBeenCalledWith(
      '/workspace/neko-test',
      'file-change',
      expect.objectContaining({
        partition: 'creative-entities',
        changedRefs: expect.arrayContaining([
          expect.objectContaining({ filePath: '/workspace/neko-test/neko/entities/scenes.json' }),
        ]),
      }),
    );

    service.dispose();
    vi.useRealTimers();
  });
});

function watcherForPattern(pattern: string): {
  readonly onDidChange: ReturnType<typeof vi.fn>;
} {
  const watcherIndex = vi
    .mocked(vscode.workspace.createFileSystemWatcher)
    .mock.calls.findIndex((call) => call[0] === pattern);
  return vi.mocked(vscode.workspace.createFileSystemWatcher).mock.results[watcherIndex]?.value as {
    readonly onDidChange: ReturnType<typeof vi.fn>;
  };
}

function isUriLike(value: unknown): value is { readonly fsPath?: string } {
  return typeof value === 'object' && value !== null && 'fsPath' in value;
}
