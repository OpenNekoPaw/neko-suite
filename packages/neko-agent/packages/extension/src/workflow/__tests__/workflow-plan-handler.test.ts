/**
 * WorkflowPlanHandler tests.
 *
 * Focus: the interactive flow — presentAndDispatch posts a preview, handleIncoming
 * resolves the pending promise, override recurses, abort unwinds without dispatch.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WorkflowPlanHandler } from '../workflow-plan-handler';
import type { Orchestrator } from '../orchestrator-bootstrap';
import { Workflow } from '@neko/platform';

// =============================================================================
// Fixtures
// =============================================================================

function buildRoute(level: Workflow.RouteLevel): Workflow.Route {
  return {
    level,
    flowId: 'flowA',
    entryExtension: 'agent',
    skipStages: [],
    reason: `test-${level}`,
    confidence: 0.92,
    provenance: 'rules',
  };
}

function buildPlan(
  id: string,
  route: Workflow.Route,
  overrides: Partial<Workflow.LitePlan> = {},
): Workflow.LitePlan {
  return {
    id,
    createdAt: 100,
    status: 'pending',
    route,
    stages: [],
    ...overrides,
  };
}

function makeOrchestrator(opts: {
  planFactory: (level: Workflow.RouteLevel) => Workflow.LitePlan;
}): Orchestrator & {
  startRoutedPipeline: ReturnType<typeof vi.fn>;
  buildPlan: ReturnType<typeof vi.fn>;
} {
  const startRoutedPipeline = vi.fn(
    async ({
      routerOverrides,
    }: {
      routerOverrides?: Workflow.RouterOverrides;
    } = {}) => {
      const level = routerOverrides?.forceLevel ?? 'L2';
      const route = buildRoute(level);
      const plan = opts.planFactory(level);
      return {
        route,
        plan,
        handle: {
          id: 'pipe_x',
          flowId: route.flowId,
          confirmGate: () => undefined,
          cancelGate: () => undefined,
          cancel: () => undefined,
          events: (async function* () {})(),
          result: Promise.resolve({} as never),
        } as unknown as Workflow.Route extends infer _U
          ? ReturnType<Orchestrator['startRoutedPipeline']> extends Promise<infer R>
            ? R['handle']
            : never
          : never,
      };
    },
  );

  const buildPlan = vi.fn(
    async (_input: Workflow.RawInput, routerOverrides?: Workflow.RouterOverrides) => {
      const level = routerOverrides?.forceLevel ?? 'L2';
      const route = buildRoute(level);
      return { route, plan: opts.planFactory(level) };
    },
  );

  return {
    router: {} as unknown as Orchestrator['router'],
    assetLibrary: undefined,
    matchingEngine: {} as unknown as Orchestrator['matchingEngine'],
    planBuilder: {} as unknown as Orchestrator['planBuilder'],
    planStore: undefined,
    dispose: () => undefined,
    startRoutedPipeline,
    buildPlan,
  } as unknown as Orchestrator & {
    startRoutedPipeline: ReturnType<typeof vi.fn>;
    buildPlan: ReturnType<typeof vi.fn>;
  };
}

function makeWebview() {
  const posts: unknown[] = [];
  const webview = {
    postMessage: vi.fn((msg: unknown) => {
      posts.push(msg);
      return true;
    }),
  };
  return { webview, posts };
}

/**
 * Flush the microtask queue until a predicate holds or we hit maxTicks.
 * More robust than a fixed number of `await Promise.resolve()` when the code
 * under test has a variable number of `await` points.
 *
 * Predicates can be sync or async. When maxTicks is exhausted, resolves
 * silently (never throws — callers can verify state directly afterwards).
 */
