import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import {
  NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND,
  NEKO_AGENT_EMBODY_CHARACTER_COMMAND,
} from '@neko/shared/types/npc-test-bench';
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
    await service.proposeCandidate({
      kind: 'character',
      name: '阿灰',
      provenance: [{ providerId: 'neko-story', sourceKind: 'story', sourceRef: 'test.fountain:7' }],
    });
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
    expect(snapshot.rows.map((row) => row.label)).toEqual(['阿灰', '天台', '小橘']);
    expect(snapshot.rows.find((row) => row.label === '小橘')?.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'character-dialogue' })]),
    );
    expect(snapshot.rows.find((row) => row.label === '小橘')?.actions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'validate-character' })]),
    );
    expect(snapshot.rows.find((row) => row.label === '天台')?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'character-dialogue', disabled: true }),
      ]),
    );
    expect(snapshot.rows.find((row) => row.label === '阿灰')?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'character-dialogue' }),
        expect.objectContaining({ id: 'embody-character' }),
      ]),
    );
    const detail = await source.getDetail({
      source: 'neko-entity',
      sourceEntityId: 'entity:char_xiaoju',
      entityId: 'char_xiaoju',
      entityKind: 'character',
    });
    expect(detail?.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'embody-character' })]),
    );
    expect(detail?.actions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'validate-character' }),
        expect.objectContaining({ id: 'improve-character' }),
      ]),
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

  it('delegates neutral Dashboard Character Dialogue to the Agent command', async () => {
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
        action: 'character-dialogue',
        payload: { mode: 'consult' },
      }),
    ).resolves.toEqual(expect.objectContaining({ ok: true, refresh: false, ref }));

    expect(executeCommand).toHaveBeenCalledWith(
      NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND,
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
        enrichment: 'skip',
        mode: 'consult',
      }),
    );
  });

  it('delegates neutral Dashboard Embody Character workflows with stable character refs', async () => {
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
        action: 'embody-character',
        payload: {
          scopes: [{ kind: 'project', source: 'neko-entity', ref: 'project://current' }],
          prompt: 'Check if the role knows too much.',
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        refresh: false,
        characterRoleWorkflow: {
          kind: 'delegated-command',
          command: NEKO_AGENT_EMBODY_CHARACTER_COMMAND,
        },
      }),
    );

    expect(executeCommand).toHaveBeenCalledWith(
      NEKO_AGENT_EMBODY_CHARACTER_COMMAND,
      expect.objectContaining({
        workflow: 'embody-character',
        entityRef: {
          entityId: 'char_xiaoju',
          entityKind: 'character',
          projectRoot,
          source: 'neko-entity',
        },
        dashboardRef: ref,
        scopes: [{ kind: 'project', source: 'neko-entity', ref: 'project://current' }],
        prompt: 'Check if the role knows too much.',
        source: 'dashboard',
        projectRoot,
      }),
    );
  });

  it('delegates neutral Dashboard Embody Character workflows for character candidates', async () => {
    const service = createService();
    const candidate = await service.proposeCandidate({
      kind: 'character',
      name: '阿灰',
      provenance: [{ providerId: 'neko-story', sourceKind: 'story', sourceRef: 'test.fountain:7' }],
    });
    const executeCommand = vi.fn(async () => undefined);
    const source = new EntityDashboardCreativeEntitySource({
      projectRoot,
      service,
      executeCommand,
      now: () => now,
    });
    const ref = {
      source: 'neko-entity',
      sourceEntityId: candidate.id,
      entityId: candidate.id,
      entityKind: 'character' as const,
    };

    await expect(
      source.executeAction({
        source: 'neko-entity',
        ref,
        action: 'embody-character',
      }),
    ).resolves.toEqual(expect.objectContaining({ ok: true, refresh: false, ref }));

    expect(executeCommand).toHaveBeenCalledWith(
      NEKO_AGENT_EMBODY_CHARACTER_COMMAND,
      expect.objectContaining({
        workflow: 'embody-character',
        entityRef: {
          entityId: candidate.id,
          entityKind: 'character',
          projectRoot,
          source: 'neko-entity',
        },
        dashboardRef: ref,
        source: 'dashboard',
        projectRoot,
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
