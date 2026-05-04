import type {
  AudioTechnicalMetrics,
  IssueSeverity,
  QualityIssue,
  QualityIssueCategory,
  RemediationAction,
  VideoTechnicalMetrics,
} from './qa-types';

// P0 ownership: these contracts remain in @neko/agent validation because the
// current consumers are Agent feedback and validation paths. Promote to
// @neko/shared only when neko-cut or another package consumes them directly.

const STYLE_DRIFT_COLOR_POP_THRESHOLD = 40;

export type BasicQualityIssueCategory =
  | 'tearing'
  | 'flicker'
  | 'stutter'
  | 'blur'
  | 'compression'
  | 'exposure'
  | 'color-shift'
  | 'audio-clipping'
  | 'loudness-off'
  | 'subtitle-misaligned';

export interface QualityEvidenceTimeRange {
  readonly start: number;
  readonly end: number;
}

export interface QualityEvidenceRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface QualityEvidenceLocation {
  readonly sceneIndex?: number;
  readonly timeRange?: QualityEvidenceTimeRange;
  readonly frameRange?: QualityEvidenceTimeRange;
  readonly region?: QualityEvidenceRegion;
}

export interface QualityEvidenceSource {
  readonly toolName: 'QualityCheck' | 'QualityCheckConsistency' | string;
  readonly sourceCategory?: string;
  readonly sceneIndex?: number;
  readonly sourceIssueId?: string;
  readonly sourceTimeRange?: QualityEvidenceTimeRange;
  readonly toolCallId?: string;
  readonly runId?: string;
}

export interface BasicQualityIssue {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly category: BasicQualityIssueCategory;
  readonly severity: IssueSeverity;
  readonly metrics: Readonly<Record<string, number>>;
  readonly source: QualityEvidenceSource;
  readonly location?: QualityEvidenceLocation;
  readonly evidenceIds: readonly string[];
  readonly suggestedFixes: readonly string[];
}

export interface QualityIssueNormalizationDiagnostic {
  readonly sourceCategory: string;
  readonly sceneIndex?: number;
  readonly reason:
    | 'semantic-category'
    | 'missing-time-range'
    | 'missing-adjacent-reference'
    | 'non-adjacent-scenes'
    | 'ambiguous-artifact'
    | 'ambiguous-color-distortion'
    | 'ambiguous-jitter'
    | 'unsupported-category';
  readonly description?: string;
}

export interface QualityEvidenceValidationError {
  readonly path: string;
  readonly code: 'invalid-time-range' | 'missing-evidence' | 'invalid-category' | 'invalid-source';
  readonly message: string;
}

export interface QualityEvidenceValidationResult {
  readonly valid: boolean;
  readonly errors: readonly QualityEvidenceValidationError[];
}

export interface NormalizedQualityEvidence {
  readonly issues: readonly BasicQualityIssue[];
  readonly sourceIssues: readonly NormalizedQualitySourceIssue[];
  readonly diagnostics: readonly QualityIssueNormalizationDiagnostic[];
}

export interface NormalizedQualitySourceIssue {
  readonly sceneIndex: number;
  readonly category: QualityIssueCategory;
  readonly severity: IssueSeverity;
  readonly description: string;
  readonly sourceIssueId?: string;
  readonly sourceTimeRange?: QualityEvidenceTimeRange;
  readonly mappedIssueId?: string;
}

export interface QualityEvaluationForNormalization {
  readonly index: number;
  readonly finalScore: number;
  readonly passed: boolean;
  readonly issues?: readonly QualityIssue[];
  readonly remediations?: readonly RemediationAction[] | readonly unknown[];
  readonly timeRange?: QualityEvidenceTimeRange;
  readonly audioMetrics?: AudioTechnicalMetrics;
  readonly videoMetrics?: VideoTechnicalMetrics;
}

export interface QualityReviewPayloadForNormalization {
  readonly evaluations: readonly QualityEvaluationForNormalization[];
}

export interface QualityReviewNormalizationInput {
  readonly payload: QualityReviewPayloadForNormalization;
  readonly evidenceId: string;
  readonly toolName: 'QualityCheck' | 'QualityCheckConsistency' | string;
  readonly toolCallId?: string;
  readonly runId?: string;
  readonly sceneTimeRanges?: readonly QualityEvidenceSceneTimeRange[];
}

export interface QualityEvidenceSceneTimeRange {
  readonly sceneIndex: number;
  readonly timeRange: QualityEvidenceTimeRange;
}

