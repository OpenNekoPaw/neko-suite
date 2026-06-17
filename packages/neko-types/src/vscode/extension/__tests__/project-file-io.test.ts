import { describe, expect, it, vi } from 'vitest';
import { createVSCodeProjectFileIoAdapter } from '../project-file-io';

describe('createVSCodeProjectFileIoAdapter', () => {
  it('wraps workspace.fs and creates path context', async () => {
    const storage = new Map<string, Uint8Array>();
    const vscodeApi = {
      Uri: {
        file: (fsPath: string) => ({ fsPath, scheme: 'file', toString: () => `file://${fsPath}` }),
      },
      workspace: {
        workspaceFolders: [
          {
            uri: { fsPath: '/workspace/project', scheme: 'file' },
            name: 'project',
            index: 0,
          },
        ],
        fs: {
          readFile: vi.fn(
            async (uri: { fsPath: string }) => storage.get(uri.fsPath) ?? new Uint8Array(),
          ),
          writeFile: vi.fn(async (uri: { fsPath: string }, content: Uint8Array) => {
            storage.set(uri.fsPath, content);
          }),
          delete: vi.fn(async (uri: { fsPath: string }) => {
            storage.delete(uri.fsPath);
          }),
          rename: vi.fn(async (from: { fsPath: string }, to: { fsPath: string }) => {
            const content = storage.get(from.fsPath);
            if (content) storage.set(to.fsPath, content);
            storage.delete(from.fsPath);
          }),
        },
      },
    };

    const adapter = createVSCodeProjectFileIoAdapter({
      vscodeApi: vscodeApi as never,
      pathVariables: new Map([['MEDIA', '/Volumes/media']]),
    });
    await adapter.fileOps.writeFile('/workspace/project/edit.nkv', new TextEncoder().encode('ok'));
    const read = await adapter.fileOps.readFile('/workspace/project/edit.nkv');
    const context = adapter.createWorkspaceMediaPathContext({
      documentUri: {
        fsPath: '/workspace/project/edit.nkv',
        scheme: 'file',
        toString: () => 'file:///workspace/project/edit.nkv',
      } as never,
    });

    expect(new TextDecoder().decode(read)).toBe('ok');
    expect(context.owningWorkspaceRoot).toBe('/workspace/project');
    expect(context.pathVariables?.get('MEDIA')).toBe('/Volumes/media');
    expect(context.pathVariables?.get('WORKSPACE')).toBe('/workspace/project');
  });
});
