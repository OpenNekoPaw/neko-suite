import { describe, expect, it } from 'vitest';
import {
  CHARACTER_REGISTRY_VERSION,
  createEmptyCharacterRegistry,
  isCharacterRegistryFile,
  normalizeCharacterLookupKey,
} from '../types/character-registry';

describe('character registry contract', () => {
  it('creates an empty registry with the expected version', () => {
    expect(createEmptyCharacterRegistry()).toEqual({
      version: CHARACTER_REGISTRY_VERSION,
      characters: [],
    });
  });

  it('accepts a valid characters.json payload', () => {
    const payload = {
      version: 1,
      characters: [
        {
          id: 'char_alice',
          canonicalName: 'ALICE',
          displayName: 'Alice',
          aliases: ['Alice', '艾丽丝'],
          status: 'confirmed',
          bindings: {
            scriptNames: ['ALICE'],
          },
        },
      ],
    };

    expect(isCharacterRegistryFile(payload)).toBe(true);
  });

  it('rejects malformed registry payloads', () => {
    expect(
      isCharacterRegistryFile({
        version: 1,
        characters: [
          {
            id: 'char_alice',
            canonicalName: 'ALICE',
            aliases: 'Alice',
            status: 'confirmed',
          },
        ],
      }),
    ).toBe(false);
  });

  it('normalizes lookup keys for cross-source resolution', () => {
    expect(normalizeCharacterLookupKey('  Alice  ')).toBe('alice');
  });
});