export interface QualityStyleDriftForNormalization {
  readonly fromScene: number;
  readonly toScene: number;
  readonly driftScore: number;
  readonly description: string;
}

export interface QualityConsistencyReportForNormalization {
  readonly styleDrift?: readonly QualityStyleDriftForNormalization[];
  readonly recommendations?: readonly string[];
}

export interface QualityContinuityEdgeCandidate {
  readonly id: string;
  readonly fromSceneIndex: number;
  readonly toSceneIndex: number;
  readonly fromTime: number;
  readonly toTime: number;
  readonly visualDelta: number;
  readonly semanticDelta: number;
  readonly emotionDelta: number;
  readonly audioDelta: number;
  readonly rhythmDelta: number;
  readonly issue?: string;
  readonly interpretation: string;
  readonly intentionality: 'likely-intended' | 'likely-accidental' | 'unknown';
  readonly source: QualityEvidenceSource;
  readonly evidenceIds: readonly string[];
}

export interface NormalizedQualityConsistencyEvidence {
  readonly continuityEdgeCandidates: readonly QualityContinuityEdgeCandidate[];
  readonly diagnostics: readonly QualityIssueNormalizationDiagnostic[];
}

export interface QualityConsistencyNormalizationInput {
  readonly report: QualityConsistencyReportForNormalization;
  readonly evidenceId: string;
  readonly toolName: 'QualityCheckConsistency' | string;
  readonly toolCallId?: string;
  readonly runId?: string;
  readonly sceneTimeRanges?: readonly QualityEvidenceSceneTimeRange[];
}

export function normalizeQualityReviewPayload(
  input: QualityReviewNormalizationInput,
): NormalizedQualityEvidence {
  const issues: BasicQualityIssue[] = [];
  const sourceIssues: NormalizedQualitySourceIssue[] = [];
  const diagnostics: QualityIssueNormalizationDiagnostic[] = [];
  const seenIssueIds = new Set<string>();

  for (const evaluation of input.payload.evaluations) {
    for (const issue of evaluation.issues ?? []) {
      const normalized = normalizeQualityIssue({
        issue,
        evaluation,
        evidenceId: input.evidenceId,
        toolName: input.toolName,
        toolCallId: input.toolCallId,
        runId: input.runId,
        sceneTimeRanges: input.sceneTimeRanges,
      });

      sourceIssues.push({
        sceneIndex: evaluation.index,
        category: issue.category,
        severity: issue.severity,
        description: issue.description,
        ...(normalized.sourceIssueId ? { sourceIssueId: normalized.sourceIssueId } : {}),
        ...(normalized.sourceTimeRange ? { sourceTimeRange: normalized.sourceTimeRange } : {}),
        ...(normalized.issue ? { mappedIssueId: normalized.issue.id } : {}),
      });

      if (normalized.issue && !seenIssueIds.has(normalized.issue.id)) {
        issues.push(normalized.issue);
        seenIssueIds.add(normalized.issue.id);
      }
      if (normalized.diagnostic) {
        diagnostics.push(normalized.diagnostic);
      }
    }
  }

  return { issues, sourceIssues, diagnostics };
}

export function normalizeQualityIssue(input: {
  readonly issue: QualityIssue;
  readonly evaluation: QualityEvaluationForNormalization;
  readonly evidenceId: string;
  readonly toolName: 'QualityCheck' | 'QualityCheckConsistency' | string;
  readonly toolCallId?: string;
  readonly runId?: string;
  readonly sceneTimeRanges?: readonly QualityEvidenceSceneTimeRange[];
}): {
  readonly issue?: BasicQualityIssue;
  readonly diagnostic?: QualityIssueNormalizationDiagnostic;
  readonly sourceIssueId?: string;
  readonly sourceTimeRange?: QualityEvidenceTimeRange;
} {
  const sourceIssueId = readSourceIssueId(input.issue, input.evaluation.index);
  const category = mapQualityIssueCategory(input.issue);
  if (!category) {
    return {
      sourceIssueId,
      diagnostic: {
        sourceCategory: input.issue.category,
        sceneIndex: input.evaluation.index,
        reason: diagnosticReasonForUnmappedIssue(input.issue),
        description: input.issue.description,
      },
    };
  }

  const timeRange = resolveIssueTimeRange({
    issue: input.issue,
    evaluation: input.evaluation,
    sceneTimeRanges: input.sceneTimeRanges,
  });
  if (!timeRange) {
    return {
      sourceIssueId,
      diagnostic: {
        sourceCategory: input.issue.category,
        sceneIndex: input.evaluation.index,
        reason: 'missing-time-range',
        description: input.issue.description,
      },
    };
  }

  const source: QualityEvidenceSource = {
    toolName: input.toolName,
    sourceCategory: input.issue.category,
    sceneIndex: input.evaluation.index,
    sourceIssueId,
    sourceTimeRange: timeRange,
    ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
  };

  const location = normalizeIssueLocation(input.issue, input.evaluation.index, timeRange);
  const normalizedIssue: BasicQualityIssue = {
    id: createNormalizedQualityIssueId({
      source,
      category,
      timeRange,
      evidenceId: input.evidenceId,
    }),
    start: timeRange.start,
    end: timeRange.end,
    category,
    severity: input.issue.severity,
    metrics: collectIssueMetrics(input.issue, input.evaluation),
    source,
    ...(location ? { location } : {}),
    evidenceIds: [input.evidenceId],
    suggestedFixes: collectSuggestedFixes(input.evaluation.remediations),
  };

  return { issue: normalizedIssue, sourceIssueId, sourceTimeRange: timeRange };
}

