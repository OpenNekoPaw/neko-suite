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

describe('PlanStore — listPlans', () => {
  function seed(id: string, overrides: Partial<PersistentPlan> = {}): PersistentPlan {
    return { ...makePlan(id), ...overrides };
  }

  it('returns all plans sorted by updatedAt (newest first)', async () => {
    const io = createMemoryFileIO();
    const store = new PlanStore({ workDir: '/w', fileIO: io });
    await store.save(seed('a', { updatedAt: 100 }));
    await store.save(seed('b', { updatedAt: 300 }));
    await store.save(seed('c', { updatedAt: 200 }));

    const list = await store.listPlans();
    expect(list.map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('filters by status', async () => {
    const io = createMemoryFileIO();
    const store = new PlanStore({ workDir: '/w', fileIO: io });
    await store.save(seed('p1', { status: 'pending' }));
    await store.save(
      seed('p2', { status: 'approved', statusHistory: [{ status: 'approved', at: 100 }] }),
    );
    const pending = await store.listPlans({ status: 'pending' });
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe('p1');
  });

  it('filters by parentPlanId (listForks)', async () => {
    const io = createMemoryFileIO();
    const store = new PlanStore({ workDir: '/w', fileIO: io });
    await store.save(seed('root'));
    await store.save(seed('fork1', { parentPlanId: 'root' }));
    await store.save(seed('fork2', { parentPlanId: 'root' }));
    await store.save(seed('unrelated'));

    const forks = await store.listForks('root');
    expect(forks).toHaveLength(2);
    expect(forks.map((p) => p.id).sort()).toEqual(['fork1', 'fork2']);
  });

  it('skips corrupt files', async () => {
    const io = createMemoryFileIO();
    await io.write('/w/.neko/plans/broken.nkplan', '{ not json');
    const store = new PlanStore({ workDir: '/w', fileIO: io });
    await store.save(seed('good'));
    const list = await store.listPlans();
    expect(list.map((p) => p.id)).toEqual(['good']);
  });

  it('skips files with non-.nkplan extensions', async () => {
    const io = createMemoryFileIO();
    await io.write('/w/.neko/plans/stray.txt', 'nope');
    const store = new PlanStore({ workDir: '/w', fileIO: io });
    await store.save(seed('p1'));
    const list = await store.listPlans();
    expect(list.map((p) => p.id)).toEqual(['p1']);
  });

  it('returns [] when the plans dir does not exist yet', async () => {
    const store = new PlanStore({ workDir: '/w', fileIO: createMemoryFileIO() });
    expect(await store.listPlans()).toEqual([]);
  });

  it('honours limit', async () => {
    const io = createMemoryFileIO();
    const store = new PlanStore({ workDir: '/w', fileIO: io });
    for (let i = 0; i < 5; i++) {
      await store.save(seed(`p${i}`, { updatedAt: i * 10 }));
    }
    const top2 = await store.listPlans({ limit: 2 });
    expect(top2.map((p) => p.id)).toEqual(['p4', 'p3']);
  });

  it('returns [] when the adapter has no readdir', async () => {
    const baseIO = createMemoryFileIO();
    // Drop the readdir method to simulate an older adapter implementation.
    const ioWithoutReaddir = {
      read: baseIO.read,
      write: baseIO.write,
      mkdirp: baseIO.mkdirp,
    };
    const store = new PlanStore({ workDir: '/w', fileIO: ioWithoutReaddir });
    await store.save(seed('p'));
    expect(await store.listPlans()).toEqual([]);
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
