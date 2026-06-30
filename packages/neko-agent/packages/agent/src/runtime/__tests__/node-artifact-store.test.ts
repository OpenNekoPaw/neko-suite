import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNodeArtifactStore, createNodeRuntimeWorkspaceFsOps } from '../index';

describe('createNodeRuntimeWorkspaceFsOps', () => {
  it('provides the fs operations required by workspace-backed runtimes', () => {
    const fsOps = createNodeRuntimeWorkspaceFsOps();

    expect(fsOps).toEqual(
      expect.objectContaining({
        appendFile: expect.any(Function),
        mkdir: expect.any(Function),
        readFile: expect.any(Function),
        writeFile: expect.any(Function),
      }),
    );
  });
});

describe('createNodeArtifactStore', () => {
  it('creates a workspace-backed artifact store with default preferences path', () => {
    const store = createNodeArtifactStore({ workspaceRoot: '/workspace/demo' });

    expect(store.workspace).toEqual(
      expect.objectContaining({
        root: '/workspace/demo',
        globalPreferencesPath: nodePath.join(nodeOs.homedir(), '.neko', 'preferences.md'),
        fsOps: expect.objectContaining({
          appendFile: expect.any(Function),
          mkdir: expect.any(Function),
          readFile: expect.any(Function),
          writeFile: expect.any(Function),
        }),
      }),
    );
    expect(store.artifactService).toBeDefined();
    expect(store.createArtifactWatcher).toBeUndefined();
  });

  it('always exposes a journal writer factory for conversation-scoped persistence', () => {
    const store = createNodeArtifactStore();
    const writer = store.createJournalWriter?.('conv-1');

    expect(writer).toEqual(
      expect.objectContaining({
        appendEvent: expect.any(Function),
        appendSnapshot: expect.any(Function),
        flush: expect.any(Function),
        dispose: expect.any(Function),
      }),
    );
    expect(store.createArtifactWatcher).toBeUndefined();
  });
});
