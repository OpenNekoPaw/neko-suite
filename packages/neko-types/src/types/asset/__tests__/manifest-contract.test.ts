import { describe, expect, it } from 'vitest';
import {
  CATEGORY_MAP,
  getAssetCategory,
  getLegacyAssetTypeMigration,
  isAssetType,
  isDistributionKind,
  isBundleType,
  isMediaKind,
  parseAssetManifest,
  validatePluginPermissionDeclarations,
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

  it('accepts puppet, model, and voice media kinds for character assets', () => {
    const kinds = [
      'puppet-model',
      'puppet-config',
      'model-3d',
      'model-motion',
      'model-config',
      'voice-pack',
    ] as const;

    for (const mediaKind of kinds) {
      const result = validateAssetManifest(
        validManifest({
          id: `@studio/${mediaKind}`,
          name: mediaKind,
          type: 'media',
          typeMetadata: {
            type: 'media',
            data: { mediaKind, fileSize: 1 },
          },
        }),
      );

      expect(isMediaKind(mediaKind)).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it('rejects unknown media kinds during shared manifest validation', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'media',
        typeMetadata: {
          type: 'media',
          data: { mediaKind: 'zip-blunder', fileSize: 1 } as never,
        },
      }),
    );

    expect(isMediaKind('zip-blunder')).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'typeMetadata.data.mediaKind',
      message: 'must be a known MediaKind',
    });
  });

  it('accepts character-pack and motion-pack bundle metadata', () => {
    for (const bundleType of ['character-pack', 'motion-pack'] as const) {
      const result = validateAssetManifest(
        validManifest({
          id: `@studio/${bundleType}`,
          name: bundleType,
          type: 'bundle',
          distributionKind: 'orchestration',
          typeMetadata: {
            type: 'bundle',
            data: { installPolicy: 'all', bundleType },
          },
          contents: [
            {
              packageId: '@studio/asset',
              version: '^1.0.0',
              role: bundleType === 'character-pack' ? 'model' : 'motion',
            },
          ],
        }),
      );

      expect(isBundleType(bundleType)).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it('rejects unknown bundle metadata type', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'bundle',
        distributionKind: 'orchestration',
        typeMetadata: {
          type: 'bundle',
          data: { installPolicy: 'all', bundleType: 'loot-box' } as never,
        },
        contents: [{ packageId: '@studio/asset', version: '^1.0.0' }],
      }),
    );

    expect(isBundleType('loot-box')).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'typeMetadata.data.bundleType',
      message: 'must be a known BundleType',
    });
  });

  it('validates plugin metadata as native cdylib metadata', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'plugin',
        typeMetadata: {
          type: 'plugin',
          data: {
            entryPoint: 'plugin_init',
            apiVersion: '1.0',
            permissions: ['network:host-list'],
            networkHosts: ['api.example.com'],
            engineRequirements: {
              minVersion: '1.0',
              targetTriple: 'x86_64-apple-darwin',
              runtimeArtifacts: ['cdylib'],
            },
          },
        },
      }),
    );

    expect(result.valid).toBe(true);
  });

  it('rejects plugin metadata without cdylib engine requirements', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'plugin',
        typeMetadata: {
          type: 'plugin',
          data: {
            entryPoint: 'plugin_init',
            apiVersion: '1.0',
            permissions: ['network:host-list'],
          } as never,
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          field: 'typeMetadata.data.networkHosts',
          message: 'required when permissions includes network:host-list',
        },
        { field: 'typeMetadata.data.engineRequirements', message: 'must be an object' },
      ]),
    );
  });

  it('supports publisher verified projection in distribution metadata', () => {
    const manifest = validManifest({
      distribution: {
        license: 'Commercial',
        author: 'Studio',
        tags: ['plugin'],
        checksum: 'sha256-abc',
        trustLevel: 'community',
        verified: false,
        publisher: {
          id: 'abc-studio',
          displayName: 'ABC Studio',
          verified: true,
          verificationTier: 'verified',
          verifiedAt: 1_700_000_000_000,
        },
        signature: {
          algorithm: 'sha256',
          value: 'manifest-sha',
        },
      },
    });

    expect(manifest.distribution?.publisher?.verified).toBe(true);
    expect(manifest.distribution?.verified).toBe(false);
    expect(validateAssetManifest(manifest).valid).toBe(true);
  });

  it('requires local sources to use variable paths and copy-managed root', () => {
    const absolute = validateAssetManifest(
      validManifest({
        source: { kind: 'local', path: '/Users/me/luts/warm.cube', storageMode: 'copy-managed' },
      }),
    );
    const local = validateAssetManifest(
      validManifest({
        source: {
          kind: 'local',
          path: '${NEKO_HOME}/local/presets/lut/warm/warm.cube',
          storageMode: 'copy-managed',
        },
      }),
    );
    const linked = validateAssetManifest(
      validManifest({
        source: {
          kind: 'local-link',
          path: '${WORKSPACE}/luts/warm.cube',
          storageMode: 'local-link',
        },
      }),
    );

    expect(absolute.valid).toBe(false);
    expect(absolute.issues).toEqual(
      expect.arrayContaining([
        {
          field: 'source.path',
          message:
            'must use PathResolver variable form such as ${NEKO_HOME}/... or ${WORKSPACE}/...',
        },
      ]),
    );
    expect(local.valid).toBe(true);
    expect(linked.valid).toBe(true);
  });

  it('reports high-sensitive plugin permission diagnostics', () => {
    const diagnostics = validatePluginPermissionDeclarations({
      permissions: ['network:host-list', 'network:any', 'process-spawn'],
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        {
          field: 'networkHosts',
          severity: 'error',
          permission: 'network:host-list',
          message: 'required when permissions includes network:host-list',
        },
        expect.objectContaining({
          severity: 'warning',
          permission: 'network:any',
        }),
        expect.objectContaining({
          severity: 'warning',
          permission: 'process-spawn',
        }),
      ]),
    );
  });

  it('accepts shader and model local validation metadata', () => {
    const shader = validateAssetManifest(
      validManifest({
        type: 'shader',
        typeMetadata: {
          type: 'shader',
          data: {
            shaderKind: 'standalone',
            language: 'wgsl',
            stage: 'fragment',
            inputs: [],
            artifactForm: 'spirv-binary',
            localValidation: {
              validator: 'spirv-val',
              sourceWarning: true,
              resourceLimits: { maxCompileTimeMs: 1_000 },
            },
          },
        },
      }),
    );
    const model = validateAssetManifest(
      validManifest({
        type: 'model',
        typeMetadata: {
          type: 'model',
          data: {
            modelKind: 'base',
            framework: 'gguf',
            task: 'chat',
            size: 1024,
            localValidation: {
              sourceWarning: true,
              resourcePolicy: { maxRamMB: 4096, allowTrustedWorkspaceOverride: true },
            },
          },
        },
      }),
    );

    expect(shader.valid).toBe(true);
    expect(model.valid).toBe(true);
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