export function normalizeQualityConsistencyPayload(
  input: QualityConsistencyNormalizationInput,
): NormalizedQualityConsistencyEvidence {
  const continuityEdgeCandidates: QualityContinuityEdgeCandidate[] = [];
  const diagnostics: QualityIssueNormalizationDiagnostic[] = [];

  for (const drift of input.report.styleDrift ?? []) {
    if (!isAdjacentScenePair(drift)) {
      diagnostics.push({
        sourceCategory: 'style-drift',
        sceneIndex: drift.fromScene,
        reason: 'non-adjacent-scenes',
        description: drift.description,
      });
      continue;
    }

    const fromRange = findSceneTimeRange(input.sceneTimeRanges, drift.fromScene);
    const toRange = findSceneTimeRange(input.sceneTimeRanges, drift.toScene);
    if (!fromRange || !toRange) {
      diagnostics.push({
        sourceCategory: 'style-drift',
        sceneIndex: drift.fromScene,
        reason: 'missing-adjacent-reference',
        description: drift.description,
      });
      continue;
    }

    const sourceIssueId = `style-drift:${drift.fromScene}->${drift.toScene}`;
    const source: QualityEvidenceSource = {
      toolName: input.toolName,
      sourceCategory: 'style-drift',
      sceneIndex: drift.fromScene,
      sourceIssueId,
      sourceTimeRange: { start: fromRange.end, end: toRange.start },
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
    };
    const issue = drift.driftScore > STYLE_DRIFT_COLOR_POP_THRESHOLD ? 'color-pop' : undefined;
    continuityEdgeCandidates.push({
      id: createContinuityEdgeId({
        evidenceIds: [input.evidenceId],
        fromTime: fromRange.end,
        toTime: toRange.start,
        ...(issue ? { issue } : {}),
      }),
      fromSceneIndex: drift.fromScene,
      toSceneIndex: drift.toScene,
      fromTime: fromRange.end,
      toTime: toRange.start,
      visualDelta: normalizeScoreDelta(drift.driftScore),
      semanticDelta: 0,
      emotionDelta: 0,
      audioDelta: 0,
      rhythmDelta: 0,
      ...(issue ? { issue } : {}),
      interpretation: drift.description,
      intentionality: 'unknown',
      source,
      evidenceIds: [input.evidenceId],
    });
  }

  return { continuityEdgeCandidates, diagnostics };
}

export function mapQualityIssueCategory(
  issue: Pick<QualityIssue, 'category' | 'description'>,
): BasicQualityIssueCategory | null {
  switch (issue.category) {
    case 'tearing':
      return 'tearing';
    case 'stuttering':
      return 'stutter';
    case 'jitter':
      return describesFlicker(issue.description) ? 'flicker' : null;
    case 'artifact':
      return mapArtifactIssue(issue.description);
    case 'color-distortion':
      return mapColorDistortionIssue(issue.description);
    case 'audio-clipping':
      return 'audio-clipping';
    case 'loudness-off':
      return 'loudness-off';
    default:
      return null;
  }
}

export function createNormalizedQualityIssueId(input: {
  readonly source: QualityEvidenceSource;
  readonly category: BasicQualityIssueCategory;
  readonly timeRange: QualityEvidenceTimeRange;
  readonly evidenceId: string;
}): string {
  return `quality-issue:${stableHashString(
    stableStringify({
      evidenceId: input.evidenceId,
      toolName: input.source.toolName,
      toolCallId: input.source.toolCallId,
      runId: input.source.runId,
      sceneIndex: input.source.sceneIndex,
      sourceCategory: input.source.sourceCategory,
      sourceIssueId: input.source.sourceIssueId,
      category: input.category,
      start: normalizeNumber(input.timeRange.start),
      end: normalizeNumber(input.timeRange.end),
    }),
  )}`;
}

