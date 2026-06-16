import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { matchesGitignoreRules, parseGitignoreRules } from '../workspaceIgnoreFilter';
import { searchVSCodeProjectFiles } from '../workspaceProjectSearch';
import { createVSCodeWorkspaceFileReader } from '../workspaceFileReader';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

describe('workspace mention filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.workspaceFolders = [
      { uri: vscode.Uri.file('/workspace'), name: 'workspace', index: 0 },
    ];
    vi.mocked(vscode.workspace.asRelativePath).mockImplementation(
      (uri: { fsPath: string } | string) =>
        typeof uri === 'string' ? uri : uri.fsPath.replace('/workspace/', ''),
    );
  });

  it('parses common gitignore rules and ignores matching paths', () => {
    const rules = parseGitignoreRules(`
# generated files
.cache/
tmp/*.json
/local-only/
!keep.md
`);

    expect(rules).toEqual(['.cache/', 'tmp/*.json', '/local-only/']);
    expect(matchesGitignoreRules('.cache/a.json', rules)).toBe(true);
    expect(matchesGitignoreRules('src/.cache/a.json', rules)).toBe(true);
    expect(matchesGitignoreRules('tmp/data.json', rules)).toBe(true);
    expect(matchesGitignoreRules('local-only/state.json', rules)).toBe(true);
    expect(matchesGitignoreRules('src/local-only/state.json', rules)).toBe(false);
    expect(matchesGitignoreRules('src/keep.md', rules)).toBe(false);
  });

  it('filters mention search results through built-in and gitignore rules', async () => {
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
      vscode.Uri.file('/workspace/src/app.ts'),
      vscode.Uri.file('/workspace/.neko/logs/events.jsonl'),
      vscode.Uri.file('/workspace/tmp/generated.json'),
    ]);
    vi.mocked(vscode.workspace.fs.readFile).mockImplementation(async (uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith('/.gitignore')) {
        return Buffer.from('tmp/\n');
      }
      return Buffer.from('');
    });

    await expect(
      searchVSCodeProjectFiles({
        includePattern: '**/*',
        excludePattern: '**/.git/**',
        limit: 30,
      }),
    ).resolves.toEqual([
      {
        relativePath: 'src/app.ts',
        source: 'workspace',
        icon: 'TS',
      },
    ]);
  });

  it('returns stable ranked mention results before applying the display limit', async () => {
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
      vscode.Uri.file('/workspace/src/deep/painted-app.png'),
      vscode.Uri.file('/workspace/docs/app.md'),
      vscode.Uri.file('/workspace/src/app.ts'),
      vscode.Uri.file('/workspace/app.json'),
      vscode.Uri.file('/workspace/src/App 10.png'),
      vscode.Uri.file('/workspace/src/App 2.png'),
    ]);
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(Buffer.from(''));

    await expect(
      searchVSCodeProjectFiles({
        includePattern: '**/*app*',
        excludePattern: '**/.git/**',
        limit: 4,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ relativePath: 'app.json' }),
      expect.objectContaining({ relativePath: 'docs/app.md' }),
      expect.objectContaining({ relativePath: 'src/App 2.png' }),
      expect.objectContaining({ relativePath: 'src/App 10.png' }),
    ]);

    expect(vscode.workspace.findFiles).toHaveBeenCalledWith('**/*app*', '**/.git/**', 16);
  });

  it('prevents direct @file reads from ignored paths', async () => {
    vi.mocked(vscode.workspace.fs.readFile).mockImplementation(async (uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith('/.gitignore')) {
        return Buffer.from('tmp/\n');
      }
      if (uri.fsPath.endsWith('/src/app.ts')) {
        return Buffer.from('source');
      }
      return Buffer.from('generated');
    });
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({ type: vscode.FileType.File, size: 6 });
    const reader = createVSCodeWorkspaceFileReader('/workspace');

    await expect(reader.readFile('src/app.ts')).resolves.toBe('source');
    await expect(reader.exists('tmp/generated.json')).resolves.toBe(false);
    await expect(reader.readFile('tmp/generated.json')).rejects.toThrow(
      'File is ignored by workspace mention filters',
    );
  });
});
