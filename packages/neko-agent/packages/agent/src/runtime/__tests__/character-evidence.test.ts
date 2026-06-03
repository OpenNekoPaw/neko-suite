import { describe, expect, it } from 'vitest';
import type { CreativeEntityRef } from '@neko/shared';
import {
  dedupeCharacterEvidenceChunks,
  normalizeCharacterEvidenceTokens,
  projectCharacterEvidenceBundleToProfileFacts,
  rankCharacterEvidenceChunks,
  renderCharacterEvidenceBundle,
  scoreCharacterEvidenceChunk,
  trimCharacterEvidenceChunks,
  type CharacterEvidenceChunk,
} from '../character-evidence';

const entityRef: CreativeEntityRef = {
  entityId: 'char-lin',
  entityKind: 'character',
  projectRoot: '/project',
  source: 'neko-entity',
};

describe('character evidence runtime helpers', () => {
  it('normalizes query tokens without host dependencies', () => {
    expect(normalizeCharacterEvidenceTokens('  Lin, LIN! Scene-42_Alpha  ')).toEqual([
      'lin',
      'scene',
      '42_alpha',
    ]);
    expect(normalizeCharacterEvidenceTokens(['小橘', ' 晚场景 '])).toEqual(['小橘', '晚场景']);
  });

  it('scores and orders chunks deterministically by lexical signals and source position', () => {
    const chunks = [
      makeChunk('late', 'Lin finds the hidden key in the final scene.', 220, {
        score: 0,
        signals: [],
      }),
      makeChunk('early', 'Lin waits near the gate.', 12, { score: 0, signals: [] }),
      makeChunk('middle', 'The team discusses the hidden archive.', 80, {
        score: 0,
        signals: [],
      }),
    ].map((chunk) => ({
      ...chunk,
      relevance: scoreCharacterEvidenceChunk({
        chunk,
        queryTokens: normalizeCharacterEvidenceTokens('hidden key'),
        entityTokens: normalizeCharacterEvidenceTokens('Lin'),
      }),
    }));

    expect(rankCharacterEvidenceChunks(chunks).map((chunk) => chunk.id)).toEqual([
      'late',
      'middle',
      'early',
    ]);
    expect(chunks.find((chunk) => chunk.id === 'late')?.relevance.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'query-token-match' }),
        expect.objectContaining({ name: 'entity-token-match' }),
        expect.objectContaining({ name: 'authority' }),
      ]),
    );
  });

  it('dedupes duplicate source range and text while merging source refs', () => {
    const left = makeChunk('left', 'Lin says the same thing.', 10);
    const right: CharacterEvidenceChunk = {
      ...makeChunk('right', 'Lin says the same thing.', 10),
      sourceRefs: [
        {
          ...makeChunk('right', 'Lin says the same thing.', 10).sourceRefs[0]!,
          id: 'dashboard:cases/test.fountain:10',
          kind: 'dashboard-detail',
        },
      ],
      relevance: { score: 9, signals: [{ name: 'query-token-match', weight: 9 }] },
    };

    const deduped = dedupeCharacterEvidenceChunks([left, right]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe('right');
    expect(deduped[0]?.sourceRefs.map((sourceRef) => sourceRef.kind)).toEqual([
      'entity-occurrence',
      'dashboard-detail',
    ]);
    expect(deduped[0]?.relevance.score).toBe(9);
  });

  it('trims chunks to stable budget and records omissions', () => {
    const chunks = [
      makeChunk('first', 'a'.repeat(40), 1, { score: 20, signals: [] }),
      makeChunk('second', 'b'.repeat(40), 2, { score: 10, signals: [] }),
      makeChunk('third', 'c'.repeat(40), 3, { score: 5, signals: [] }),
    ];

    const result = trimCharacterEvidenceChunks({
      chunks,
      budget: {
        maxChunks: 2,
        maxCharacters: 70,
        perChunkMaxCharacters: 35,
        minScore: 0,
      },
    });

    expect(result.chunks.map((chunk) => chunk.id)).toEqual(['first', 'second']);
    expect(result.chunks[0]?.text).toContain('[truncated]');
    expect(result.omitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'budget', chunkId: 'first' }),
        expect.objectContaining({ reason: 'budget', chunkId: 'second' }),
        expect.objectContaining({ reason: 'budget', chunkId: 'third' }),
      ]),
    );
  });

  it('renders bundles and profile facts without mutating transcript state', () => {
    const chunk = makeChunk('evidence-1', 'Lin only knows the public clue.', 30, {
      score: 12,
      signals: [],
    });
    const bundle = {
      entityRef,
      mode: 'character-dialogue' as const,
      query: 'what does Lin know?',
      chunks: [chunk],
      omitted: [],
      freshness: 'fresh' as const,
      budget: {
        maxChunks: 4,
        maxCharacters: 4000,
        perChunkMaxCharacters: 1000,
      },
    };

    expect(renderCharacterEvidenceBundle(bundle)).toContain('Turn-scoped project evidence');
    expect(renderCharacterEvidenceBundle(bundle)).toContain('Lin only knows the public clue.');
    expect(projectCharacterEvidenceBundleToProfileFacts(bundle)).toEqual([
      expect.objectContaining({
        key: 'script.context.1',
        value: 'Lin only knows the public clue.',
        source: 'script-extraction',
        authority: 'confirmed',
      }),
    ]);
  });
});

function makeChunk(
  id: string,
  text: string,
  line: number,
  relevance = { score: 1, signals: [] },
): CharacterEvidenceChunk {
  return {
    id,
    text,
    sourceRefs: [
      {
        id: `entity:cases/test.fountain:${line}`,
        kind: 'entity-occurrence',
        providerId: 'neko-story',
        projectRelativePath: 'cases/test.fountain',
        location: `cases/test.fountain:${line}`,
        lineStart: line,
        lineEnd: line + 2,
        freshness: 'fresh',
      },
    ],
    authority: 'confirmed',
    relevance,
    freshness: 'fresh',
  };
}