async function flushUntil(
  predicate: () => boolean | Promise<boolean>,
  maxTicks = 50,
): Promise<void> {
  for (let i = 0; i < maxTicks; i++) {
    if (await predicate()) return;
    await Promise.resolve();
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('WorkflowPlanHandler', () => {
  let planCounter: number;
  beforeEach(() => {
    planCounter = 0;
  });

  const makeHandler = () => {
    const { webview, posts } = makeWebview();
    const planFactory = (level: Workflow.RouteLevel) =>
      buildPlan(`plan_${++planCounter}`, buildRoute(level));
    const orchestrator = makeOrchestrator({ planFactory });
    const handler = new WorkflowPlanHandler({
      orchestrator,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getWebview: () => webview as any,
    });
    return { handler, orchestrator, webview, posts };
  };

  it('posts a preview and waits for decision', async () => {
    const { handler, posts } = makeHandler();
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });

    await Promise.resolve(); // let microtasks flush
    await Promise.resolve();

    const preview = posts.find((m) => (m as { type: string }).type === 'workflow/planPreview');
    expect(preview).toBeDefined();

    // Approve and wait for dispatch
    handler.handleIncoming({ type: 'workflow/planApprove', planId: 'plan_1' });
    const result = await promise;
    expect(result.result?.handle.id).toBe('pipe_x');
    expect(result.route.level).toBe('L2');
  });

  it('override re-runs with forced level', async () => {
    const { handler, posts } = makeHandler();
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });

    // Wait for the initial preview to be posted
    await flushUntil(
      () => posts.some((m) => (m as { type: string }).type === 'workflow/planPreview'),
      50,
    );

    handler.handleIncoming({
      type: 'workflow/planOverride',
      planId: 'plan_1',
      forceLevel: 'L0',
    });

    // Wait for the second preview (post-override)
    await flushUntil(
      () =>
        posts.filter((m) => (m as { type: string }).type === 'workflow/planPreview').length >= 2,
      50,
    );

    handler.handleIncoming({ type: 'workflow/planApprove', planId: 'plan_2' });
    const result = await promise;
    expect(result.route.level).toBe('L0');
  });

  it('abort resolves without dispatch', async () => {
    const { handler, orchestrator, posts } = makeHandler();
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });
    await Promise.resolve();
    await Promise.resolve();

    handler.handleIncoming({ type: 'workflow/planAbort', planId: 'plan_1' });
    const result = await promise;
    expect(result.result).toBeUndefined();
    expect(orchestrator.startRoutedPipeline).not.toHaveBeenCalled();

    // Status message posted
    const status = posts.find((m) => (m as { type: string }).type === 'workflow/planStatus');
    expect(status).toBeDefined();
  });

  it('handleIncoming returns false for unknown plan ids', () => {
    const { handler } = makeHandler();
    const result = handler.handleIncoming({
      type: 'workflow/planApprove',
      planId: 'no_such_plan',
    });
    expect(result).toBe(false);
  });

  it('auto-approves when confidence clears threshold', async () => {
    const { handler, orchestrator, posts } = makeHandler();
    const result = await handler.presentAndDispatch({
      input: { kind: 'prompt', text: 'hi' },
      autoApproveThreshold: 0.5,
    });
    expect(result.result?.handle.id).toBe('pipe_x');
    expect(orchestrator.startRoutedPipeline).toHaveBeenCalledOnce();
    // No preview was posted because auto-approved
    const preview = posts.find((m) => (m as { type: string }).type === 'workflow/planPreview');
    expect(preview).toBeUndefined();
  });
});

// =============================================================================
// P2.4 — PlanStore integration
// =============================================================================

