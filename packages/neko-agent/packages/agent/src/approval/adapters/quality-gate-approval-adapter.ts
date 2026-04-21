/**
 * QualityGate → ApprovalEngine adapter.
 *
 * See: docs/architecture/dual-flow-architecture.md §5
 *      plan v2 P4 (Approval unification — adapter migration)
 *
 * The QualityGate stage produces a `ConsistencyReport` after batch
 * generation. Historically the report was written to
 * `ctx.qualityReport` and the consumer decided what to do with it.
 * This adapter routes the report through the unified ApprovalEngine:
 *
 *   report → verdict ('pass' | 'warn' | 'fail') → engine.evaluate()
 *                                                ↓
 *                  auto-accept / auto-reject / escalate
 *
 * The executionStrategyPack already maps `context.verdict` to
 * resolutions (pass → auto-accept, warn → escalate, fail →
 * auto-reject); this adapter supplies the verdict derivation and
 * request plumbing.
 *
 * Derivation rules (configurable via thresholds):
 *   overallConsistency >= passThreshold  → pass
 *   overallConsistency >= warnThreshold  → warn
 *   otherwise                            → fail
 *
 * Defaults are 80 / 60 (scores are 0-100 per qa-types). Callers with
 * different quality bars can tune via QualityGateAdapterConfig.
 */

import type { IApprovalEngine, ApprovalResponse } from '../index';
import type { ConsistencyReport } from '../../validation/qa-types';
import { getLogger } from '../../utils/logger';

const logger = getLogger('QualityGateApprovalAdapter');

// =============================================================================
// Types
// =============================================================================

export type QualityVerdict = 'pass' | 'warn' | 'fail';

export interface QualityGateThresholds {
  /** >= passThreshold → 'pass'. Default 80. */
  passThreshold?: number;
  /** >= warnThreshold (and below pass) → 'warn'. Default 60. */
  warnThreshold?: number;
}

export const DEFAULT_QUALITY_GATE_THRESHOLDS: Required<QualityGateThresholds> = {
  passThreshold: 80,
  warnThreshold: 60,
};

export interface QualityGateApprovalAdapterDeps {
  /** Engine to consult. */
  engine: IApprovalEngine;
  /** Optional overrides for the verdict thresholds. */
  thresholds?: QualityGateThresholds;
  /** Clock injection. */
  now?: () => number;
}

export interface QualityGateApprovalRequest {
  /** Pipeline run id for correlation. */
  runId?: string;
  /** Stage name the gate was placed in (for telemetry). */
  stageName?: string;
  /** The consistency report produced by the stage. */
  report: ConsistencyReport;
}

// =============================================================================
// Verdict derivation
// =============================================================================

export function verdictFromReport(
  report: ConsistencyReport,
  thresholds: QualityGateThresholds = {},
): QualityVerdict {
  const merged = { ...DEFAULT_QUALITY_GATE_THRESHOLDS, ...thresholds };
  // Clamp thresholds to the 0-100 domain so misconfig doesn't silently
  // promote every report to 'fail'.
  const pass = Math.max(0, Math.min(100, merged.passThreshold));
  const warn = Math.max(0, Math.min(100, merged.warnThreshold));
  const score = report.overallConsistency;
  if (score >= pass) return 'pass';
  if (score >= warn) return 'warn';
  return 'fail';
}

// =============================================================================
// Adapter
// =============================================================================

/**
 * Build a function that evaluates a QualityGate report via the engine.
 * The returned function mirrors the shape the QualityGate stage would
 * call on a consumer — it returns the engine's full response so the
 * caller can surface reason/note to UI.
 */
export function createQualityGateApprovalAdapter(
  deps: QualityGateApprovalAdapterDeps,
): (request: QualityGateApprovalRequest) => Promise<ApprovalResponse> {
  const clock = deps.now ?? (() => Date.now());

  return async function evaluateQualityGate(
    request: QualityGateApprovalRequest,
  ): Promise<ApprovalResponse> {
    const verdict = verdictFromReport(request.report, deps.thresholds);
    const requestId =
      request.runId && request.stageName
        ? `quality:${request.stageName}:${request.runId}`
        : `quality:${clock()}`;

    try {
      const response = await deps.engine.evaluate({
        channel: 'quality-gate',
        paradigm: 'imperative',
        subject: {
          label: request.stageName ? `Quality gate: ${request.stageName}` : 'Quality gate',
          kind: `quality:${request.stageName ?? 'unknown'}`,
        },
        context: {
          verdict,
          overallConsistency: request.report.overallConsistency,
          aestheticScore: request.report.aestheticScore,
          recommendations: request.report.recommendations,
        },
        id: requestId,
        at: clock(),
      });
      return response;
    } catch (err) {
      // Engine throw shouldn't crash the stage — default to 'escalate'
      // so a human reviews the report. 'auto-reject' would be silent
      // loss of work.
      logger.warn(`ApprovalEngine threw on quality gate: ${String(err)}`);
      return {
        requestId,
        resolution: 'escalate',
        reason: 'engine-error',
        note: `Engine error: ${String(err)}`,
        decidedAt: clock(),
      };
    }
  };
}
