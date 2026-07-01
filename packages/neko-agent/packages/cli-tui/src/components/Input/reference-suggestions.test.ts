import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTuiReferenceSuggestions } from './reference-suggestions';

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-tui-refs-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('createTuiReferenceSuggestions', () => {
  it('returns terminal-safe workspace-relative file references', async () => {
    await fs.mkdir(path.join(tempRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'src', 'story.md'), '# Story\n');
    await fs.writeFile(path.join(tempRoot, 'src', 'shot list.md'), 'shot 1\n');

    const suggestions = await createTuiReferenceSuggestions({ workspaceRoot: tempRoot });

    expect(suggestions.map((suggestion) => suggestion.name)).toEqual([
      'src/shot list.md',
      'src/story.md',
    ]);
    expect(suggestions[0]).toMatchObject({
      trigger: '@',
      kind: 'file',
      insertText: '@"src/shot list.md" ',
    });
    expect(suggestions[1]?.insertText).toBe('@src/story.md ');
  });

  it('skips mention-excluded workspace directories', async () => {
    await fs.mkdir(path.join(tempRoot, 'node_modules/pkg'), { recursive: true });
    await fs.mkdir(path.join(tempRoot, '.neko'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'node_modules/pkg/index.ts'), 'hidden\n');
    await fs.writeFile(path.join(tempRoot, '.neko', 'memory.md'), 'hidden\n');
    await fs.writeFile(path.join(tempRoot, 'visible.md'), 'ok\n');

    const suggestions = await createTuiReferenceSuggestions({ workspaceRoot: tempRoot });

    expect(suggestions.map((suggestion) => suggestion.name)).toEqual(['visible.md']);
  });

  it('respects scan limit and depth', async () => {
    await fs.mkdir(path.join(tempRoot, 'a/b/c'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'a', 'one.md'), '1\n');
    await fs.writeFile(path.join(tempRoot, 'a', 'two.md'), '2\n');
    await fs.writeFile(path.join(tempRoot, 'a/b/c', 'deep.md'), 'deep\n');

    const suggestions = await createTuiReferenceSuggestions({
      workspaceRoot: tempRoot,
      limit: 1,
      maxDepth: 1,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.name).toBe('a/one.md');
  });

  it('projects local asset and media library files before ordinary workspace files', async () => {
    await fs.mkdir(path.join(tempRoot, 'assets', 'shots'), { recursive: true });
    await fs.mkdir(path.join(tempRoot, 'media'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'assets', 'shots', 'hero image.png'), 'image\n');
    await fs.writeFile(path.join(tempRoot, 'media', 'voice.wav'), 'audio\n');
    await fs.writeFile(path.join(tempRoot, 'notes.md'), 'notes\n');

    const suggestions = await createTuiReferenceSuggestions({ workspaceRoot: tempRoot });

    expect(suggestions.slice(0, 2)).toMatchObject([
      {
        name: 'assets/shots/hero image.png',
        kind: 'asset',
        description: expect.stringContaining('asset-library · image'),
        insertText: '@"assets/shots/hero image.png" ',
      },
      {
        name: 'media/voice.wav',
        kind: 'media',
        description: expect.stringContaining('media-library · audio'),
        insertText: '@media/voice.wav ',
      },
    ]);
    expect(suggestions.map((suggestion) => suggestion.name)).toContain('notes.md');
  });

  it('accepts host-provided mention candidates without inserting unsafe durable paths', async () => {
    await fs.writeFile(path.join(tempRoot, 'brief.md'), 'brief\n');

    const suggestions = await createTuiReferenceSuggestions({
      workspaceRoot: tempRoot,
      extraReferences: [
        {
          kind: 'asset',
          id: 'asset-hero',
          label: 'Hero Key Art',
          description: 'Approved cover frame',
          filePath: '${ASSETS}/hero.png',
          source: 'asset-library',
          mediaType: 'image',
          searchText: 'cover poster',
        },
        {
          kind: 'media',
          id: 'unsafe-video',
          label: 'Unsafe Preview',
          filePath: '/tmp/neko-cache/preview.mp4',
          source: 'media-library',
          mediaType: 'video',
        },
      ],
    });

    const hero = suggestions.find((suggestion) => suggestion.name === 'Hero Key Art');
    const unsafe = suggestions.find((suggestion) => suggestion.name === 'Unsafe Preview');

    expect(hero).toMatchObject({
      kind: 'asset',
      description: expect.stringContaining('asset-library · image'),
      matchText: expect.stringContaining('cover poster'),
      insertText: '@${ASSETS}/hero.png ',
    });
    expect(unsafe?.insertText).toBe('@media:unsafe-video ');
    expect(unsafe?.insertText).not.toContain('/tmp/');
  });

  it('merges terminal-safe contributor references before ordinary workspace files', async () => {
    await fs.writeFile(path.join(tempRoot, 'brief.md'), 'brief\n');

    const suggestions = await createTuiReferenceSuggestions({
      workspaceRoot: tempRoot,
      referenceContributors: [
        {
          id: 'neko-assets',
          displayName: 'Assets',
          search: async () => ({
            diagnostics: [],
            candidates: [
              {
                id: 'asset:hero',
                label: 'Hero Concept',
                source: 'assets',
                kind: 'asset',
                insertText: '@asset:hero',
                description: 'Main character key art',
                path: '/tmp/rendered-preview.png',
              },
            ],
          }),
        },
      ],
    });

    expect(suggestions[0]).toMatchObject({
      name: 'Hero Concept',
      kind: 'asset',
      description: 'assets · asset · Main character key art',
      insertText: '@asset:hero ',
    });
    expect(suggestions[0]?.description).not.toContain('/tmp/');
    expect(suggestions.map((suggestion) => suggestion.name)).toContain('brief.md');
  });
});
