import { dirname, join } from 'node:path';
import { isValidProviderId } from '@neko/shared';
import type { FeedbackSignal, ProviderExpressionConceptDecision } from '../feedback';

export interface ProviderCardProjectFsOps {
  mkdir(path: string, opts?: { recursive: boolean }): Promise<void>;
  readFile?(path: string, encoding: 'utf-8'): Promise<string>;
  writeFile(path: string, data: string, encoding: 'utf-8'): Promise<void>;
}

export type ProviderCardProjectReviewMode = 'auto-apply' | 'review-queue';

export interface ProviderCardProjectRouterConfig {
  readonly workspaceRoot: string;
  readonly fsOps: ProviderCardProjectFsOps;
  readonly now?: () => number;
  readonly reviewMode?: ProviderCardProjectReviewMode;
}

export interface ProviderCardObservationPatch {
  readonly providerId: string;
  readonly path: string;
  readonly written: boolean;
  readonly reason:
    | 'agentic-observation'
    | 'fallback-observation'
    | 'native-observation'
    | 'dedup'
    | 'queued-for-review';
}

interface ProviderCardObservationRecord {
  readonly type: 'provider-card-observation';
  readonly mode: 'agentic' | 'fallback' | 'native';
  readonly toolName: string;
  readonly styleFamily?: string;
  readonly reason?: string;
  readonly concepts?: readonly string[];
  readonly conceptDecisions?: readonly ProviderExpressionConceptDecision[];
  readonly observedAt: string;
}

interface MarkdownSectionMatch {
  readonly body: string;
  readonly bodyStart: number;
  readonly bodyEnd: number;
}

const PROJECT_OBSERVATIONS_SECTION = 'Project Observations';
const TRAINING_PROFILE_SECTION = 'Part 3: Training Profile';
const CONCEPT_COVERAGE_SECTION = 'Part 2: Concept Coverage Map';
const UNKNOWN_SUBSECTION = 'Unknown';
const PARTIAL_SUBSECTION = 'Partial';
const ANTI_PATTERNS_SUBSECTION = 'Anti-Patterns';
const ANTI_BIAS_SUBSECTION = 'Anti-Bias Strategies';

export class ProviderCardProjectRouter {
  private readonly _now: () => number;

  constructor(private readonly _config: ProviderCardProjectRouterConfig) {
    this._now = _config.now ?? (() => Date.now());
  }

  async writeObservation(
    signal: Extract<FeedbackSignal, { kind: 'provider-card-observation' }>,
  ): Promise<ProviderCardObservationPatch | null> {
    if (!signal.providerId || !isValidProviderId(signal.providerId)) {
      return null;
    }

    const filePath = join(
      this._config.workspaceRoot,
      '.neko',
      'providers',
      `${signal.providerId}.card.md`,
    );
    const record = toObservationRecord(signal, this._now());
    const existing = await readExisting(this._config.fsOps, filePath);
    if (hasObservation(existing, record)) {
      return {
        providerId: signal.providerId,
        path: filePath,
        written: false,
        reason: 'dedup',
      };
    }

    const targetPath =
      this._config.reviewMode === 'review-queue'
        ? toReviewQueuePath(this._config.workspaceRoot, signal.providerId, record)
        : filePath;
    const next =
      this._config.reviewMode === 'review-queue'
        ? createReviewQueuePatch(signal.providerId, filePath, record)
        : appendObservation(existing, signal.providerId, record);
    await this._config.fsOps.mkdir(dirname(targetPath), { recursive: true });
    await this._config.fsOps.writeFile(targetPath, next, 'utf-8');

    return {
      providerId: signal.providerId,
      path: targetPath,
      written: true,
      reason:
        this._config.reviewMode === 'review-queue'
          ? 'queued-for-review'
          : observationReason(signal.mode),
    };
  }
}

