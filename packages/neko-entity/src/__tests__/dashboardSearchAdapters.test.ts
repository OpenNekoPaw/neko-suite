import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { NEKO_AGENT_TEST_NPC_COMMAND } from '@neko/shared/types/npc-test-bench';
import { CreativeEntityService } from '../core/CreativeEntityService';
import { EntityDashboardCreativeEntitySource } from '../dashboard/source';
import { createEntitySearchAdapter } from '../projections';
import { createEntitySearchAdapter as createEntitySearchAdapterCompat } from '../search';
import { MemoryEntityFileStore, createFixedClock } from '../testing';

const projectRoot = '/workspace/neko-test';
const now = '2026-05-18T00:00:00.000Z';

describe('neko-entity dashboard and search adapters', () => {
  it('projects confirmed entities and candidates through a neutral Dashboard source', async () => {
    const service = createService();
    await service.createEntity({ kind: 'character', canonicalName: '小橘', id: 'char_xiaoju' });
    const candidate = await service.proposeCandidate({
      kind: 'location',
      name: '天台',
      provenance: [{ providerId: 'neko-story', sourceKind: 'story', sourceRef: 'test.fountain:9' }],
    });
    const source = new EntityDashboardCreativeEntitySource({
      projectRoot,
      service,
      now: () => now,
    });

    const snapshot = await source.getSnapshot();

    expect(snapshot.source).toBe('neko-entity');
    expect(snapshot.rows.map((row) => row.label)).toEqual(['天台', '小橘']);
    expect(snapshot.rows.find((row) => row.label === '小橘')?.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'test-npc' })]),
    );
    expect(snapshot.rows.find((row) => row.label === '天台')?.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'test-npc', disabled: true })]),
    );
    await expect(
      source.executeAction({
        source: 'neko-entity',
        ref: {
          source: 'neko-entity',
          sourceEntityId: candidate.id,
          entityId: candidate.id,
          entityKind: 'location',
        },
        action: 'confirm-candidate',
      }),
    ).resolves.toEqual(expect.objectContaining({ ok: true, refresh: true }));
  });

  it('delegates neutral Dashboard NPC tests to the Agent command', async () => {
    const service = createService();
    await service.createEntity({ kind: 'character', canonicalName: '小橘', id: 'char_xiaoju' });
    const executeCommand = vi.fn(async () => undefined);
    const source = new EntityDashboardCreativeEntitySource({
      projectRoot,
      service,
      executeCommand,
      now: () => now,
    });
    const ref = {
      source: 'neko-entity',
      sourceEntityId: 'entity:char_xiaoju',
      entityId: 'char_xiaoju',
      entityKind: 'character' as const,
    };

    await expect(
      source.executeAction({
        source: 'neko-entity',
        ref,
        action: 'test-npc',
        payload: { mode: 'consult' },
      }),
    ).resolves.toEqual(expect.objectContaining({ ok: true, refresh: false, ref }));

    expect(executeCommand).toHaveBeenCalledWith(
      NEKO_AGENT_TEST_NPC_COMMAND,
      expect.objectContaining({
        entityRef: {
          entityId: 'char_xiaoju',
          entityKind: 'character',
          projectRoot,
          source: 'neko-entity',
        },
        dashboardRef: ref,
        source: 'dashboard',
        projectRoot,
        mode: 'consult',
      }),
    );
  });

  it('exposes read-only entity projections for project search', async () => {
    const service = createService();
    await service.createEntity({
      kind: 'character',
      canonicalName: '小橘',
      id: 'char_xiaoju',
      aliases: ['Xiaoju'],
    });
    await service.proposeCandidate({
      kind: 'object',
      name: '钥匙',
      provenance: [{ providerId: 'neko-story', sourceKind: 'story' }],
    });
    const adapter = createEntitySearchAdapter({ projectRoot, service });

    const result = await adapter.query(
      { text: '小橘', mode: 'global', projectRoot },
      { projectRoot },
    );

    expect(result).toEqual([
      expect.objectContaining({
        kind: 'creative-entity',
        label: '小橘',
        navigationData: { entityId: 'char_xiaoju', kind: 'character', source: 'neko-entity' },
      }),
    ]);
    await expect(
      adapter.query({ text: '', kinds: ['entity-candidate'], projectRoot }, { projectRoot }),
    ).resolves.toEqual([expect.objectContaining({ kind: 'entity-candidate', label: '钥匙' })]);
  });

  it('keeps the legacy search entrypoint as a projection compatibility alias', () => {
    expect(createEntitySearchAdapterCompat).toBe(createEntitySearchAdapter);
  });
});

function createService(): CreativeEntityService {
  return new CreativeEntityService({
    projectRoot,
    ports: {
      files: new MemoryEntityFileStore(),
      clock: createFixedClock(now),
    },
  });
}
