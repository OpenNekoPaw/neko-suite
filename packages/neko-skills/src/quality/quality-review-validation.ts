import type {
  AgentToolResultFeedbackAdapter as AgentToolResultValidationAdapter,
  AgentToolResultFeedbackAdapterInput as AgentToolResultValidationAdapterInput,
  AgentToolReviewFeedbackSignal as AgentToolReviewValidationSignal,
  AudioTechnicalMetrics,
  ConsistencyReport,
  PerceptionEvidence,
  QualityIssue,
  VideoTechnicalMetrics,
} from '@neko/shared';
import {
  CHARACTER_INCONSISTENCY_FAIL_SCORE,
  normalizeQualityConsistencyPayload,
  normalizeQualityReviewPayload,
  type QualityConsistencyReportForNormalization,
  type QualityEvidenceSceneTimeRange,
  type QualityEvidenceTimeRange,
  STYLE_DRIFT_COLOR_POP_THRESHOLD,
} from '@neko/shared';

export interface QualityReviewEvaluationSummary {
  readonly index: number;
  readonly passed: boolean;
  readonly finalScore: number;
  readonly issues?: readonly QualityIssue[];
  readonly remediations?: readonly unknown[];
  readonly timeRange?: QualityEvidenceTimeRange;
  readonly finalPath?: string;
  readonly attempts?: number;
  readonly audioMetrics?: AudioTechnicalMetrics;
  readonly videoMetrics?: VideoTechnicalMetrics;
}

export interface QualityReviewRecommendation {
  readonly sceneIndex: number;
  readonly text: string;
  readonly source: 'remediation' | 'suggested-action';
}

export interface QualityReviewValidationPayload {
  readonly totalScenes: number;
  readonly passed: number;
  readonly failed: number;
  readonly evaluations: readonly QualityReviewEvaluationSummary[];
}