describe('WorkflowPlanHandler — PlanStore lifecycle', () => {
  const makeHandlerWithStore = () => {
    const planFactory = (level: Workflow.RouteLevel) => ({
      id: `plan_stored_${level}`,
      createdAt: 100,
      status: 'pending' as const,
      route: buildRoute(level),
      stages: [],
    });
    const orchestrator = makeOrchestrator({ planFactory });
    const fileIO = Workflow.createMemoryFileIO();
    const planStore = new Workflow.PlanStore({ workDir: '/w', fileIO });
    const webview = { postMessage: vi.fn(() => true) };
    const handler = new WorkflowPlanHandler({
      orchestrator,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getWebview: () => webview as any,
      planStore,
    });
    return { handler, planStore, fileIO, orchestrator };
  };

  it('persists initial plan as pending', async () => {
    const { handler, planStore } = makeHandlerWithStore();
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });
    await flushUntil(() => false, 10);

    const stored = await planStore.load('plan_stored_L2');
    expect(stored?.status).toBe('pending');
    expect(stored?.statusHistory).toHaveLength(1);

    // Clean up pending promise
    handler.handleIncoming({ type: 'workflow/planAbort', planId: 'plan_stored_L2' });
    await promise;
  });

  it('walks pending → approved → executing on approve', async () => {
    const { handler, planStore } = makeHandlerWithStore();
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });
    await flushUntil(() => false, 10);

    handler.handleIncoming({ type: 'workflow/planApprove', planId: 'plan_stored_L2' });
    await promise;

    const stored = await planStore.load('plan_stored_L2');
    expect(stored?.status).toBe('executing');
    expect(stored?.pipelineId).toBe('pipe_x');
    const statuses = stored?.statusHistory.map((e) => e.status);
    expect(statuses).toEqual(['pending', 'approved', 'executing']);
  });

  it('transitions to aborted on user abort', async () => {
    const { handler, planStore } = makeHandlerWithStore();
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });
    await flushUntil(() => false, 10);
    handler.handleIncoming({ type: 'workflow/planAbort', planId: 'plan_stored_L2' });
    await promise;
    const stored = await planStore.load('plan_stored_L2');
    expect(stored?.status).toBe('aborted');
  });

  it('transitions to edited on override (and the new plan persists as pending)', async () => {
    const { handler, planStore } = makeHandlerWithStore();
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });

    // Wait until the initial L2 plan exists on disk
    await flushUntil(() => planStore.exists('plan_stored_L2'), 50);
    handler.handleIncoming({
      type: 'workflow/planOverride',
      planId: 'plan_stored_L2',
      forceLevel: 'L0',
    });

    // Wait for the recursive L0 plan to be persisted
    await flushUntil(() => planStore.exists('plan_stored_L0'), 50);
    handler.handleIncoming({ type: 'workflow/planApprove', planId: 'plan_stored_L0' });
    await promise;

    const original = await planStore.load('plan_stored_L2');
    expect(original?.status).toBe('edited');
    const fresh = await planStore.load('plan_stored_L0');
    expect(fresh?.status).toBe('executing');
  });

  it('loadPersistedPlan echoes a persisted plan', async () => {
    const { handler, planStore } = makeHandlerWithStore();
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });
    await flushUntil(() => false, 10);

    const loaded = await handler.loadPersistedPlan('plan_stored_L2');
    expect(loaded?.id).toBe('plan_stored_L2');

    handler.handleIncoming({ type: 'workflow/planAbort', planId: 'plan_stored_L2' });
    await promise;
    expect(await planStore.load('plan_stored_L2')).toBeDefined();
  });

  it('handleEditBinding replaces primary with an alternative and posts planUpdated', async () => {
    // Build an orchestrator that returns a plan WITH shots + alternatives
    const casual: Workflow.BindingCandidate = {
      slot: 'character',
      entityId: 'alice',
      assetId: 'casual',
      provenance: 'L1',
      confidence: 0.95,
    };
    const formal: Workflow.BindingCandidate = {
      slot: 'character',
      entityId: 'alice',
      assetId: 'formal',
      provenance: 'L2',
      confidence: 0.85,
    };
    const planFactory = (level: Workflow.RouteLevel): Workflow.LitePlan => ({
      id: `plan_edit_${level}`,
      createdAt: 100,
      status: 'pending',
      route: buildRoute(level),
      stages: [],
      shots: [
        {
          shotId: 's1',
          primary: { character: casual },
          alternatives: { character: [formal] },
          unmatched: [],
        },
      ],
    });
    const orchestrator = makeOrchestrator({ planFactory });
    // Inject a real checker so violations re-compute
    (
      orchestrator as unknown as { consistencyChecker: Workflow.ConsistencyChecker }
    ).consistencyChecker = Workflow.createConsistencyChecker();
    const fileIO = Workflow.createMemoryFileIO();
    const planStore = new Workflow.PlanStore({ workDir: '/w', fileIO });
    const posts: unknown[] = [];
    const webview = {
      postMessage: vi.fn((m: unknown) => {
        posts.push(m);
        return true;
      }),
    };
    const handler = new WorkflowPlanHandler({
      orchestrator,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getWebview: () => webview as any,
      planStore,
    });
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });
    await flushUntil(() => planStore.exists('plan_edit_L2'), 50);

    const updated = await handler.handleEditBinding({
      type: 'workflow/planEditBinding',
      planId: 'plan_edit_L2',
      shotId: 's1',
      slot: 'character',
      assetId: 'formal',
    });
    expect(updated?.shots?.[0]?.primary.character?.assetId).toBe('formal');

    // Webview received a workflow/planUpdated broadcast
    expect(posts.some((p) => (p as { type: string }).type === 'workflow/planUpdated')).toBe(true);

    // Persisted plan also reflects the edit
    const reloaded = await planStore.load('plan_edit_L2');
    expect(reloaded?.shots?.[0]?.primary.character?.assetId).toBe('formal');

    handler.handleIncoming({ type: 'workflow/planAbort', planId: 'plan_edit_L2' });
    await promise;
  });

  it('handleEditBinding is a no-op when the plan is no longer pending', async () => {
    const planFactory = (level: Workflow.RouteLevel): Workflow.LitePlan => ({
      id: `plan_gone_${level}`,
      createdAt: 100,
      status: 'pending',
      route: buildRoute(level),
      stages: [],
    });
    const orchestrator = makeOrchestrator({ planFactory });
    (
      orchestrator as unknown as { consistencyChecker: Workflow.ConsistencyChecker }
    ).consistencyChecker = Workflow.createConsistencyChecker();
    const handler = new WorkflowPlanHandler({
      orchestrator,
      getWebview: () => ({ postMessage: vi.fn(() => true) }) as unknown as never,
    });
    const updated = await handler.handleEditBinding({
      type: 'workflow/planEditBinding',
      planId: 'plan_gone_L2',
      shotId: 's1',
      slot: 'character',
      assetId: 'anything',
    });
    expect(updated).toBeUndefined();
  });

  it('handleApplyToAll propagates to every shot sharing the entity', async () => {
    const casual: Workflow.BindingCandidate = {
      slot: 'character',
      entityId: 'alice',
      assetId: 'casual',
      provenance: 'L1',
      confidence: 0.95,
    };
    const formal: Workflow.BindingCandidate = {
      slot: 'character',
      entityId: 'alice',
      assetId: 'formal',
      provenance: 'L2',
      confidence: 0.85,
    };
    const planFactory = (level: Workflow.RouteLevel): Workflow.LitePlan => ({
      id: `plan_all_${level}`,
      createdAt: 100,
      status: 'pending',
      route: buildRoute(level),
      stages: [],
      shots: [
        {
          shotId: 's1',
          primary: { character: casual },
          alternatives: { character: [formal] },
          unmatched: [],
        },
        {
          shotId: 's2',
          primary: { character: casual },
          alternatives: { character: [formal] },
          unmatched: [],
        },
      ],
    });
    const orchestrator = makeOrchestrator({ planFactory });
    (
      orchestrator as unknown as { consistencyChecker: Workflow.ConsistencyChecker }
    ).consistencyChecker = Workflow.createConsistencyChecker();
    const handler = new WorkflowPlanHandler({
      orchestrator,
      getWebview: () => ({ postMessage: vi.fn(() => true) }) as unknown as never,
    });
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });
    await flushUntil(
      () => (handler as unknown as { pending: Map<string, unknown> }).pending.has('plan_all_L2'),
      50,
    );
    const updated = await handler.handleApplyToAll({
      type: 'workflow/planApplyToAll',
      planId: 'plan_all_L2',
      entityId: 'alice',
      slot: 'character',
      assetId: 'formal',
    });
    expect(updated?.shots?.[0]?.primary.character?.assetId).toBe('formal');
    expect(updated?.shots?.[1]?.primary.character?.assetId).toBe('formal');

    handler.handleIncoming({ type: 'workflow/planAbort', planId: 'plan_all_L2' });
    await promise;
  });

  it('no-op when no planStore configured (falls back to in-memory only)', async () => {
    const planFactory = (level: Workflow.RouteLevel) => ({
      id: `plan_none_${level}`,
      createdAt: 100,
      status: 'pending' as const,
      route: buildRoute(level),
      stages: [],
    });
    const orchestrator = makeOrchestrator({ planFactory });
    const handler = new WorkflowPlanHandler({
      orchestrator,
      getWebview: () => ({ postMessage: vi.fn(() => true) }) as unknown as never,
      // no planStore
    });
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });
    await Promise.resolve();
    await Promise.resolve();
    handler.handleIncoming({ type: 'workflow/planApprove', planId: 'plan_none_L2' });
    const result = await promise;
    expect(result.result?.handle.id).toBe('pipe_x');
    expect(await handler.loadPersistedPlan('plan_none_L2')).toBeUndefined();
  });
});

