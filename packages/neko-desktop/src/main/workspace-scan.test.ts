import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspaceFileTreeSnapshot } from './workspace-scan';

let tempRoot: string | undefined;

describe('workspace file tree scan', () => {
  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('keeps generated media visible while hiding internal .neko cache resources', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-desktop-workspace-'));
    await mkdir(join(tempRoot, '.neko/.cache/resources'), { recursive: true });
    await mkdir(join(tempRoot, 'neko/generated/image'), { recursive: true });
    await writeFile(join(tempRoot, '.neko/.cache/resources/cache.png'), 'cache');
    await writeFile(join(tempRoot, 'neko/generated/image/render.png'), 'image');
    await writeFile(join(tempRoot, 'Untitled-1.nkc'), '{}');
    await writeFile(join(tempRoot, 'notes.md'), '# Notes');

    const snapshot = await createWorkspaceFileTreeSnapshot(tempRoot, {
      scmStatusByPath: new Map([
        ['characters/yuexin/yuexin.model3.json', 'untracked'],
        ['cuts/shot.nkv', 'modified'],
      ]),
    });
    const nodes = flatten(snapshot.nodes);
    const paths = nodes.map((node) => node.relativePath);

    expect(paths).not.toContain('.neko/.cache');
    expect(paths).not.toContain('.neko/.cache/resources/cache.png');
    expect(paths).toContain('neko/generated/image/render.png');
    const generatedImage = nodes.find(
      (node) => node.relativePath === 'neko/generated/image/render.png',
    );
    expect(generatedImage?.thumbnail?.kind).toBe('image');
    expect(generatedImage?.thumbnail?.url).toContain('neko-resource://workspace/');
    expect(nodes.find((node) => node.relativePath === 'Untitled-1.nkc')?.editor).toMatchObject({
      panelKind: 'canvas-workbench',
      packageName: '@neko-canvas/webview',
      desktopRuntime: 'host-adapter-projection',
    });
    expect(nodes.find((node) => node.relativePath === 'notes.md')?.editor).toMatchObject({
      panelKind: 'code-editor',
      packageName: 'neko-desktop',
      implementedInVsCodeWebview: false,
      desktopRuntime: 'desktop-native',
    });
  });

  it('preserves tree metadata for directories, media, and Live2D puppet sources', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-desktop-workspace-'));
    await mkdir(join(tempRoot, 'characters/yuexin/textures'), { recursive: true });
    await mkdir(join(tempRoot, 'cuts'), { recursive: true });
    await writeFile(join(tempRoot, 'characters/yuexin/yuexin.model3.json'), '{}');
    await writeFile(join(tempRoot, 'characters/yuexin/yuexin.moc3'), 'moc');
    await writeFile(join(tempRoot, 'characters/yuexin/idle.motion3.json'), '{}');
    await writeFile(join(tempRoot, 'characters/yuexin/textures/texture_00.png'), 'image');
    await writeFile(join(tempRoot, 'cuts/shot.nkv'), '{}');

    const snapshot = await createWorkspaceFileTreeSnapshot(tempRoot, {
      scmStatusByPath: new Map([
        ['characters/yuexin/yuexin.model3.json', 'untracked'],
        ['cuts/shot.nkv', 'modified'],
      ]),
    });
    const nodes = flatten(snapshot.nodes);
    const characterDirectory = nodes.find((node) => node.relativePath === 'characters/yuexin');
    const puppetFiles = nodes.filter((node) => node.kind === 'puppet');

    expect(snapshot.truncated).toBe(false);
    expect(snapshot.mediaFileCount).toBe(4);
    expect(characterDirectory?.modifiedAt).toBeDefined();
    expect(characterDirectory?.childCount).toBe(4);
    expect(puppetFiles.map((node) => node.relativePath).sort()).toEqual([
      'characters/yuexin/idle.motion3.json',
      'characters/yuexin/yuexin.moc3',
      'characters/yuexin/yuexin.model3.json',
    ]);
    expect(puppetFiles.every((node) => node.thumbnail?.label === 'PUP')).toBe(true);
    expect(
      nodes.find((node) => node.relativePath === 'characters/yuexin/yuexin.model3.json')
        ?.scmStatus,
    ).toBe('untracked');
    expect(nodes.find((node) => node.relativePath === 'cuts/shot.nkv')?.scmStatus).toBe(
      'modified',
    );
    expect(nodes.find((node) => node.relativePath === 'cuts/shot.nkv')?.editor).toMatchObject({
      panelKind: 'cut-timeline',
      packageName: '@neko/webview',
      desktopRuntime: 'full-webview-runtime',
    });
  });
});

function flatten<T extends { readonly children?: readonly T[] }>(nodes: readonly T[]): readonly T[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flatten(node.children) : [])]);
}
