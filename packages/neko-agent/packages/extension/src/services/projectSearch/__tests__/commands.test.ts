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
});
