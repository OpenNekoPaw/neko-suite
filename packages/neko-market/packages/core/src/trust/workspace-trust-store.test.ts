import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceTrustStore } from './workspace-trust-store';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe('WorkspaceTrustStore', () => {
  it('stores trusted workspace decisions in local authority keyed by fingerprint', async () => {
    const trustRoot = await createTempDir();
    const store = new WorkspaceTrustStore(trustRoot);
    const workspaceUri = 'file:///workspace/project';

    const promoted = await store.promote(workspaceUri, 'user', 'native plugin development');
    const loaded = await store.get(promoted.workspaceFingerprint);

    expect(promoted.workspaceFingerprint).toBe(store.fingerprintWorkspace(workspaceUri));
    expect(loaded).toMatchObject({
      trustLevel: 'trusted',
      workspaceFingerprint: promoted.workspaceFingerprint,
      promotedBy: 'user',
      reason: 'native plugin development',
      source: 'user-promoted',
    });
  });

  it('treats project-local trusted hints as migration candidates until confirmed', async () => {
    const trustRoot = await createTempDir();
    const store = new WorkspaceTrustStore(trustRoot);
    const workspaceUri = 'file:///workspace/project';
    const fingerprint = store.fingerprintWorkspace(workspaceUri);
    const candidate = store.createMigrationCandidate(fingerprint, {
      trustLevel: 'trusted',
      createdByNeko: true,
    });

    expect(candidate).toMatchObject({
      fingerprint,
      hintedLevel: 'trusted',
      requiresUserConfirmation: true,
    });
    expect(await store.get(fingerprint)).toBeUndefined();

    const skipped = await store.importMigrationCandidate(candidate!, {
      workspaceUri,
      confirmed: false,
      promotedBy: 'user',
    });

    expect(skipped).toBeUndefined();
    expect(await store.get(fingerprint)).toBeUndefined();

    const imported = await store.importMigrationCandidate(candidate!, {
      workspaceUri,
      confirmed: true,
      promotedBy: 'user',
    });

    expect(imported).toMatchObject({
      trustLevel: 'trusted',
      workspaceFingerprint: fingerprint,
      source: 'user-promoted',
    });
    expect(await store.get(fingerprint)).toMatchObject({
      trustLevel: 'trusted',
      workspaceFingerprint: fingerprint,
    });
  });
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'neko-workspace-trust-'));
  tempDirs.push(dir);
  return dir;
}