async function readExisting(
  fsOps: ProviderCardProjectFsOps,
  filePath: string,
): Promise<string | null> {
  if (!fsOps.readFile) return null;
  try {
    return await fsOps.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function appendObservation(
  existing: string | null,
  providerId: string,
  record: ProviderCardObservationRecord,
): string {
  const base = existing?.trimEnd() || createProjectOverrideSkeleton(providerId);
  const observationLine = `- ${JSON.stringify(record)}`;
  const withObservation = hasSection(base, PROJECT_OBSERVATIONS_SECTION)
    ? appendLineToSection(base, PROJECT_OBSERVATIONS_SECTION, observationLine)
    : `${base}\n\n## ${PROJECT_OBSERVATIONS_SECTION}\n${observationLine}\n`;

  const withDecisionCoverage = upsertConceptDecisionCoverage(withObservation, record);
  const withConcepts = upsertUnknownConcepts(withDecisionCoverage, record);
  const strategyLine = toAntiBiasStrategyLine(record);
  return strategyLine ? upsertAntiBiasStrategy(withConcepts, strategyLine) : withConcepts;
}

function createProjectOverrideSkeleton(providerId: string): string {
  return `---\nproviderId: ${JSON.stringify(providerId)}\nversion: 0.0.0\ncapabilities: [image.generate]\n---\n# ${providerId} Project Override`;
}

function observationReason(
  mode: ProviderCardObservationRecord['mode'],
): Exclude<ProviderCardObservationPatch['reason'], 'dedup' | 'queued-for-review'> {
  return mode === 'agentic'
    ? 'agentic-observation'
    : mode === 'native'
      ? 'native-observation'
      : 'fallback-observation';
}

function toReviewQueuePath(
  workspaceRoot: string,
  providerId: string,
  record: ProviderCardObservationRecord,
): string {
  return join(
    workspaceRoot,
    '.neko',
    'providers',
    'review',
    `${providerId}-${record.observedAt.replace(/[:.]/g, '-')}.patch.md`,
  );
}

function createReviewQueuePatch(
  providerId: string,
  targetPath: string,
  record: ProviderCardObservationRecord,
): string {
  const candidate = appendObservation(null, providerId, record);
  return [
    '---',
    `providerId: ${JSON.stringify(providerId)}`,
    `targetPath: ${targetPath}`,
    `observedAt: ${record.observedAt}`,
    'status: pending-review',
    '---',
    `# ProviderCard Project Override Review: ${providerId}`,
    '',
    'Apply this patch only after human review. The live ProviderCard is not modified yet.',
    '',
    '```markdown',
    candidate,
    '```',
    '',
  ].join('\n');
}

function toObservationRecord(
  signal: Extract<FeedbackSignal, { kind: 'provider-card-observation' }>,
  observedAt: number,
): ProviderCardObservationRecord {
  return {
    type: 'provider-card-observation',
    mode: signal.mode,
    toolName: signal.toolName,
    ...(signal.styleFamily ? { styleFamily: signal.styleFamily } : {}),
    ...(signal.reason ? { reason: signal.reason } : {}),
    ...(signal.concepts && signal.concepts.length > 0 ? { concepts: signal.concepts } : {}),
    ...(signal.conceptDecisions && signal.conceptDecisions.length > 0
      ? { conceptDecisions: signal.conceptDecisions }
      : {}),
    observedAt: new Date(observedAt).toISOString(),
  };
}

function upsertUnknownConcepts(markdown: string, record: ProviderCardObservationRecord): string {
  const concepts = (record.concepts ?? []).filter(isWritableConcept);
  if (concepts.length === 0) {
    return markdown;
  }

  return concepts.reduce((current, concept) => {
    const line = `- ${concept} → project-observed ${record.styleFamily ?? 'mixed'} concept`;
    if (hasLine(current, line)) {
      return current;
    }
    const withCoverage = hasSection(current, CONCEPT_COVERAGE_SECTION)
      ? current
      : `${current.trimEnd()}\n\n## ${CONCEPT_COVERAGE_SECTION}\n`;
    return hasSubsection(withCoverage, CONCEPT_COVERAGE_SECTION, UNKNOWN_SUBSECTION)
      ? appendLineToSubsection(withCoverage, CONCEPT_COVERAGE_SECTION, UNKNOWN_SUBSECTION, line)
      : appendSubsection(withCoverage, CONCEPT_COVERAGE_SECTION, UNKNOWN_SUBSECTION, line);
  }, markdown);
}

function upsertConceptDecisionCoverage(
  markdown: string,
  record: ProviderCardObservationRecord,
): string {
  const decisions = record.conceptDecisions ?? [];
  if (decisions.length === 0) {
    return markdown;
  }

  return decisions.reduce((current, decision) => {
    const subsection = toConceptCoverageSubsection(decision.status);
    const concept = decision.concept.trim();
    if (!subsection || !isWritableConcept(concept)) {
      return current;
    }

    const line = toConceptDecisionLine(decision, record.styleFamily);
    if (hasLine(current, line)) {
      return current;
    }

    const withCoverage = hasSection(current, CONCEPT_COVERAGE_SECTION)
      ? current
      : `${current.trimEnd()}\n\n## ${CONCEPT_COVERAGE_SECTION}\n`;
    return hasSubsection(withCoverage, CONCEPT_COVERAGE_SECTION, subsection)
      ? appendLineToSubsection(withCoverage, CONCEPT_COVERAGE_SECTION, subsection, line)
      : appendSubsection(withCoverage, CONCEPT_COVERAGE_SECTION, subsection, line);
  }, markdown);
}

function toConceptCoverageSubsection(status: string): string | null {
  switch (status) {
    case 'unknown':
    case 'unlisted':
      return UNKNOWN_SUBSECTION;
    case 'partial':
      return PARTIAL_SUBSECTION;
    case 'anti-pattern':
      return ANTI_PATTERNS_SUBSECTION;
    default:
      return null;
  }
}

function toConceptDecisionLine(
  decision: ProviderExpressionConceptDecision,
  styleFamily: string | undefined,
): string {
  const concept = decision.concept.trim();
  const output = decision.output?.trim();
  if (output && isWritableConcept(output)) {
    return `- ${concept} → ${output}`;
  }
  return `- ${concept} → project-observed ${styleFamily ?? 'mixed'} concept`;
}

function isWritableConcept(concept: string): boolean {
  const trimmed = concept.trim();
  return (
    trimmed.length > 1 && trimmed.length <= 80 && !trimmed.includes('\n') && !trimmed.includes('\r')
  );
}

function toAntiBiasStrategyLine(record: ProviderCardObservationRecord): string | null {
  if (record.mode !== 'fallback' && record.mode !== 'native') {
    return null;
  }

  const style = record.styleFamily ? ` for ${record.styleFamily}` : '';
  switch (record.reason) {
    case 'provider-expression-context-bypassed':
      return `- Project observation${style}: keep provider-neutral fallback wording available when provider expression guidance is bypassed.`;
    case 'provider-card-not-found':
    case 'provider-card-unavailable':
      return `- Project observation${style}: verify provider card coverage before routing generation requests.`;
    case 'provider-router-disabled':
      return `- Project observation${style}: require explicit provider selection when automatic routing is disabled.`;
    case 'provider-expression-context-unavailable':
      return `- Project observation${style}: preserve a concise fallback prompt when provider expression context is unavailable.`;
    default:
      return record.reason
        ? `- Project observation${style}: review native/fallback reason ${record.reason}.`
        : `- Project observation${style}: review provider native/fallback behavior.`;
  }
}

function upsertAntiBiasStrategy(markdown: string, strategyLine: string): string {
  if (hasLine(markdown, strategyLine)) {
    return markdown;
  }

  const withTrainingProfile = hasSection(markdown, TRAINING_PROFILE_SECTION)
    ? markdown
    : `${markdown.trimEnd()}\n\n## ${TRAINING_PROFILE_SECTION}\n`;

  return hasSubsection(withTrainingProfile, TRAINING_PROFILE_SECTION, ANTI_BIAS_SUBSECTION)
    ? appendLineToSubsection(
        withTrainingProfile,
        TRAINING_PROFILE_SECTION,
        ANTI_BIAS_SUBSECTION,
        strategyLine,
      )
    : appendSubsection(
        withTrainingProfile,
        TRAINING_PROFILE_SECTION,
        ANTI_BIAS_SUBSECTION,
        strategyLine,
      );
}

function hasObservation(existing: string | null, record: ProviderCardObservationRecord): boolean {
  if (!existing) return false;
  const signature = observationSignature(record);
  return existing
    .split('\n')
    .map(parseObservationLine)
    .filter((parsed): parsed is ProviderCardObservationRecord => parsed !== null)
    .some((parsed) => observationSignature(parsed) === signature);
}

function observationSignature(record: ProviderCardObservationRecord): string {
  return [
    record.type,
    record.mode,
    record.toolName,
    record.styleFamily ?? '',
    record.reason ?? '',
    ...(record.concepts ?? []),
    ...(record.conceptDecisions ?? []).map((decision) =>
      [decision.concept, decision.status, decision.output ?? '', decision.reason ?? ''].join(':'),
    ),
  ].join('|');
}

function parseObservationLine(line: string): ProviderCardObservationRecord | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('- {')) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(2)) as unknown;
    if (!isObservationRecord(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isObservationRecord(value: unknown): value is ProviderCardObservationRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate['type'] === 'provider-card-observation' &&
    (candidate['mode'] === 'agentic' ||
      candidate['mode'] === 'fallback' ||
      candidate['mode'] === 'native') &&
    typeof candidate['toolName'] === 'string' &&
    typeof candidate['observedAt'] === 'string' &&
    (candidate['concepts'] === undefined ||
      (Array.isArray(candidate['concepts']) &&
        candidate['concepts'].every((concept) => typeof concept === 'string'))) &&
    (candidate['conceptDecisions'] === undefined ||
      (Array.isArray(candidate['conceptDecisions']) &&
        candidate['conceptDecisions'].every(isProviderExpressionConceptDecision))) &&
    (candidate['styleFamily'] === undefined || typeof candidate['styleFamily'] === 'string') &&
    (candidate['reason'] === undefined || typeof candidate['reason'] === 'string')
  );
}

