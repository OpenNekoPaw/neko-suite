/**
 * PlanReviewApprovalAdapter tests
 *
 * Covers:
 * - idempotent (no reviewable issues) plan → creationStrategyPack auto-accepts
 * - plan with reviewable issues → defers to user (no-decision auto-reject path)
 * - engine throw → safe 'escalate' (never silently auto-approve)
 * - request payload carries confidence + level + threshold
 * - custom flow accessor (default is 'creation')
 */

import { describe, it, expect, vi } from 'vitest';
import { createApprovalEngine } from '../approval-engine';
import { creationStrategyPack } from '../strategies/creation-strategy-pack';
import {
  createPlanReviewApprovalAdapter,
  type PlanReviewPlanSummary,
} from '../adapters/plan-review-approval-adapter';

function plan(overrides: Partial<PlanReviewPlanSummary> = {}): PlanReviewPlanSummary {
  return {
    id: 'plan-42',
    confidence: 0.95,
    level: 'L2',
    hasReviewableIssues: false,
    ...overrides,
  };
}

describe('PlanReviewApprovalAdapter', () => {
  it('idempotent + clean plan → creationStrategyPack auto-accepts', async () => {
    const engine = createApprovalEngine({ strategyPacks: [creationStrategyPack] });
    const evaluate = createPlanReviewApprovalAdapter({ engine });
    const response = await evaluate({ plan: plan() });
    expect(response.resolution).toBe('auto-accept');
    expect(response.reason).toBe('preview-only-proposal');
  });

  it('plan with reviewable issues → not idempotent, no auto-accept', async () => {
    const engine = createApprovalEngine({ strategyPacks: [creationStrategyPack] });
    const evaluate = createPlanReviewApprovalAdapter({ engine });
    const response = await evaluate({
      plan: plan({ hasReviewableIssues: true }),
    });
    // Creation pack returns undefined for non-idempotent plans → engine
    // no-decision → auto-reject. Call site then falls through to the
    // interactive review flow (existing PlanReviewSession behaviour).
    expect(response.resolution).toBe('auto-reject');
    expect(response.reason).toBe('no-decision');
  });

  it('engine throw → safe escalate (never silent auto-approve)', async () => {
    const engine = {
      register: vi.fn(),
      setUserPrompt: vi.fn(),
      evaluate: async () => {
        throw new Error('engine boom');
      },
    } as unknown as ReturnType<typeof createApprovalEngine>;
    const evaluate = createPlanReviewApprovalAdapter({ engine });
    const response = await evaluate({ plan: plan() });
    expect(response.resolution).toBe('escalate');
    expect(response.reason).toBe('engine-error');
  });

  it('request payload carries confidence + level + threshold', async () => {
    let captured: unknown;
    const engine = createApprovalEngine();
    const orig = engine.evaluate.bind(engine);
    engine.evaluate = async (req) => {
      captured = req;
      return orig(req);
    };
    const evaluate = createPlanReviewApprovalAdapter({ engine, confidenceThreshold: 0.85 });
    await evaluate({ plan: plan({ confidence: 0.72, level: 'L1' }) });
    const req = captured as {
      channel: string;
      flow: string;
      subject: { kind: string };
      context: Record<string, unknown>;
      id: string;
    };
    expect(req.channel).toBe('proposal-review');
    expect(req.flow).toBe('creation');
    expect(req.subject.kind).toBe('plan:plan-42');
    expect(req.context.confidence).toBe(0.72);
    expect(req.context.level).toBe('L1');
    expect(req.context.confidenceThreshold).toBe(0.85);
    expect(req.id).toBe('plan-review:plan-42');
  });

  it('custom flow accessor respected', async () => {
    let capturedFlow: string | undefined;
    const engine = createApprovalEngine();
    const orig = engine.evaluate.bind(engine);
    engine.evaluate = async (req) => {
      capturedFlow = req.flow;
      return orig(req);
    };
    const evaluate = createPlanReviewApprovalAdapter({
      engine,
      getFlow: () => 'execution',
    });
    await evaluate({ plan: plan() });
    expect(capturedFlow).toBe('execution');
  });

  it('destructive = false and idempotent reflects hasReviewableIssues', async () => {
    let captured: { subject: { destructive?: boolean; idempotent?: boolean } } | undefined;
    const engine = createApprovalEngine();
    const orig = engine.evaluate.bind(engine);
    engine.evaluate = async (req) => {
      captured = req as unknown as typeof captured;
      return orig(req);
    };
    const evaluate = createPlanReviewApprovalAdapter({ engine });

    await evaluate({ plan: plan({ hasReviewableIssues: false }) });
    expect(captured?.subject.destructive).toBe(false);
    expect(captured?.subject.idempotent).toBe(true);

    await evaluate({ plan: plan({ hasReviewableIssues: true }) });
    expect(captured?.subject.destructive).toBe(false);
    expect(captured?.subject.idempotent).toBe(false);
  });
});
