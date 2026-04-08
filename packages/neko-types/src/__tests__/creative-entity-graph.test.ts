import { describe, expect, it } from 'vitest';
import {
  CREATIVE_ENTITY_GRAPH_VERSION,
  createEmptyCreativeEntityGraph,
  isTrustedOccurrenceEntry,
} from '../types';

describe('creative entity graph contract', () => {
  it('creates an empty graph with the expected version', () => {
    expect(createEmptyCreativeEntityGraph()).toEqual({
      version: CREATIVE_ENTITY_GRAPH_VERSION,
      nodes: [],
      edges: [],
    });
  });

  it('treats confirmed occurrences as trusted by default', () => {
    expect(
      isTrustedOccurrenceEntry({
        entity: { kind: 'character', id: 'char_alice' },
        source: 'generated-asset',
        sourceId: 'asset-1',
        locator: { uri: '/tmp/a.png' },
      }),
    ).toBe(true);
  });

  it('treats inferred occurrences as untrusted for structural navigation', () => {
    expect(
      isTrustedOccurrenceEntry({
        entity: { kind: 'character', id: 'char_alice' },
        source: 'generated-asset',
        sourceId: 'asset-1',
        strength: 'inferred',
        provenance: 'ai',
        locator: { uri: '/tmp/a.png' },
      }),
    ).toBe(false);
  });
});
