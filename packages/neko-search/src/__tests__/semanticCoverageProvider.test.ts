import { describe, expect, it } from 'vitest';
import type { ProjectSemanticCoverageQuery } from '@neko/shared';
import { createVSCodeSemanticCoverageProvider } from '../host-vscode/semanticCoverageProvider';

describe('VSCode semantic coverage provider', () => {
  it('reports fresh reusable ranges from media semantic sidecars without leaking sidecar paths', async () => {
    const indexPath = '/workspace/.neko/semantic-index/asset-page-1/index.json';
    const provider = createVSCodeSemanticCoverageProvider({
      findSemanticIndexFiles: async () => [indexPath],
      readTextFile: async (filePath) =>
        filePath === indexPath ? semanticIndexContent() : undefined,
      resolveCharacterMemoryPath: (projectRoot) => `${projectRoot}/neko/character-memory.json`,
    });

    const result = await provider.querySemanticCoverage(makeQuery(), {
      projectRoot: '/workspace',
    });

    expect(result).toEqual(
      expect.objectContaining({
        coverage: 'partial',
        freshness: 'partial',
        matchedRanges: [
          expect.objectContaining({
            coverage: 'fresh',
            freshness: 'fresh',
            range: { startLine: 1, endLine: 10 },
            segmentIds: ['segment-1'],
            evidenceIds: ['segment-1'],
          }),
          expect.objectContaining({
            coverage: 'missing',
            freshness: 'stale',
            range: { startLine: 11, endLine: 20 },
            staleReasons: ['range-partial'],
          }),
        ],
      }),
    );
    expect(JSON.stringify(result)).not.toContain('.neko/semantic-index');
    expect(JSON.stringify(result)).not.toContain(indexPath);
  });

  it('marks matched evidence stale when the query asks for another schema version', async () => {
    const provider = createVSCodeSemanticCoverageProvider({
      findSemanticIndexFiles: async () => [
        '/workspace/.neko/semantic-index/asset-page-1/index.json',
      ],
      readTextFile: async () => semanticIndexContent(),
      resolveCharacterMemoryPath: (projectRoot) => `${projectRoot}/neko/character-memory.json`,
    });

    const result = await provider.querySemanticCoverage(
      {
        ...makeQuery(),
        range: { startLine: 1, endLine: 10 },
        schemaVersion: '2',
      },
      { projectRoot: '/workspace' },
    );

    expect(result.coverage).toBe('stale');
    expect(result.freshness).toBe('stale');
    expect(result.staleReasons).toEqual(['schema-version']);
    expect(result.matchedRanges?.[0]).toEqual(
      expect.objectContaining({
        staleReasons: ['schema-version'],
      }),
    );
  });

  it('reports character observation coverage from the project character memory ledger', async () => {
    const memoryPath = '/workspace/neko/character-memory.json';
    const provider = createVSCodeSemanticCoverageProvider({
      findSemanticIndexFiles: async () => [],
      readTextFile: async (filePath) =>
        filePath === memoryPath ? characterMemoryContent() : undefined,
      resolveCharacterMemoryPath: () => memoryPath,
    });

    const result = await provider.querySemanticCoverage(
      {
        sourceRef: {
          kind: 'document',
          source: { kind: 'file', projectRelativePath: 'docs/comic.pdf' },
        },
        range: { startLine: 3, endLine: 3 },
        analysisKind: 'character-observation',
        projectRoot: '/workspace',
      },
      { projectRoot: '/workspace' },
    );

    expect(result).toEqual(
      expect.objectContaining({
        coverage: 'fresh',
        freshness: 'fresh',
        matchedRanges: [
          expect.objectContaining({
            observationIds: ['obs-rin-line-3'],
            evidenceIds: ['obs-rin-line-3'],
          }),
        ],
      }),
    );
    expect(JSON.stringify(result)).not.toContain('character-memory.json');
  });
});

function makeQuery(): ProjectSemanticCoverageQuery {
  return {
    sourceRef: {
      kind: 'document',
      source: { kind: 'file', projectRelativePath: 'docs/comic.pdf' },
    },
    range: { startLine: 1, endLine: 20 },
    analysisKind: 'ocr',
    projectRoot: '/workspace',
    skillId: 'storyboard',
    skillVersion: '2026-06-12',
    schemaVersion: '1',
  };
}

function semanticIndexContent(): string {
  return JSON.stringify({
    version: 1,
    assetId: 'asset-page-1',
    sourceRef: {
      kind: 'document',
      source: { kind: 'file', projectRelativePath: 'docs/comic.pdf' },
    },
    textSegments: [
      {
        segmentId: 'segment-1',
        kind: 'ocr',
        text: 'Rin: We have to go.',
        sourceRef: {
          kind: 'document',
          source: { filePath: 'docs/comic.pdf', format: 'pdf' },
          range: { startLine: 1, endLine: 10 },
        },
        provenance: {
          providerId: 'ocr.local',
          sourceKind: 'comic',
        },
        range: { startLine: 1, endLine: 10 },
      },
    ],
  });
}

function characterMemoryContent(): string {
  return JSON.stringify({
    version: 1,
    ledger: {
      version: 1,
      projectRoot: '/workspace',
      observations: [
        {
          observationId: 'obs-rin-line-3',
          sourceRef: {
            kind: 'document',
            source: { filePath: 'docs/comic.pdf', format: 'pdf' },
            range: { startLine: 3, endLine: 3 },
          },
          provenance: {
            source: 'comic',
            providerId: 'vision.local',
          },
          reviewStatus: 'draft',
          entityRef: { entityId: 'char-rin', entityKind: 'character' },
          confidence: 0.82,
          dimensions: [
            {
              dimension: 'dialogue',
              value: 'We have to go.',
            },
          ],
        },
      ],
    },
  });
}