function isProviderExpressionConceptDecision(
  value: unknown,
): value is ProviderExpressionConceptDecision {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['concept'] === 'string' &&
    typeof candidate['status'] === 'string' &&
    (candidate['output'] === undefined || typeof candidate['output'] === 'string') &&
    (candidate['reason'] === undefined || typeof candidate['reason'] === 'string')
  );
}

function hasLine(markdown: string, line: string): boolean {
  return markdown
    .split('\n')
    .map((entry) => entry.trim())
    .includes(line.trim());
}

function hasSection(markdown: string, section: string): boolean {
  return new RegExp(`(?:^|\\n)##\\s+${escapeRegExp(section)}\\s*(?:\\n|$)`).test(markdown);
}

function hasSubsection(markdown: string, section: string, subsection: string): boolean {
  const sectionBody = findSection(markdown, section)?.body;
  if (!sectionBody) return false;
  return new RegExp(`(?:^|\\n)###\\s+${escapeRegExp(subsection)}\\s*(?:\\n|$)`).test(sectionBody);
}

function appendSubsection(
  markdown: string,
  section: string,
  subsection: string,
  line: string,
): string {
  if (!findSection(markdown, section)) {
    return `${markdown.trimEnd()}\n\n## ${section}\n\n### ${subsection}\n${line}\n`;
  }
  return appendLineToSection(markdown, section, `\n### ${subsection}\n${line}`);
}

