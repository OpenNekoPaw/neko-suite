import type { PerceptionEvidence } from '@neko/shared';

export interface QualityReviewEvaluationSummary {
  readonly index: number;
  readonly passed: boolean;
  readonly finalScore: number;
  readonly remediations?: readonly unknown[];
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
  const failingSceneIndexes = input.payload.evaluations
    .filter((evaluation) => !evaluation.passed)
    .map((evaluation) => evaluation.index);
  const recommendations = input.payload.evaluations.flatMap(toQualityReviewRecommendations);
  const remediationCount = recommendations.length;
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
      id: createQualityReviewEvidenceId(input),
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
      },
      createdAt: input.observedAt,
      status: 'active',
    },
  };
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
