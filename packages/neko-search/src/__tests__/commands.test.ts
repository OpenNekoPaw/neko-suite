import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { registerProjectSearchService } from '../host-vscode/commands';

vi.mock('vscode', async () => await import('../testing/vscode'));
vi.mock('../host-vscode/compatAdapters', () => ({
  createCompatibilityProjectSearchAdapters: () => [],
}));

describe('project search commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setWorkspaceFolders([{ uri: { fsPath: '/workspace' }, name: 'w', index: 0 }]);
  });

  it('debounces text document refreshes into partition-scoped changes', async () => {
    const context = { subscriptions: [] as { dispose(): void }[] } as vscode.ExtensionContext;
    const service = registerProjectSearchService(context, {
      resolvePath: async (filePath) => filePath,
    });
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

  it('watches unified entity fact files as creative entity changes', async () => {
    const context = { subscriptions: [] as { dispose(): void }[] } as vscode.ExtensionContext;
    const service = registerProjectSearchService(context, {
      resolvePath: async (filePath) => filePath,
    });
    const refresh = vi.spyOn(service, 'refresh').mockResolvedValue(undefined);
    const entityWatcher = watcherForPattern('**/neko/entities/*.json');
    const onDidChange = vi.mocked(entityWatcher?.onDidChange).mock.calls[0]?.[0];

    expect(onDidChange).toBeDefined();
    onDidChange?.(vscode.Uri.file('/workspace/neko/entities/scenes.json'));

    await vi.advanceTimersByTimeAsync(299);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(refresh).toHaveBeenCalledWith(
      '/workspace',
      'file-change',
      expect.objectContaining({
        partition: 'creative-entities',
        changedRefs: expect.arrayContaining([
          expect.objectContaining({ filePath: '/workspace/neko/entities/scenes.json' }),
        ]),
      }),
    );

    service.dispose();
  });
});

function setWorkspaceFolders(
  folders: readonly {
    readonly uri: { readonly fsPath: string };
    readonly name: string;
    readonly index: number;
  }[],
): void {
  (
    vscode.workspace as unknown as {
      workspaceFolders: typeof folders;
    }
  ).workspaceFolders = folders;
}

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