export function validateBasicQualityIssue(
  issue: BasicQualityIssue,
): QualityEvidenceValidationResult {
  const errors: QualityEvidenceValidationError[] = [];
  if (!issue.source.toolName.trim()) {
    errors.push({
      path: 'source.toolName',
      code: 'invalid-source',
      message: 'BasicQualityIssue source.toolName must be non-empty.',
    });
  }
  if (!isValidBasicQualityIssueCategory(issue.category)) {
    errors.push({
      path: 'category',
      code: 'invalid-category',
      message: 'BasicQualityIssue category must be a supported normalized category.',
    });
  }
  if (
    !Number.isFinite(issue.start) ||
    !Number.isFinite(issue.end) ||
    issue.start < 0 ||
    issue.end < issue.start
  ) {
    errors.push({
      path: 'timeRange',
      code: 'invalid-time-range',
      message: 'BasicQualityIssue must have a finite non-negative range with end >= start.',
    });
  }
  if (issue.evidenceIds.length === 0) {
    errors.push({
      path: 'evidenceIds',
      code: 'missing-evidence',
      message: 'BasicQualityIssue requires at least one evidence id.',
    });
  }
  return { valid: errors.length === 0, errors };
}

export function createContinuityEdgeId(input: {
  readonly evidenceIds: readonly string[];
  readonly fromSegmentId?: string;
  readonly toSegmentId?: string;
  readonly fromTime: number;
  readonly toTime: number;
  readonly issue?: string;
}): string {
  return `continuity-edge:${stableHashString(stableStringify(input))}`;
}

export function stableHashString(value: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB ^= code + i;
    hashB = Math.imul(hashB, 0x85ebca6b) >>> 0;
  }
  return `${hashA.toString(36)}-${hashB.toString(36)}-${value.length.toString(36)}`;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

function resolveIssueTimeRange(input: {
  readonly issue: QualityIssue;
  readonly evaluation: QualityEvaluationForNormalization;
  readonly sceneTimeRanges?: readonly QualityEvidenceSceneTimeRange[];
}): QualityEvidenceTimeRange | null {
  const locationCandidate = readTimeRangeFromUnknown(input.issue.location);
  if (locationCandidate) return locationCandidate;
  if (input.evaluation.timeRange) return input.evaluation.timeRange;
  return (
    input.sceneTimeRanges?.find((range) => range.sceneIndex === input.evaluation.index)
      ?.timeRange ?? null
  );
}

function findSceneTimeRange(
  sceneTimeRanges: readonly QualityEvidenceSceneTimeRange[] | undefined,
  sceneIndex: number,
): QualityEvidenceTimeRange | null {
  return sceneTimeRanges?.find((range) => range.sceneIndex === sceneIndex)?.timeRange ?? null;
}

function isAdjacentScenePair(drift: QualityStyleDriftForNormalization): boolean {
  return drift.toScene === drift.fromScene + 1;
}

function normalizeScoreDelta(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score / 100));
}

function readSourceIssueId(issue: QualityIssue, sceneIndex: number): string {
  const location = issue.location as Record<string, unknown> | undefined;
  const explicit = location && location['issueId'];
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return explicit.trim();
  }
  return `scene-${sceneIndex}:${issue.category}:${stableHashString(issue.description)}`;
}

function readTimeRangeFromUnknown(value: unknown): QualityEvidenceTimeRange | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const candidate = record['timeRange'];
  if (typeof candidate !== 'object' || candidate === null) return null;
  const timeRange = candidate as Record<string, unknown>;
  return readTimeRange(timeRange['start'], timeRange['end']);
}

function readTimeRange(start: unknown, end: unknown): QualityEvidenceTimeRange | null {
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

function normalizeIssueLocation(
  issue: QualityIssue,
  sceneIndex: number,
  timeRange: QualityEvidenceTimeRange,
): QualityEvidenceLocation | null {
  const original = issue.location as Record<string, unknown> | undefined;
  const region = original && readRegion(original['region']);
  const frameRange = original && readFrameRange(original['frameRange']);
  return {
    sceneIndex,
    timeRange,
    ...(frameRange ? { frameRange } : {}),
    ...(region ? { region } : {}),
  };
}

function readRegion(value: unknown): QualityEvidenceRegion | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const x = readFiniteNumber(record['x']);
  const y = readFiniteNumber(record['y']);
  const width = readFiniteNumber(record['width'] ?? record['w']);
  const height = readFiniteNumber(record['height'] ?? record['h']);
  if (x === null || y === null || width === null || height === null) return null;
  return { x, y, width, height };
}

