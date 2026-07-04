import { describe, expect, it, vi } from 'vitest';
import {
  ScriptEmbeddingIndex,
  buildScriptSceneTextInputs,
  keywordSearchScriptScenes,
  normalizeScriptSceneTopK,
  searchScriptScenes,
  tokenizeScriptSceneQuery,
  type SceneTextInput,
} from '../script-scene-search-runtime';

const scenes: SceneTextInput[] = [
  {
    id: 'S1',
    heading: 'INT. OFFICE - DAY',
    line_start: 0,
    line_end: 2,
    text: 'INT. OFFICE - DAY\nAlice confronts Bob about the missing key.',
  },
  {
    id: 'S2',
    heading: 'EXT. FOREST - NIGHT',
    line_start: 3,
    line_end: 5,
    text: 'EXT. FOREST - NIGHT\nA quiet chase through the rain.',
  },
];

describe('script scene search runtime', () => {
  it('builds scene text inputs from line spans', () => {
    const result = buildScriptSceneTextInputs(
      [
        { id: 'S1', heading: 'A', line_start: 1, line_end: 2 },
        { id: 'S2', heading: 'B', line_start: 3, line_end: 3 },
      ],
      ['ignore', 'line 1', 'line 2', 'line 3'],
    );

    expect(result).toEqual([
      { id: 'S1', heading: 'A', line_start: 1, line_end: 2, text: 'line 1\nline 2' },
      { id: 'S2', heading: 'B', line_start: 3, line_end: 3, text: 'line 3' },
    ]);
  });

  it('normalizes topK using the tool contract defaults', () => {
    expect(normalizeScriptSceneTopK(undefined)).toBe(5);
    expect(normalizeScriptSceneTopK(50)).toBe(20);
    expect(normalizeScriptSceneTopK(3)).toBe(3);
  });

  it('tokenizes keyword queries', () => {
    expect(tokenizeScriptSceneQuery('tense confrontation, loss')).toEqual([
      'tense',
      'confrontation',
      'loss',
    ]);
  });

  it('runs keyword fallback with heading bonus and score sorting', () => {
    const result = keywordSearchScriptScenes(scenes, ['office', 'missing'], 5);

    expect(result[0]).toMatchObject({
      scene_id: 'S1',
      heading: 'INT. OFFICE - DAY',
      score: 2.5,
    });
  });

  it('returns empty result when query has no searchable tokens', async () => {
    await expect(
      searchScriptScenes({
        uri: 'file:///script.fountain',
        totalLines: 10,
        sceneTexts: scenes,
        query: '!',
      }),
    ).resolves.toEqual({
      results: [],
      message: 'Query produced no searchable tokens.',
    });
  });

  it('uses vector search when embeddings are available', async () => {
    const embedFn = vi.fn(async (texts: string[]) =>
      texts.map((text) => (text.includes('confront') ? [1, 0] : [0, 1])),
    );
    const index = new ScriptEmbeddingIndex();

    const result = await searchScriptScenes(
      {
        uri: 'file:///script.fountain',
        totalLines: 10,
        sceneTexts: scenes,
        query: 'confrontation',
        topK: 1,
        embedFn,
      },
      index,
    );

    expect(result).toEqual({
      results: [
        {
          scene_id: 'S1',
          heading: 'INT. OFFICE - DAY',
          score: 1,
          line_start: 0,
          line_end: 2,
        },
      ],
      mode: 'vector',
    });
    expect(embedFn).toHaveBeenCalledTimes(2);
  });

  it('reuses cached scene embeddings while re-embedding the query', async () => {
    const embedFn = vi.fn(async (texts: string[]) =>
      texts.map((text) => (text.includes('FOREST') ? [0, 1] : [1, 0])),
    );
    const index = new ScriptEmbeddingIndex();

    await searchScriptScenes(
      {
        uri: 'file:///script.fountain',
        totalLines: 10,
        sceneTexts: scenes,
        query: 'forest',
        embedFn,
      },
      index,
    );
    await searchScriptScenes(
      {
        uri: 'file:///script.fountain',
        totalLines: 10,
        sceneTexts: scenes,
        query: 'office',
        embedFn,
      },
      index,
    );

    expect(embedFn).toHaveBeenCalledTimes(3);
  });
});
