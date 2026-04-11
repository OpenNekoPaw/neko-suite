import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CharacterRegistryService,
  loadCharacterBindingsForNames,
  resolveCharacterRegistryPath,
} from '../character-registry';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
}));

describe('CharacterRegistryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty registry when the file does not exist', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('ENOENT'));

    const service = new CharacterRegistryService('/workspace/characters.json');
    await expect(service.load()).resolves.toEqual({ version: 1, characters: [] });
  });

  it('resolves character ids from canonical names, aliases, display names, and script names', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'char_alice',
            canonicalName: 'ALICE',
            displayName: 'Alice',
            aliases: ['小艾'],
            status: 'confirmed',
            bindings: {
              scriptNames: ['艾丽丝'],
            },
          },
        ],
      }),
    );

    const service = new CharacterRegistryService('/workspace/characters.json');
    await expect(service.resolveIds(['ALICE', 'Alice', '小艾', '艾丽丝', 'BOB'])).resolves.toEqual({
      ALICE: 'char_alice',
      Alice: 'char_alice',
      小艾: 'char_alice',
      艾丽丝: 'char_alice',
    });
  });

  it('persists registry files with atomic write semantics', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('ENOENT'));

    const service = new CharacterRegistryService('/workspace/characters.json');
    await service.upsert({
      id: 'char_alice',
      canonicalName: 'ALICE',
      aliases: [],
      status: 'confirmed',
    });

    expect(fs.mkdir).toHaveBeenCalledWith('/workspace', { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/workspace/characters.json.tmp',
      expect.stringContaining('"char_alice"'),
      'utf-8',
    );
    expect(fs.rename).toHaveBeenCalledWith(
      '/workspace/characters.json.tmp',
      '/workspace/characters.json',
    );
  });

  it('loads bindings from a workspace helper', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'char_alice',
            canonicalName: 'ALICE',
            aliases: [],
            status: 'confirmed',
          },
        ],
      }),
    );

    await expect(loadCharacterBindingsForNames('/workspace', ['ALICE'])).resolves.toEqual({
      ALICE: 'char_alice',
    });
    expect(resolveCharacterRegistryPath('/workspace')).toBe('/workspace/characters.json');
  });
});
