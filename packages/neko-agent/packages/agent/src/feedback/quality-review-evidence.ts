import type { PerceptionEvidence } from '@neko/shared';
import type {
  AudioTechnicalMetrics,
  QualityIssue,
  VideoTechnicalMetrics,
} from '../validation/qa-types';
import {
  normalizeQualityConsistencyPayload,
  normalizeQualityReviewPayload,
  type QualityConsistencyReportForNormalization,
  type QualityEvidenceSceneTimeRange,
  type QualityEvidenceTimeRange,
} from '../validation/quality-evidence-normalizer';

export interface QualityReviewEvaluationSummary {
  readonly index: number;
  readonly passed: boolean;
  readonly finalScore: number;
  readonly issues?: readonly QualityIssue[];
  readonly remediations?: readonly unknown[];
  readonly timeRange?: QualityEvidenceTimeRange;
  readonly audioMetrics?: AudioTechnicalMetrics;
  readonly videoMetrics?: VideoTechnicalMetrics;
}

export interface QualityReviewRecommendation {
  readonly sceneIndex: number;
  readonly text: string;
  readonly source: 'remediation' | 'suggested-action';
}

export interface QualityReviewFeedbackPayload {
  readonly totalScenes: number;
  readonly passed: number;
  readonly failed: number;
  readonly evaluations: readonly QualityReviewEvaluationSummary[];
}

export interface QualityReviewEvidenceInput {
  readonly payload: QualityReviewFeedbackPayload;
  readonly toolCallId: string;
  readonly toolName: 'QualityCheck' | 'QualityCheckConsistency';
  readonly observedAt: number;
  readonly runId?: string;
  readonly observationId?: string;
  readonly sceneTimeRanges?: readonly QualityEvidenceSceneTimeRange[];
  readonly consistencyReport?: QualityConsistencyReportForNormalization;
}

export interface QualityReviewEvidenceSummary {
  readonly totalScenes: number;
  readonly passed: number;
  readonly failed: number;
  readonly failingSceneIndexes: readonly number[];
  readonly remediationCount: number;
  readonly recommendations: readonly QualityReviewRecommendation[];
}

export interface QualityReviewEvidenceResult {
  readonly evidence: PerceptionEvidence;
  readonly summary: QualityReviewEvidenceSummary;
}

export function createQualityReviewEvidence(
  input: QualityReviewEvidenceInput,
): QualityReviewEvidenceResult {
  const evidenceId = createQualityReviewEvidenceId(input);
  const failingSceneIndexes = input.payload.evaluations
    .filter((evaluation) => !evaluation.passed)
    .map((evaluation) => evaluation.index);
  const recommendations = input.payload.evaluations.flatMap(toQualityReviewRecommendations);
  const remediationCount = recommendations.length;
  const normalizedReview = normalizeQualityReviewPayload({
    payload: input.payload,
    evidenceId,
    toolName: input.toolName,
    toolCallId: input.toolCallId,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.sceneTimeRanges ? { sceneTimeRanges: input.sceneTimeRanges } : {}),
  });
  const normalizedConsistency =
    input.consistencyReport !== undefined
      ? normalizeQualityConsistencyPayload({
          report: input.consistencyReport,
          evidenceId,
          toolName: input.toolName,
          toolCallId: input.toolCallId,
          ...(input.runId ? { runId: input.runId } : {}),
          ...(input.sceneTimeRanges ? { sceneTimeRanges: input.sceneTimeRanges } : {}),
        })
      : null;
  const summary: QualityReviewEvidenceSummary = {
    totalScenes: input.payload.totalScenes,
    passed: input.payload.passed,
    failed: input.payload.failed,
    failingSceneIndexes,
    remediationCount,
    recommendations,
  };

  return {
    summary,
    evidence: {
      id: evidenceId,
      source: 'tool',
      summary: formatQualityReviewEvidenceSummary(summary),
      confidence: calculateQualityReviewConfidence(summary),
      toolName: input.toolName,
      ...(input.observationId ? { observationId: input.observationId } : {}),
      data: {
        kind: 'quality-review',
        toolCallId: input.toolCallId,
        runId: input.runId,
        totalScenes: summary.totalScenes,
        passed: summary.passed,
        failed: summary.failed,
        failingSceneIndexes: summary.failingSceneIndexes,
        remediationCount: summary.remediationCount,
        recommendations: summary.recommendations,
        ...createNormalizedQualityEvidenceData(normalizedReview, normalizedConsistency),
      },
      createdAt: input.observedAt,
      status: 'active',
    },
  };
}

function createNormalizedQualityEvidenceData(
  review: ReturnType<typeof normalizeQualityReviewPayload>,
  consistency: ReturnType<typeof normalizeQualityConsistencyPayload> | null,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (review.issues.length > 0) {
    data['normalizedIssueIds'] = review.issues.map((issue) => issue.id);
    data['normalizedIssues'] = review.issues;
  }
  if (review.sourceIssues.length > 0) {
    data['sourceIssues'] = review.sourceIssues;
  }

  const diagnostics = [...review.diagnostics, ...(consistency?.diagnostics ?? [])];
  if (diagnostics.length > 0) {
    data['normalizationDiagnostics'] = diagnostics;
  }

  if (consistency && consistency.continuityEdgeCandidates.length > 0) {
    data['continuityEdgeCandidateIds'] = consistency.continuityEdgeCandidates.map(
      (edge) => edge.id,
    );
    data['continuityEdgeCandidates'] = consistency.continuityEdgeCandidates;
  }

  return data;
}

function toQualityReviewRecommendations(
  evaluation: QualityReviewEvaluationSummary,
): readonly QualityReviewRecommendation[] {
  return (evaluation.remediations ?? [])
    .map((remediation) => formatQualityReviewRecommendation(remediation))
    .filter((text): text is string => text !== null)
    .map((text) => ({
      sceneIndex: evaluation.index,
      text,
      source: 'remediation' as const,
    }));
}

function formatQualityReviewRecommendation(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  for (const key of ['recommendation', 'recommendedNextStep', 'summary', 'description', 'action']) {
    const text = candidate[key];
    if (typeof text === 'string' && text.trim().length > 0) {
      return text.trim();
    }
  }

  return JSON.stringify(candidate);
}

function createQualityReviewEvidenceId(input: QualityReviewEvidenceInput): string {
  return `quality-review:${input.runId ?? 'runless'}:${input.toolCallId}`;
}

function formatQualityReviewEvidenceSummary(summary: QualityReviewEvidenceSummary): string {
  if (summary.failed === 0) {
    return `QualityReview passed ${summary.passed}/${summary.totalScenes} scene(s).`;
  }

  return (
    `QualityReview failed ${summary.failed}/${summary.totalScenes} scene(s): ` +
    `scene(s) ${summary.failingSceneIndexes.join(', ')}; ` +
    `${summary.remediationCount} remediation hint(s) available.`
  );
}

function calculateQualityReviewConfidence(summary: QualityReviewEvidenceSummary): number {
  if (summary.totalScenes <= 0) {
    return 0;
  }
  return summary.passed / summary.totalScenes;
}