function readFrameRange(value: unknown): QualityEvidenceTimeRange | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return readTimeRange(record['start'], record['end']);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function collectIssueMetrics(
  issue: QualityIssue,
  evaluation: QualityEvaluationForNormalization,
): Readonly<Record<string, number>> {
  const metrics: Record<string, number> = {
    finalScore: evaluation.finalScore,
  };
  if (issue.category === 'audio-clipping' || issue.category === 'loudness-off') {
    addMetric(metrics, 'integratedLufs', evaluation.audioMetrics?.integratedLufs);
    addMetric(metrics, 'truePeakDbfs', evaluation.audioMetrics?.truePeakDbfs);
    addMetric(metrics, 'loudnessRange', evaluation.audioMetrics?.loudnessRange);
    addMetric(metrics, 'silenceRatio', evaluation.audioMetrics?.silenceRatio);
  }
  if (
    issue.category === 'tearing' ||
    issue.category === 'jitter' ||
    issue.category === 'stuttering'
  ) {
    addMetric(metrics, 'duration', evaluation.videoMetrics?.duration);
    addMetric(metrics, 'fps', evaluation.videoMetrics?.fps);
    addMetric(metrics, 'framesSampled', evaluation.videoMetrics?.framesSampled);
    addMetric(metrics, 'meanAdjacentSsim', evaluation.videoMetrics?.meanAdjacentSsim);
    addMetric(metrics, 'minAdjacentSsim', evaluation.videoMetrics?.minAdjacentSsim);
    addMetric(metrics, 'meanAdjacentPsnr', evaluation.videoMetrics?.meanAdjacentPsnr);
  }
  return metrics;
}

function addMetric(metrics: Record<string, number>, key: string, value: unknown): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    metrics[key] = value;
  }
}

function collectSuggestedFixes(remediations: readonly unknown[] | undefined): readonly string[] {
  return (remediations ?? [])
    .map(readRemediationText)
    .filter((text): text is string => text !== null);
}

function readRemediationText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['recommendation', 'recommendedNextStep', 'summary', 'description', 'action']) {
    const text = record[key];
    if (typeof text === 'string' && text.trim().length > 0) {
      return text.trim();
    }
  }
  return null;
}

function diagnosticReasonForUnmappedIssue(
  issue: QualityIssue,
): QualityIssueNormalizationDiagnostic['reason'] {
  if (
    issue.category === 'prompt-mismatch' ||
    issue.category === 'script-mismatch' ||
    issue.category === 'style-drift' ||
    issue.category === 'character-inconsistency' ||
    issue.category === 'composition-poor' ||
    issue.category === 'motion-unnatural'
  ) {
    return 'semantic-category';
  }
  if (issue.category === 'artifact') return 'ambiguous-artifact';
  if (issue.category === 'color-distortion') return 'ambiguous-color-distortion';
  if (issue.category === 'jitter') return 'ambiguous-jitter';
  return 'unsupported-category';
}

function describesFlicker(description: string): boolean {
  return /flicker|brightness|luminance|flash|strobe/i.test(description);
}

function mapArtifactIssue(description: string): BasicQualityIssueCategory | null {
  if (/blur|blurry|focus|soft|sharpness|defocus/i.test(description)) return 'blur';
  if (/compression|block|macroblock|jpeg|artifact|banding|codec/i.test(description)) {
    return 'compression';
  }
  return null;
}

function mapColorDistortionIssue(description: string): BasicQualityIssueCategory | null {
  if (
    /exposure|overexposed|underexposed|highlight|shadow|brightness|dark|washed/i.test(description)
  ) {
    return 'exposure';
  }
  if (/color|colour|white balance|tint|saturation|hue|temperature|warm|cool/i.test(description)) {
    return 'color-shift';
  }
  return null;
}

function normalizeNumber(value: number): number {
  return Number(value.toFixed(6));
}

function isValidBasicQualityIssueCategory(value: string): value is BasicQualityIssueCategory {
  return (
    value === 'tearing' ||
    value === 'flicker' ||
    value === 'stutter' ||
    value === 'blur' ||
    value === 'compression' ||
    value === 'exposure' ||
    value === 'color-shift' ||
    value === 'audio-clipping' ||
    value === 'loudness-off' ||
    value === 'subtitle-misaligned'
  );
}
