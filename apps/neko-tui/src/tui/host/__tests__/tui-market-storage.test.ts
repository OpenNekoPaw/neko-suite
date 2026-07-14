import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTuiMarketStorage } from '../tui-market-storage';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('TUI Market storage', () => {
  it('uses the canonical personal Skills root and shared user database registry', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-tui-market-'));
    temporaryDirectories.push(homedir);
    const first = await createTuiMarketStorage({ homedir });

    expect(first.skillsBase).toBe(join(homedir, '.agents', 'skills'));
    await first.registry.add({
      packageId: '@studio/storyboard',
      version: '1.0.0',
      type: 'skill',
      installedAt: 1,
      installedPath: join(homedir, '.agents', 'skills', 'studio', 'storyboard'),
      manifest: {
        id: '@studio/storyboard',
        name: 'storyboard',
        version: '1.0.0',
        type: 'skill',
        source: {
          kind: 'registry',
          registry: 'official',
          package: '@studio/storyboard',
          version: '1.0.0',
          integrity: 'sha256-storyboard',
        },
        distributionKind: 'archive',
        typeMetadata: { type: 'skill', data: { domain: ['story'] } },
        intent: { useCases: ['storyboarding'] },
        createdAt: 1,
        updatedAt: 1,
      },
      enabled: true,
      requested: true,
      status: 'active',
    });
    await first.dispose();

    const reopened = await createTuiMarketStorage({ homedir });
    expect(reopened.registry.get('@studio/storyboard')?.installedPath).toBe(
      join(homedir, '.agents', 'skills', 'studio', 'storyboard'),
    );
    await reopened.dispose();
  });
});
