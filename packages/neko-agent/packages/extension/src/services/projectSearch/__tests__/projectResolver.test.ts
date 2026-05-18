import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { resolveProjectSearchContext } from '../projectResolver';

vi.mock('vscode', async () => await import('../../../__mocks__/vscode'));
vi.mock('../../documentPathResolver', () => ({
  resolveDocumentPath: vi.fn(async (filePath: string) =>
    filePath
      .replace('${PROJECT}', '/workspace-a')
      .replace('~/git/neko-test', '/Users/feng/git/neko-test'),
  ),
}));

describe('resolveProjectSearchContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.workspaceFolders = [
      { uri: { fsPath: '/workspace-a' }, name: 'a', index: 0 },
      { uri: { fsPath: '/workspace-b' }, name: 'b', index: 1 },
    ] as any;
  });

  it('prefers explicit project root', async () => {
    const context = await resolveProjectSearchContext({
      text: '',
      projectRoot: '/workspace-b',
      contextFilePath: '/workspace-a/cases/test.fountain',
    });

    expect(context.projectRoot).toBe('/workspace-b');
    expect(context.fallbackDerived).toBe(false);
  });

  it('resolves variable paths before selecting workspace ownership', async () => {
    const context = await resolveProjectSearchContext({
      text: '小橘',
      contextFilePath: '${PROJECT}/cases/test.fountain',
    });

    expect(context.projectRoot).toBe('/workspace-a');
    expect(context.resolvedContextFilePath).toBe('/workspace-a/cases/test.fountain');
  });

  it('falls back to first workspace when no context is available', async () => {
    const context = await resolveProjectSearchContext({ text: 'x' });

    expect(context.projectRoot).toBe('/workspace-a');
    expect(context.fallbackDerived).toBe(true);
  });
});
