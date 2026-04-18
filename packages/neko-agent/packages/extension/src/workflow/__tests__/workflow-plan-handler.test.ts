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
