/**
 * QualityGate stage tests — including P4 adapter integration.
 *
 * Covers:
 * - disabled by default (no stageParams.qualityGate.enabled): passthrough
 * - enabled but no evaluateConsistency: passthrough
 * - enabled + evaluateConsistency: writes ctx.qualityReport
 * - enabled + evaluateApproval: writes ctx.qualityDecision alongside report
 * - evaluateApproval throw is swallowed — report still written
 * - passes runId through when getRunId is supplied
 */

import { describe, it, expect, vi } from 'vitest';
import { createQualityGateStage } from '../stages/quality-gate';
import type { WorkflowContext, StoryboardScene } from '../types';
import type { ConsistencyReport } from '../qa-types';
import type { ApprovalResponse } from '../../approval';

function sampleReport(score = 85): ConsistencyReport {
  return {
    overallConsistency: score,
    styleDrift: [],
    characterConsistency: [],
    aestheticScore: score,
    recommendations: [],
  };
}

function sampleCtx(): WorkflowContext {
  const scenes: StoryboardScene[] = [
    {
      index: 0,
      heading: 'Scene 1',
      description: 'Opening shot',
      suggestedPrompt: 'wide establishing shot',
    } as StoryboardScene,
    {
      index: 1,
      heading: 'Scene 2',
      description: 'Close up',
      suggestedPrompt: 'close-up on protagonist',
    } as StoryboardScene,
  ];
  return {
    scenes,
    generatedPaths: ['/tmp/a.png', '/tmp/b.png'],
    generationUnit: 'scene',
    stageParams: { qualityGate: { enabled: true } },
  } as WorkflowContext;
}

describe('QualityGate stage', () => {
  it('is a passthrough when stageParams.qualityGate.enabled is false', async () => {
    const evaluateConsistency = vi.fn();
    const stage = createQualityGateStage({ evaluateConsistency });
    const ctx = { ...sampleCtx(), stageParams: {} } as WorkflowContext;
    const out = await stage.execute(ctx);
    expect(out).toBe(ctx);
    expect(evaluateConsistency).not.toHaveBeenCalled();
  });

  it('is a passthrough when no evaluateConsistency is provided', async () => {
    const stage = createQualityGateStage({});
    const ctx = sampleCtx();
    const out = await stage.execute(ctx);
    expect(out).toBe(ctx);
  });

  it('writes ctx.qualityReport when enabled + evaluator present', async () => {
    const report = sampleReport(92);
    const stage = createQualityGateStage({
      evaluateConsistency: async () => report,
    });
    const out = await stage.execute(sampleCtx());
    expect(out.qualityReport).toBe(report);
    expect(out.qualityDecision).toBeUndefined();
  });

  it('writes ctx.qualityDecision when evaluateApproval is supplied', async () => {
    const report = sampleReport(90);
    const decision: ApprovalResponse = {
      requestId: 'quality:qualityGate:run-1',
      resolution: 'auto-accept',
      reason: 'quality-pass',
      decidedAt: 42,
    };
    let captured: { runId?: string; stageName?: string; report?: ConsistencyReport } = {};
    const stage = createQualityGateStage({
      evaluateConsistency: async () => report,
      evaluateApproval: async (req) => {
        captured = req;
        return decision;
      },
      getRunId: () => 'run-1',
    });
    const out = await stage.execute(sampleCtx());
    expect(out.qualityReport).toBe(report);
    expect(out.qualityDecision).toBe(decision);
    expect(captured.runId).toBe('run-1');
    expect(captured.stageName).toBe('qualityGate');
    expect(captured.report).toBe(report);
  });

  it('swallows adapter errors — report still written, decision absent', async () => {
    const report = sampleReport(55);
    const stage = createQualityGateStage({
      evaluateConsistency: async () => report,
      evaluateApproval: async () => {
        throw new Error('adapter boom');
      },
    });
    const out = await stage.execute(sampleCtx());
    expect(out.qualityReport).toBe(report);
    expect(out.qualityDecision).toBeUndefined();
  });

  it('runId is optional; omitted when getRunId is absent', async () => {
    const report = sampleReport();
    let captured: { runId?: string } = {};
    const stage = createQualityGateStage({
      evaluateConsistency: async () => report,
      evaluateApproval: async (req) => {
        captured = req;
        return {
          requestId: 'x',
          resolution: 'escalate' as const,
          reason: 'quality-warn',
          decidedAt: 0,
        };
      },
    });
    await stage.execute(sampleCtx());
    expect(captured.runId).toBeUndefined();
  });
});
