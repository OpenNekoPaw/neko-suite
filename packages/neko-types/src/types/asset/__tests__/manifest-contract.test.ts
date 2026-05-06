import { describe, expect, it } from 'vitest';
import {
  CATEGORY_MAP,
  getAssetCategory,
  getLegacyAssetTypeMigration,
  isAssetType,
  isDistributionKind,
  parseAssetManifest,
  validateAssetManifest,
  type AssetManifest,
} from '../manifest';

function validManifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return {
    id: '@studio/cinematic-lut',
    name: 'Cinematic LUT',
    version: '1.0.0',
    type: 'preset',
    source: {
      kind: 'registry',
      registry: 'https://market.neko.dev/api/v1',
      package: '@studio/cinematic-lut',
      version: '1.0.0',
      integrity: 'sha256-abc',
    },
    distributionKind: 'archive',
    typeMetadata: {
      type: 'preset',
      data: { presetKind: 'lut' },
    },
    distribution: {
      license: 'MIT',
      author: 'Studio',
      tags: ['lut'],
      checksum: 'sha256-abc',
      signature: {
        algorithm: 'sha256',
        value: 'manifest-sha',
      },
    },
    intent: {
      useCases: ['color-grading'],
    },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('AssetManifest v4 contract', () => {
  it('accepts a valid v4 registry manifest', () => {
    const result = validateAssetManifest(validManifest());

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(parseAssetManifest(validManifest()).type).toBe('preset');
  });

  it('derives AssetCategory from v4 AssetType', () => {
    expect(CATEGORY_MAP.model).toBe('ai');
    expect(CATEGORY_MAP.endpoint).toBe('ai');
    expect(CATEGORY_MAP.provider).toBe('ai');
    expect(getAssetCategory('bundle')).toBe('bundle');
  });

  it('rejects legacy asset types as direct AssetType values', () => {
    expect(isAssetType('media')).toBe(true);
    expect(isAssetType('video')).toBe(false);
    expect(getLegacyAssetTypeMigration('video')).toMatchObject({
      legacyType: 'video',
      type: 'media',
      metadataPatch: { type: 'media', data: { mediaKind: 'video' } },
    });
    expect(getLegacyAssetTypeMigration('provider-card')).toMatchObject({
      type: 'provider',
      metadataPatch: { type: 'provider' },
    });
  });

  it('rejects metadata whose discriminator does not match manifest type', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'shader',
        typeMetadata: {
          type: 'model',
          data: {
            modelKind: 'base',
            framework: 'onnx',
            task: 'image-gen',
            size: 1,
          },
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'typeMetadata.type',
      message: 'must match manifest type',
    });
  });

  it('allows unknown optional manifest fields through parser', () => {
    const manifest = {
      ...validManifest(),
      futureOptionalField: { ignoredByOldClients: true },
    };

    expect(parseAssetManifest(manifest).id).toBe('@studio/cinematic-lut');
  });

  it('blocks unsupported distribution kind', () => {
    const result = validateAssetManifest({
      ...validManifest(),
      distributionKind: 'streaming',
    });

    expect(isDistributionKind('streaming')).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'distributionKind',
      message: 'must be one of archive, orchestration, registration',
    });
  });

  it('requires bundle contents and orchestration distribution', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'bundle',
        distributionKind: 'archive',
        typeMetadata: {
          type: 'bundle',
          data: { installPolicy: 'all' },
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { field: 'contents', message: 'bundle manifests must include contents' },
        { field: 'distributionKind', message: 'bundle must use orchestration' },
      ]),
    );
  });

  it('requires intent useCases for client-side fallback validation', () => {
    const result = validateAssetManifest({
      ...validManifest(),
      intent: { useCases: [] },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'intent.useCases',
      message: 'must include at least one item',
    });
  });

  it('requires paid packages to declare notFor constraints', () => {
    const result = validateAssetManifest(
      validManifest({
        distribution: {
          license: 'Commercial',
          author: 'Studio',
          tags: ['lut'],
          checksum: 'sha256-abc',
          pricing: { model: 'paid', price: 12, currency: 'USD' },
          signature: {
            algorithm: 'sha256',
            value: 'manifest-sha',
          },
        },
        intent: {
          useCases: ['color-grading'],
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'intent.notFor',
      message: 'paid packages must include at least one notFor value',
    });
  });

  it('validates typeMetadata data required fields by asset type', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'model',
        typeMetadata: {
          type: 'model',
          data: {
            modelKind: 'base',
            framework: 'onnx',
          } as never,
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { field: 'typeMetadata.data.task', message: 'must be a non-empty string' },
        { field: 'typeMetadata.data.size', message: 'must be a number' },
      ]),
    );
  });

  it('validates large asset mode-specific invariants', () => {
    const result = validateAssetManifest(
      validManifest({
        largeAsset: {
          modes: ['proxy', 'variant', 'delta'],
          totalSize: 100,
          proxyVariants: [
            { qualityTag: 'low', size: 10 },
            { qualityTag: 'high', size: 100 },
          ],
          variants: [
            { variantId: 'fp16', size: 100 },
            { variantId: 'int8', size: 50 },
          ],
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          field: 'largeAsset.proxyVariants',
          message: 'proxy mode requires exactly one default variant',
        },
        {
          field: 'largeAsset.variants',
          message: 'variant mode requires exactly one recommended variant',
        },
        { field: 'largeAsset.deltaBase', message: 'required for delta mode' },
      ]),
    );
  });
});