export interface QualityReviewEvidenceInput {
  readonly payload: QualityReviewValidationPayload;
  readonly toolCallId: string;
  readonly toolName: 'QualityCheck' | 'QualityRepairCheck' | 'QualityCheckConsistency';
  readonly mode?: 'analysis' | 'repair' | 'consistency';
  readonly observedAt: number;
  readonly runId?: string;
  readonly observationId?: string;
  readonly sceneTimeRanges?: readonly QualityEvidenceSceneTimeRange[];
  readonly consistencyReport?: QualityConsistencyReportForNormalization;
  readonly adapterDiagnostics?: readonly string[];
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

export function createQualityReviewValidationAdapter(): AgentToolResultValidationAdapter {
  return {
    id: 'quality-review-validation',
    createSignal: createQualityReviewValidationSignal,
  };
}

export function createQualityReviewValidationSignal(
  input: AgentToolResultValidationAdapterInput,
): AgentToolReviewValidationSignal | null {
  const sceneTimeRanges = readSceneTimeRangesFromToolArguments(input.toolArguments);

  if (input.toolName === 'QualityCheck' || input.toolName === 'QualityRepairCheck') {
    if (!isQualityCheckValidationPayload(input.result.data)) {
      return null;
    }

    const mode = input.toolName === 'QualityRepairCheck' ? 'repair' : 'analysis';
    const review = createQualityReviewEvidence({
      payload: input.result.data,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      mode,
      observedAt: input.observedAt,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(sceneTimeRanges.length > 0 ? { sceneTimeRanges } : {}),
    });

    return createToolReviewSignal(input, review, mode);
  }

  if (input.toolName !== 'QualityCheckConsistency' || !isConsistencyReportLike(input.result.data)) {
    return null;
  }

  const { report: consistencyReport, diagnostics: adapterDiagnostics } =
    normalizeConsistencyReportForValidation(input.result.data);
  const payload = createQualityReviewPayloadFromConsistencyReport(
    consistencyReport,
    input.toolArguments,
  );
  const review = createQualityReviewEvidence({
    payload,
    consistencyReport,
    toolCallId: input.toolCallId,
    toolName: 'QualityCheckConsistency',
    mode: 'consistency',
    observedAt: input.observedAt,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(sceneTimeRanges.length > 0 ? { sceneTimeRanges } : {}),
    ...(adapterDiagnostics.length > 0 ? { adapterDiagnostics } : {}),
  });

  return createToolReviewSignal(input, review, 'consistency');
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
      summary: formatQualityReviewEvidenceSummary(summary, input.mode ?? 'analysis'),
      confidence: calculateQualityReviewConfidence(summary),
      toolName: input.toolName,
      ...(input.observationId ? { observationId: input.observationId } : {}),
      data: {
        kind: 'quality-review',
        mode: input.mode ?? 'analysis',
        toolCallId: input.toolCallId,
        runId: input.runId,
        totalScenes: summary.totalScenes,
        passed: summary.passed,
        failed: summary.failed,
        failingSceneIndexes: summary.failingSceneIndexes,
        remediationCount: summary.remediationCount,
        recommendations: summary.recommendations,
        ...(input.adapterDiagnostics && input.adapterDiagnostics.length > 0
          ? { adapterDiagnostics: input.adapterDiagnostics }
          : {}),
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

function createToolReviewSignal(
  input: AgentToolResultValidationAdapterInput,
  review: QualityReviewEvidenceResult,
  mode: NonNullable<QualityReviewEvidenceInput['mode']>,
): AgentToolReviewValidationSignal {
  const status = review.summary.failed > 0 ? 'failed' : 'passed';
  const failingSceneIndexes = [...review.summary.failingSceneIndexes];
  const metadata: Record<string, unknown> = {
    mode,
    totalScenes: review.summary.totalScenes,
    passed: review.summary.passed,
    failed: review.summary.failed,
    failingSceneIndexes,
    remediationCount: review.summary.remediationCount,
  };

  return {
    kind: 'tool-review',
    observedAt: input.observedAt,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    status,
    summary: review.evidence.summary,
    ...(status === 'failed'
      ? {
          repairGuidance: createQualityRepairGuidance(input.toolName, review.summary, mode),
          escalationMessage: createQualityEscalationMessage(input.runId),
          repeatKey: `quality-review:${input.runId ?? 'runless'}:${input.toolName}`,
        }
      : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    evidence: review.evidence,
    metadata,
  };
}

function createQualityRepairGuidance(
  toolName: string,
  summary: QualityReviewEvidenceSummary,
  mode: NonNullable<QualityReviewEvidenceInput['mode']>,
): string {
  const scenes =
    summary.failingSceneIndexes.length > 0 ? summary.failingSceneIndexes.join(', ') : 'unknown';
  if (mode === 'repair') {
    return (
      `Review the quality repair attempt from ${toolName}. ` +
      `Focus on scene(s) ${scenes} and verify ` +
      `${summary.remediationCount} suggested remediation step(s) before any further repair.`
    );
  }

  return (
    'Repair the failing quality-check result. ' +
    `Focus on scene(s) ${scenes} and apply ` +
    `${summary.remediationCount} suggested remediation step(s) as needed.`
  );
}

function createQualityEscalationMessage(runId: string | undefined): string {
  return (
    `Quality check keeps failing for run ${runId ?? 'unknown-run'}. ` +
    'Ask the user whether to accept the current output or revise the target quality bar.'
  );
}

function createQualityReviewEvidenceId(input: QualityReviewEvidenceInput): string {
  return `quality-review:${input.runId ?? 'runless'}:${input.toolCallId}`;
}

function formatQualityReviewEvidenceSummary(
  summary: QualityReviewEvidenceSummary,
  mode: 'analysis' | 'repair' | 'consistency',
): string {
  const label =
    mode === 'repair'
      ? 'QualityRepairReview repair attempt'
      : mode === 'consistency'
        ? 'QualityConsistencyReview'
        : 'QualityReview';
  if (summary.failed === 0) {
    return `${label} passed ${summary.passed}/${summary.totalScenes} scene(s).`;
  }

  return (
    `${label} failed ${summary.failed}/${summary.totalScenes} scene(s): ` +
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

function isQualityCheckValidationPayload(value: unknown): value is QualityReviewValidationPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    isFiniteNumber(candidate['totalScenes']) &&
    isFiniteNumber(candidate['passed']) &&
    isFiniteNumber(candidate['failed']) &&
    Array.isArray(candidate['evaluations']) &&
    candidate['evaluations'].every(isQualityCheckEvaluationSummary)
  );
}

function isQualityCheckEvaluationSummary(value: unknown): value is QualityReviewEvaluationSummary {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    isFiniteNumber(candidate['index']) &&
    typeof candidate['passed'] === 'boolean' &&
    isFiniteNumber(candidate['finalScore']) &&
    (candidate['remediations'] === undefined || Array.isArray(candidate['remediations']))
  );
}

function isConsistencyReportLike(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    isFiniteNumber(value['overallConsistency']) &&
    Array.isArray(value['styleDrift'])
  );
}

function normalizeConsistencyReportForValidation(value: Record<string, unknown>): {
  readonly report: ConsistencyReport;
  readonly diagnostics: readonly string[];
} {
  const diagnostics: string[] = [];
  const overallConsistency =
    typeof value['overallConsistency'] === 'number' ? value['overallConsistency'] : 0;
  const characterConsistency = Array.isArray(value['characterConsistency'])
    ? value['characterConsistency']
    : [];
  if (!Array.isArray(value['characterConsistency'])) {
    diagnostics.push('missing-characterConsistency');
  }

  const aestheticScore = isFiniteNumber(value['aestheticScore']) ? value['aestheticScore'] : 0;
  if (!isFiniteNumber(value['aestheticScore'])) {
    diagnostics.push('missing-aestheticScore');
  }

  const recommendations = Array.isArray(value['recommendations'])
    ? value['recommendations'].filter((entry): entry is string => typeof entry === 'string')
    : [];
  if (!Array.isArray(value['recommendations'])) {
    diagnostics.push('missing-recommendations');
  }

  return {
    report: {
      overallConsistency,
      styleDrift: value['styleDrift'] as ConsistencyReport['styleDrift'],
      characterConsistency: characterConsistency as ConsistencyReport['characterConsistency'],
      aestheticScore,
      recommendations,
    },
    diagnostics,
  };
}

function createQualityReviewPayloadFromConsistencyReport(
  report: ConsistencyReport,
  toolArguments: Record<string, unknown> | undefined,
): QualityReviewValidationPayload {
  const sceneIndexes = readSceneIndexesFromToolArguments(toolArguments);
  const failedSceneIndexes = new Set<number>();
  for (const drift of report.styleDrift) {
    if (drift.driftScore > STYLE_DRIFT_COLOR_POP_THRESHOLD) {
      failedSceneIndexes.add(drift.fromScene);
      failedSceneIndexes.add(drift.toScene);
    }
  }
  for (const character of report.characterConsistency ?? []) {
    for (const appearance of character.appearances) {
      if (appearance.score < CHARACTER_INCONSISTENCY_FAIL_SCORE) {
        failedSceneIndexes.add(appearance.sceneIndex);
      }
    }
  }

  const indexes =
    sceneIndexes.length > 0
      ? sceneIndexes
      : [...failedSceneIndexes].sort((left, right) => left - right);
  const evaluations = indexes.map((index) => ({
    index,
    passed: !failedSceneIndexes.has(index),
    finalScore: report.overallConsistency,
    remediations:
      failedSceneIndexes.has(index) && report.recommendations.length > 0
        ? report.recommendations
        : undefined,
  }));

  const failed = evaluations.filter((evaluation) => !evaluation.passed).length;
  return {
    totalScenes: evaluations.length,
    passed: evaluations.length - failed,
    failed,
    evaluations,
  };
}

function readSceneTimeRangesFromToolArguments(
  toolArguments: Record<string, unknown> | undefined,
): QualityEvidenceSceneTimeRange[] {
  if (!toolArguments) return [];
  const scenes = toolArguments['scenes'];
  if (!Array.isArray(scenes)) return [];

  const ranges: QualityEvidenceSceneTimeRange[] = [];
  for (let index = 0; index < scenes.length; index++) {
    const scene = scenes[index];
    if (!isRecord(scene)) continue;
    const sceneIndex = readSceneIndex(scene, index);
    const timeRange = readToolArgumentTimeRange(scene);
    if (sceneIndex !== null && timeRange) {
      ranges.push({ sceneIndex, timeRange });
    }
  }
  return ranges;
}

function readSceneIndexesFromToolArguments(
  toolArguments: Record<string, unknown> | undefined,
): number[] {
  if (!toolArguments) return [];
  const scenes = toolArguments['scenes'];
  if (!Array.isArray(scenes)) return [];
  return scenes
    .map((scene, index) => (isRecord(scene) ? readSceneIndex(scene, index) : null))
    .filter((sceneIndex): sceneIndex is number => sceneIndex !== null);
}

function readSceneIndex(scene: Record<string, unknown>, defaultIndex: number): number | null {
  const explicit = scene['index'] ?? scene['sceneIndex'];
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return Math.floor(explicit);
  return defaultIndex;
}

function readToolArgumentTimeRange(
  scene: Record<string, unknown>,
): QualityEvidenceTimeRange | null {
  const direct = readTimeRangeLike(scene['timeRange']);
  if (direct) return direct;
  const start = scene['start'] ?? scene['startTime'];
  const end = scene['end'] ?? scene['endTime'];
  const fromScalar = readTimeRangeScalars(start, end);
  if (fromScalar) return fromScalar;
  const duration = scene['duration'];
  if (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0) {
    return { start: 0, end: duration };
  }
  return null;
}

function readTimeRangeLike(value: unknown): QualityEvidenceTimeRange | null {
  if (!isRecord(value)) return null;
  return readTimeRangeScalars(value['start'], value['end']);
}

function readTimeRangeScalars(start: unknown, end: unknown): QualityEvidenceTimeRange | null {
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start
  ) {
    return null;
  }
  return { start, end };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
