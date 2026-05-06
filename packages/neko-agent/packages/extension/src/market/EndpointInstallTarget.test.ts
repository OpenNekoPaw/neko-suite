import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AssetManifest } from '@neko/shared';
import { EndpointInstallTarget } from './EndpointInstallTarget';

describe('EndpointInstallTarget', () => {
  it('requires registration distribution and endpoint metadata', () => {
    const target = new EndpointInstallTarget();

    expect(() => target.validateManifest(endpointManifest())).not.toThrow();
    expect(target.getInstallPath(endpointManifest())).toContain('/.neko/endpoints/openai/endpoint');
  });

  it('writes endpoint registration data during stage', async () => {
    const target = new EndpointInstallTarget();
    const dir = await mkdtemp(join(tmpdir(), 'neko-endpoint-target-'));

    try {
      await target.writeRegistration?.(endpointManifest(), dir);
      const content = await readFile(join(dir, 'endpoint.json'), 'utf-8');
      expect(JSON.parse(content)).toMatchObject({
        id: '@studio/endpoint',
        provider: 'openai',
        capabilities: ['chat'],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function endpointManifest(): AssetManifest {
  return {
    id: '@studio/endpoint',
    name: 'endpoint',
    version: '1.0.0',
    type: 'endpoint',
    source: { kind: 'local', path: '/tmp/endpoint' },
    distributionKind: 'registration',
    typeMetadata: {
      type: 'endpoint',
      data: {
        provider: 'openai',
        capabilities: ['chat'],
        endpointTemplate: 'https://api.example.invalid/${model}',
        credentialSchema: { fields: [] },
      },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}
