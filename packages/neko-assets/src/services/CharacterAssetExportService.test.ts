import { describe, expect, it, vi } from 'vitest';
import type { AssetEntity, CharacterRecord, EntityAssetBinding } from '@neko/shared';
import { CharacterAssetExportService } from './CharacterAssetExportService';

describe('CharacterAssetExportService', () => {
  it('exports .nkentity with character metadata and bound asset references', async () => {
    const fs = createFs();
    const service = createService(fs);

    const result = await service.exportEntity({
      projectRoot: '/repo',
      entityId: 'char-sakura',
      outputPath: '/repo/out/sakura.nkentity',
    });

    expect(result.entity).toMatchObject({
      format: 'nkentity',
      entity: { name: 'Sakura', aliases: ['桜'] },
      bindings: [
        {
          role: 'live2d',
          mediaKind: 'puppet-model',
          dimension: 'model',
          assetEntityId: 'asset-sakura-model',
        },
        {
          role: 'motion',
          mediaKind: 'puppet-motion',
          dimension: 'motion',
          assetEntityId: 'asset-sakura-motion',
        },
      ],
    });
    expect(JSON.parse(String(fs.files.get('/repo/out/sakura.nkentity')))).toMatchObject({
      format: 'nkentity',
    });
  });

  it('exports character-pack bundle manifest, entity artifact, and subpackage files', async () => {
    const fs = createFs({
      '/repo/assets/sakura.nkp': Buffer.from('project'),
      '/repo/assets/idle.motion3.json': Buffer.from('{}'),
    });
    const writtenZips: FakeZip[] = [];
    const service = createService(fs, {
      zipConstructor: fakeZipConstructor(writtenZips),
    });

    const result = await service.exportCharacterPack({
      projectRoot: '/repo',
      entityId: 'char-sakura',
      outputPath: '/repo/out/sakura-character-pack.zip',
      name: 'Sakura Pack',
    });

    expect(result.manifest).toMatchObject({
      type: 'bundle',
      distributionKind: 'orchestration',
      typeMetadata: {
        type: 'bundle',
        data: { bundleType: 'character-pack' },
      },
    });
    expect([...(writtenZips[0]?.entries.keys() ?? [])]).toEqual(
      expect.arrayContaining([
        'manifest.json',
        'entity.nkentity',
        'assets/asset-sakura-model/manifest.json',
        'assets/asset-sakura-model/files/sakura.nkp',
        'assets/asset-sakura-motion/manifest.json',
        'assets/asset-sakura-motion/files/idle.motion3.json',
      ]),
    );
    expect(fs.files.get('/repo/out/sakura-character-pack.zip')).toBeInstanceOf(Buffer);
  });
});

function createService(
  fs = createFs(),
  options: { readonly zipConstructor?: new () => FakeZip } = {},
) {
  return new CharacterAssetExportService({
    fs,
    library: {
      getAllEntities: vi.fn(async () => assetEntities()),
      resolvePath: (storedPath) =>
        storedPath.startsWith('/') ? storedPath : `/repo/${storedPath}`,
    },
    characters: {
      list: vi.fn(async () => characters()),
    },
    bindings: {
      list: vi.fn(async () => bindings()),
    },
    zipConstructor: options.zipConstructor ?? fakeZipConstructor([]),
    now: () => new Date('2026-05-20T00:00:00.000Z'),
  });
}

function characters(): readonly CharacterRecord[] {
  return [
    {
      id: 'char-sakura',
      canonicalName: 'Sakura',
      aliases: ['桜'],
      status: 'confirmed',
      metadata: { role: 'protagonist' },
    },
  ];
}

function bindings(): readonly EntityAssetBinding[] {
  return [
    {
      id: 'binding-model',
      entityId: 'char-sakura',
      entityKind: 'character',
      assetRef: 'project://assets/asset-sakura-model',
      role: 'live2d',
      isDefault: true,
      status: 'confirmed',
      source: 'user',
      updatedAt: '2026-05-20T00:00:00.000Z',
    },
    {
      id: 'binding-motion',
      entityId: 'char-sakura',
      entityKind: 'character',
      assetRef: 'project://assets/asset-sakura-motion',
      role: 'motion',
      status: 'confirmed',
      source: 'user',
      updatedAt: '2026-05-20T00:00:00.000Z',
    },
  ];
}

function assetEntities(): readonly AssetEntity[] {
  return [
    assetEntity({
      id: 'asset-sakura-model',
      name: 'Sakura Model',
      filePath: '/repo/assets/sakura.nkp',
      mediaKind: 'puppet-model',
      dimension: 'model',
    }),
    assetEntity({
      id: 'asset-sakura-motion',
      name: 'Sakura Idle',
      filePath: '/repo/assets/idle.motion3.json',
      mediaKind: 'puppet-motion',
      dimension: 'motion',
    }),
  ];
}

function assetEntity(input: {
  readonly id: string;
  readonly name: string;
  readonly filePath: string;
  readonly mediaKind: 'puppet-model' | 'puppet-motion';
  readonly dimension: 'model' | 'motion';
}): AssetEntity {
  return {
    id: input.id,
    name: input.name,
    category: 'character',
    metadata: {},
    tags: [input.mediaKind],
    usageCount: 0,
    createdAt: 1,
    updatedAt: 1,
    variants: [
      {
        id: `${input.id}-variant`,
        entityId: input.id,
        name: input.dimension,
        attributes: {},
        createdAt: 1,
        files: [
          {
            id: `${input.id}-file`,
            variantId: `${input.id}-variant`,
            name: input.name,
            path: input.filePath,
            mediaType: 'document',
            metadata: { fileSize: 10, mimeType: 'application/octet-stream' },
            purpose: 'main',
            createdAt: 1,
            characterAsset: {
              assetDimension: input.dimension,
              mediaKind: input.mediaKind,
              storageMode: 'workspace',
            },
          },
        ],
      },
    ],
  };
}

class FakeZip {
  readonly entries = new Map<string, Buffer>();

  addFile(entryName: string, data: Buffer) {
    this.entries.set(entryName, Buffer.from(data));
  }

  toBuffer() {
    return Buffer.from(JSON.stringify([...this.entries.keys()]), 'utf-8');
  }
}

function fakeZipConstructor(writtenZips: FakeZip[]) {
  return class TestZip extends FakeZip {
    constructor() {
      super();
      writtenZips.push(this);
    }
  };
}

function createFs(initialFiles: Record<string, Uint8Array> = {}) {
  const files = new Map<string, string | Uint8Array>(Object.entries(initialFiles));
  return {
    files,
    readFile: vi.fn(async (filePath: string) => {
      const file = files.get(filePath);
      if (file === undefined) throw new Error(`Missing file: ${filePath}`);
      return typeof file === 'string' ? Buffer.from(file, 'utf-8') : file;
    }),
    writeFile: vi.fn(async (filePath: string, data: Uint8Array) => {
      files.set(filePath, Buffer.from(data));
    }),
    createDirectory: vi.fn(async () => undefined),
    exists: vi.fn(async (filePath: string) => files.has(filePath)),
  };
}