// =============================================================================
// Phase 2 remainder — checkpoint + fork + diff
// =============================================================================

describe('WorkflowPlanHandler — checkpoint / fork / diff', () => {
  function makeHandlerWithStoreAndStages() {
    const planFactory = (level: Workflow.RouteLevel): Workflow.LitePlan => ({
      id: `plan_cp_${level}`,
      createdAt: 100,
      status: 'pending',
      route: buildRoute(level),
      stages: [
        { id: 'parseStoryboard', label: 'Parse', skipped: false },
        { id: 'generatePrompts', label: 'Prompts', skipped: false },
      ],
    });
    const orchestrator = makeOrchestrator({ planFactory });
    const fileIO = Workflow.createMemoryFileIO();
    const planStore = new Workflow.PlanStore({ workDir: '/w', fileIO });
    const posts: unknown[] = [];
    const webview = {
      postMessage: vi.fn((m: unknown) => {
        posts.push(m);
        return true;
      }),
    };
    const handler = new WorkflowPlanHandler({
      orchestrator,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getWebview: () => webview as any,
      planStore,
    });
    return { handler, planStore, orchestrator, posts, fileIO };
  }

  it('toggleCheckpoint flips the userCheckpoint flag and re-broadcasts', async () => {
    const { handler, planStore, posts } = makeHandlerWithStoreAndStages();
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });
    await flushUntil(() => planStore.exists('plan_cp_L2'), 50);

    const updated = await handler.handleToggleCheckpoint({
      type: 'workflow/planToggleCheckpoint',
      planId: 'plan_cp_L2',
      stageId: 'parseStoryboard',
    });
    expect(updated?.stages.find((s) => s.id === 'parseStoryboard')?.userCheckpoint).toBe(true);
    expect(posts.some((p) => (p as { type: string }).type === 'workflow/planUpdated')).toBe(true);

    const reloaded = await planStore.load('plan_cp_L2');
    expect(reloaded?.stages.find((s) => s.id === 'parseStoryboard')?.userCheckpoint).toBe(true);

    handler.handleIncoming({ type: 'workflow/planAbort', planId: 'plan_cp_L2' });
    await promise;
  });

  it('toggleCheckpoint is a no-op when the plan is no longer pending', async () => {
    const { handler } = makeHandlerWithStoreAndStages();
    const updated = await handler.handleToggleCheckpoint({
      type: 'workflow/planToggleCheckpoint',
      planId: 'plan_cp_missing',
      stageId: 'parseStoryboard',
    });
    expect(updated).toBeUndefined();
  });

  it('fork creates a new plan with parentPlanId and posts a preview', async () => {
    const { handler, planStore, posts } = makeHandlerWithStoreAndStages();
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });
    await flushUntil(() => planStore.exists('plan_cp_L2'), 50);
    // Abort so the source plan ends up in a terminal-ish status (still on disk).
    handler.handleIncoming({ type: 'workflow/planAbort', planId: 'plan_cp_L2' });
    await promise;

    posts.length = 0;
    const fork = await handler.handleFork({
      type: 'workflow/planFork',
      planId: 'plan_cp_L2',
    });
    expect(fork?.parentPlanId).toBe('plan_cp_L2');
    expect(fork?.status).toBe('pending');
    expect(posts.some((p) => (p as { type: string }).type === 'workflow/planPreview')).toBe(true);

    // The fork is persisted.
    const reloaded = await planStore.load(fork!.id);
    expect(reloaded?.parentPlanId).toBe('plan_cp_L2');
  });

  it('fork is a no-op when the source plan is missing', async () => {
    const { handler } = makeHandlerWithStoreAndStages();
    const fork = await handler.handleFork({
      type: 'workflow/planFork',
      planId: 'nope',
    });
    expect(fork).toBeUndefined();
  });

  it('diffRequest posts a diff result for a fork against its parent', async () => {
    const { handler, planStore, posts } = makeHandlerWithStoreAndStages();
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });
    await flushUntil(() => planStore.exists('plan_cp_L2'), 50);
    // Toggle a checkpoint on the source so the fork/source differ structurally.
    await handler.handleToggleCheckpoint({
      type: 'workflow/planToggleCheckpoint',
      planId: 'plan_cp_L2',
      stageId: 'generatePrompts',
      value: true,
    });
    handler.handleIncoming({ type: 'workflow/planAbort', planId: 'plan_cp_L2' });
    await promise;

    const fork = await handler.handleFork({
      type: 'workflow/planFork',
      planId: 'plan_cp_L2',
    });
    // Edit the fork so we see diff entries.
    await handler.handleToggleCheckpoint({
      type: 'workflow/planToggleCheckpoint',
      planId: fork!.id,
      stageId: 'parseStoryboard',
      value: true,
    });
    posts.length = 0;
    const diff = await handler.handleDiffRequest({
      type: 'workflow/planDiffRequest',
      planId: fork!.id,
    });
    expect(diff?.unchanged).toBe(false);
    const diffPost = posts.find((p) => (p as { type: string }).type === 'workflow/planDiff') as
      | { diff?: { unchanged: boolean } }
      | undefined;
    expect(diffPost?.diff?.unchanged).toBe(false);
  });

  it('diffRequest posts an error when the plan is missing', async () => {
    const { handler, posts } = makeHandlerWithStoreAndStages();
    await handler.handleDiffRequest({
      type: 'workflow/planDiffRequest',
      planId: 'nope',
    });
    const diffPost = posts.find((p) => (p as { type: string }).type === 'workflow/planDiff') as
      | { errorMessage?: string; diff?: unknown }
      | undefined;
    expect(diffPost?.errorMessage).toBeDefined();
    expect(diffPost?.diff).toBeUndefined();
  });

  it('listRequest posts a list of persisted plans', async () => {
    const { handler, planStore, posts } = makeHandlerWithStoreAndStages();
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });
    await flushUntil(() => planStore.exists('plan_cp_L2'), 50);
    handler.handleIncoming({ type: 'workflow/planAbort', planId: 'plan_cp_L2' });
    await promise;

    posts.length = 0;
    const entries = await handler.handleListRequest({ type: 'workflow/planListRequest' });
    expect(entries?.length ?? 0).toBeGreaterThan(0);
    const listPost = posts.find((p) => (p as { type: string }).type === 'workflow/planList') as
      | { entries: unknown[]; errorMessage?: string }
      | undefined;
    expect(listPost?.entries.length ?? 0).toBeGreaterThan(0);
    expect(listPost?.errorMessage).toBeUndefined();
  });

  it('listRequest honours status filter', async () => {
    const { handler, planStore } = makeHandlerWithStoreAndStages();
    // Save two distinct plans in different terminal states.
    const basePlan = await (async () => {
      const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'x' } });
      await flushUntil(() => planStore.exists('plan_cp_L2'), 50);
      handler.handleIncoming({ type: 'workflow/planAbort', planId: 'plan_cp_L2' });
      await promise;
    })();
    void basePlan;

    const abortedOnly = await handler.handleListRequest({
      type: 'workflow/planListRequest',
      status: 'aborted',
    });
    expect(abortedOnly?.every((e) => e.status === 'aborted')).toBe(true);

    const pendingOnly = await handler.handleListRequest({
      type: 'workflow/planListRequest',
      status: 'pending',
    });
    expect(pendingOnly?.every((e) => e.status === 'pending')).toBe(true);
  });

  it('listRequest posts errorMessage when no PlanStore is configured', async () => {
    const orchestrator = makeOrchestrator({
      planFactory: (level) => ({
        id: `plan_nostore_${level}`,
        createdAt: 100,
        status: 'pending' as const,
        route: buildRoute(level),
        stages: [],
      }),
    });
    const posts: unknown[] = [];
    const handler = new WorkflowPlanHandler({
      orchestrator,
      getWebview: () =>
        ({
          postMessage: (m: unknown) => {
            posts.push(m);
            return true;
          },
        }) as unknown as never,
    });
    const result = await handler.handleListRequest({ type: 'workflow/planListRequest' });
    expect(result).toBeUndefined();
    const listPost = posts.find((p) => (p as { type: string }).type === 'workflow/planList') as
      | { errorMessage?: string; entries: unknown[] }
      | undefined;
    expect(listPost?.errorMessage).toContain('No PlanStore');
    expect(listPost?.entries).toEqual([]);
  });
});
