/**
 * QualityGateApprovalAdapter tests
 *
 * Covers:
 * - verdict derivation at threshold boundaries
 * - pass report → auto-accept via execution pack
 * - fail report → auto-reject via execution pack
 * - warn report → escalate via execution pack
 * - custom thresholds override the default split
 * - engine throw → safe 'escalate' fallback
 * - request payload carries verdict/score/stageName
 */

import { describe, it, expect, vi } from 'vitest';
import { createApprovalEngine } from '../approval-engine';
import { imperativeStrategyPack } from '../strategies/imperative-strategy-pack';
import {
  createQualityGateApprovalAdapter,
  verdictFromReport,
  DEFAULT_QUALITY_GATE_THRESHOLDS,
} from '../adapters/quality-gate-approval-adapter';
import type { ConsistencyReport } from '../../workflow/qa-types';

function report(overallConsistency: number): ConsistencyReport {
  return {
    overallConsistency,
    styleDrift: [],
    characterConsistency: [],
    aestheticScore: overallConsistency,
    recommendations: [],
  };
}

describe('verdictFromReport', () => {
  it('defaults: >=80 pass, >=60 warn, <60 fail', () => {
    expect(verdictFromReport(report(100))).toBe('pass');
    expect(verdictFromReport(report(80))).toBe('pass');
    expect(verdictFromReport(report(79.9))).toBe('warn');
    expect(verdictFromReport(report(60))).toBe('warn');
    expect(verdictFromReport(report(59.9))).toBe('fail');
    expect(verdictFromReport(report(0))).toBe('fail');
  });

  it('custom thresholds override the default split', () => {
    expect(verdictFromReport(report(70), { passThreshold: 90, warnThreshold: 50 })).toBe('warn');
    expect(verdictFromReport(report(45), { passThreshold: 90, warnThreshold: 50 })).toBe('fail');
  });

  it('out-of-range thresholds are clamped to 0-100', () => {
    // passThreshold=999 clamps to 100 → only perfect scores pass.
    expect(verdictFromReport(report(100), { passThreshold: 999 })).toBe('pass');
    expect(verdictFromReport(report(85), { passThreshold: 999 })).toBe('warn');
    // warnThreshold=-1 clamps to 0 → nothing ever reaches 'fail'.
    expect(verdictFromReport(report(50), { warnThreshold: -1 })).toBe('warn');
    expect(verdictFromReport(report(0), { warnThreshold: -1 })).toBe('warn');
  });

  it('default thresholds exported for external overrides', () => {
    expect(DEFAULT_QUALITY_GATE_THRESHOLDS.passThreshold).toBe(80);
    expect(DEFAULT_QUALITY_GATE_THRESHOLDS.warnThreshold).toBe(60);
  });
});

describe('QualityGateApprovalAdapter', () => {
  function buildAdapter() {
    const engine = createApprovalEngine({ strategyPacks: [imperativeStrategyPack] });
    return createQualityGateApprovalAdapter({
      engine,
    });
  }

  it('pass report → auto-accept via execution strategy pack', async () => {
    const evaluate = buildAdapter();
    const response = await evaluate({
      runId: 'run-1',
      stageName: 'qualityGate',
      report: report(95),
    });
    expect(response.resolution).toBe('auto-accept');
    expect(response.reason).toBe('quality-pass');
  });

  it('fail report → auto-reject via execution strategy pack', async () => {
    const evaluate = buildAdapter();
    const response = await evaluate({
      runId: 'run-1',
      stageName: 'qualityGate',
      report: report(30),
    });
    expect(response.resolution).toBe('auto-reject');
    expect(response.reason).toBe('quality-fail');
  });

  it('warn report → escalate for user review', async () => {
    const evaluate = buildAdapter();
    const response = await evaluate({
      runId: 'run-1',
      stageName: 'qualityGate',
      report: report(70),
    });
    expect(response.resolution).toBe('escalate');
    expect(response.reason).toBe('quality-warn');
  });

  it('engine throw → safe escalate fallback (never auto-reject silently)', async () => {
    const engine = {
      register: vi.fn(),
      setUserPrompt: vi.fn(),
      evaluate: async () => {
        throw new Error('engine boom');
      },
    } as unknown as ReturnType<typeof createApprovalEngine>;
    const evaluate = createQualityGateApprovalAdapter({
      engine,
    });
    const response = await evaluate({ report: report(95) });
    expect(response.resolution).toBe('escalate');
    expect(response.reason).toBe('engine-error');
  });

  it('request payload carries verdict + scores + stage name', async () => {
    const calls: Array<Parameters<ReturnType<typeof createApprovalEngine>['evaluate']>> = [];
    const engine = createApprovalEngine();
    const orig = engine.evaluate.bind(engine);
    engine.evaluate = async (req) => {
      calls.push([req]);
      return orig(req);
    };
    const evaluate = createQualityGateApprovalAdapter({
      engine,
    });
    await evaluate({ runId: 'run-1', stageName: 'qualityGate', report: report(75) });
    const [req] = calls[0]!;
    expect(req.channel).toBe('quality-gate');
    expect(req.paradigm).toBe('imperative');
    expect(req.subject.kind).toBe('quality:qualityGate');
    expect(req.context?.verdict).toBe('warn');
    expect(req.context?.overallConsistency).toBe(75);
    expect(req.id).toBe('quality:qualityGate:run-1');
  });

  it('custom thresholds applied to the adapter', async () => {
    const engine = createApprovalEngine({ strategyPacks: [imperativeStrategyPack] });
    const evaluate = createQualityGateApprovalAdapter({
      engine,
      thresholds: { passThreshold: 50, warnThreshold: 20 },
    });
    const response = await evaluate({ report: report(60) });
    expect(response.resolution).toBe('auto-accept');
  });
});