function appendLineToSection(markdown: string, section: string, line: string): string {
  const sectionMatch = findSection(markdown, section);
  if (!sectionMatch) {
    return `${markdown.trimEnd()}\n\n## ${section}\n${line}\n`;
  }

  const body = sectionMatch.body.trimEnd();
  const nextBody = body.length > 0 ? `${body}\n${line}\n` : `${line}\n`;
  return `${markdown.slice(0, sectionMatch.bodyStart)}${nextBody}${markdown.slice(sectionMatch.bodyEnd)}`;
}

function appendLineToSubsection(
  markdown: string,
  section: string,
  subsection: string,
  line: string,
): string {
  const sectionMatch = findSection(markdown, section);
  if (!sectionMatch) {
    return `${markdown.trimEnd()}\n\n## ${section}\n\n### ${subsection}\n${line}\n`;
  }

  const subsectionMatch = findSubsection(sectionMatch.body, subsection);
  if (!subsectionMatch) {
    return appendSubsection(markdown, section, subsection, line);
  }

  const body = subsectionMatch.body.trimEnd();
  const nextBody = body.length > 0 ? `${body}\n${line}\n` : `${line}\n`;
  const nextSectionBody = `${sectionMatch.body.slice(0, subsectionMatch.bodyStart)}${nextBody}${sectionMatch.body.slice(subsectionMatch.bodyEnd)}`;
  return `${markdown.slice(0, sectionMatch.bodyStart)}${nextSectionBody}${markdown.slice(sectionMatch.bodyEnd)}`;
}

function findSection(markdown: string, section: string): MarkdownSectionMatch | null {
  const headerPattern = new RegExp(`(?:^|\\n)##\\s+${escapeRegExp(section)}\\s*\\n`, 'g');
  const match = headerPattern.exec(markdown);
  if (!match) return null;
  const bodyStart = match.index + match[0].length;
  const nextHeader = /\n##\s+/.exec(markdown.slice(bodyStart));
  const bodyEnd = nextHeader ? bodyStart + nextHeader.index : markdown.length;
  return { body: markdown.slice(bodyStart, bodyEnd), bodyStart, bodyEnd };
}

function findSubsection(sectionBody: string, subsection: string): MarkdownSectionMatch | null {
  const headerPattern = new RegExp(`(?:^|\\n)###\\s+${escapeRegExp(subsection)}\\s*\\n`, 'g');
  const match = headerPattern.exec(sectionBody);
  if (!match) return null;
  const bodyStart = match.index + match[0].length;
  const nextHeader = /\n###\s+/.exec(sectionBody.slice(bodyStart));
  const bodyEnd = nextHeader ? bodyStart + nextHeader.index : sectionBody.length;
  return { body: sectionBody.slice(bodyStart, bodyEnd), bodyStart, bodyEnd };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
