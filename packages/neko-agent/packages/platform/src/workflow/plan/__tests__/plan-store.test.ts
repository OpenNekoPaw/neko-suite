import { describe, expect, it } from 'vitest';
import { createMemoryFileIO } from '../../asset-library';
import { PlanStore, toNkPlan, type PersistentPlan } from '../index';

function makePlan(id: string, status: PersistentPlan['status'] = 'pending'): PersistentPlan {
  return {
    ...toNkPlan(
      {
        id,
        createdAt: 100,
        status:
          status === 'executing' ||
          status === 'paused' ||
          status === 'completed' ||
          status === 'failed'
            ? 'approved'
            : status,
        route: {
          level: 'L2',
          flowId: 'flowE',
          entryExtension: 'story',
          skipStages: [],
          reason: 'fix',
          confidence: 0.9,
          provenance: 'rules',
        },
        stages: [{ id: 'parseStoryboard', label: 'Parse', skipped: false }],
      },
      { now: 100 },
    ),
    status,
    statusHistory: [{ status, at: 100 }],
  };
}

describe('PlanStore — save/load round-trip', () => {
  it('persists to the bindings file and reloads', async () => {
    const io = createMemoryFileIO();
    const store = new PlanStore({ workDir: '/w', fileIO: io });
    const plan = makePlan('plan_one');
    await store.save(plan);
    const file = io.store.get('/w/.neko/plans/plan_one.nkplan');
    expect(file).toBeDefined();
    const reloaded = await store.load('plan_one');
    expect(reloaded?.id).toBe('plan_one');
    expect(reloaded?.status).toBe('pending');
  });

  it('load returns undefined for missing plan', async () => {
    const store = new PlanStore({ workDir: '/w', fileIO: createMemoryFileIO() });
    expect(await store.load('nope')).toBeUndefined();
  });

  it('load returns undefined for corrupt file', async () => {
    const io = createMemoryFileIO();
    await io.write('/w/.neko/plans/plan_x.nkplan', '{ malformed');
    const store = new PlanStore({ workDir: '/w', fileIO: io });
    expect(await store.load('plan_x')).toBeUndefined();
  });

  it('exists returns true only when saved', async () => {
    const store = new PlanStore({ workDir: '/w', fileIO: createMemoryFileIO() });
    expect(await store.exists('p1')).toBe(false);
    await store.save(makePlan('p1'));
    expect(await store.exists('p1')).toBe(true);
  });

  it('save throws when plan is invalid', async () => {
    const store = new PlanStore({ workDir: '/w', fileIO: createMemoryFileIO() });
    const bad = { ...makePlan('p1'), id: '' };
    await expect(store.save(bad as PersistentPlan)).rejects.toThrow();
  });

  it('pathFor rejects unsafe ids', () => {
    const store = new PlanStore({ workDir: '/w', fileIO: createMemoryFileIO() });
    expect(() => store.pathFor('../etc/passwd')).toThrow();
    expect(() => store.pathFor('spaces in name')).toThrow();
  });
});

describe('PlanStore — transition', () => {
  it('applies transition + persists', async () => {
    const store = new PlanStore({ workDir: '/w', fileIO: createMemoryFileIO() });
    await store.save(makePlan('p'));
    const approved = await store.transition('p', 'approved', { reason: 'user' });
    expect(approved.status).toBe('approved');
    expect(approved.statusHistory).toHaveLength(2);

    const reloaded = await store.load('p');
    expect(reloaded?.status).toBe('approved');
  });

  it('throws on illegal transition', async () => {
    const store = new PlanStore({ workDir: '/w', fileIO: createMemoryFileIO() });
    await store.save(makePlan('p'));
    await expect(store.transition('p', 'executing')).rejects.toThrow();
  });

  it('throws when plan not found', async () => {
    const store = new PlanStore({ workDir: '/w', fileIO: createMemoryFileIO() });
    await expect(store.transition('missing', 'approved')).rejects.toThrow(/not found/);
  });
});
