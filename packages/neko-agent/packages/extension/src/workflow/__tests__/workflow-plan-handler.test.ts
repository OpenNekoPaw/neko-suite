/**
 * WorkflowPlanHandler tests.
 *
 * Focus: the interactive flow — presentAndDispatch posts a preview, handleIncoming
 * resolves the pending promise, override recurses, abort unwinds without dispatch.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WorkflowPlanHandler } from '../workflow-plan-handler';
import type { Orchestrator } from '../orchestrator-bootstrap';
import type { Workflow } from '@neko/platform';

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
    const { handler } = makeHandler();
    const promise = handler.presentAndDispatch({ input: { kind: 'prompt', text: 'hi' } });
    await Promise.resolve();
    await Promise.resolve();

    // Override to L0 — handler should recurse; a second preview is posted
    handler.handleIncoming({
      type: 'workflow/planOverride',
      planId: 'plan_1',
      forceLevel: 'L0',
    });
    await Promise.resolve();
    await Promise.resolve();
    // Approve the new plan
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
