import type {
  CreativeEntityRef,
  NpcProfileFact,
  NpcTranscriptMessage,
  ProjectIndexFreshness,
} from '@neko/shared';

export type CharacterEvidenceMode =
  | 'character-dialogue'
  | 'embody-character'
  | 'character-validation';

export type CharacterEvidenceSourceKind =
  | 'dashboard-detail'
  | 'entity-occurrence'
  | 'story-script-index'
  | 'project-search'
  | 'manual';

export type CharacterEvidenceAuthority = 'confirmed' | 'suggested' | 'indexed';

export type CharacterEvidenceOmissionReason =
  | 'budget'
  | 'duplicate'
  | 'empty'
  | 'malformed-source'
  | 'missing-source'
  | 'safety'
  | 'stale'
  | 'unsupported-source'
  | 'unavailable';

export type CharacterEvidenceMetadataValue = string | number | boolean | null;

export type CharacterEvidenceMetadata = Readonly<Record<string, CharacterEvidenceMetadataValue>>;

export interface CharacterEvidenceBudget {
  readonly maxChunks: number;
  readonly maxCharacters: number;
  readonly perChunkMaxCharacters: number;
  readonly maxTokens?: number;
  readonly charsPerToken?: number;
  readonly minScore?: number;
}

export interface CharacterEvidenceSourceRef {
  readonly id: string;
  readonly kind: CharacterEvidenceSourceKind;
  readonly label?: string;
  readonly providerId?: string;
  readonly location?: string;
  readonly projectRelativePath?: string;
  readonly filePath?: string;
  readonly uri?: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly freshness?: ProjectIndexFreshness;
  readonly metadata?: CharacterEvidenceMetadata;
}

export interface CharacterEvidenceRelevanceSignal {
  readonly name: string;
  readonly weight: number;
  readonly matched?: readonly string[];
}

export interface CharacterEvidenceRelevance {
  readonly score: number;
  readonly signals: readonly CharacterEvidenceRelevanceSignal[];
}

export interface CharacterEvidenceChunk {
  readonly id: string;
  readonly text: string;
  readonly sourceRefs: readonly CharacterEvidenceSourceRef[];
  readonly authority: CharacterEvidenceAuthority;
  readonly relevance: CharacterEvidenceRelevance;
  readonly freshness: ProjectIndexFreshness;
  readonly knowledgeBoundary?: string;
  readonly metadata?: CharacterEvidenceMetadata;
}

export interface CharacterEvidenceOmission {
  readonly reason: CharacterEvidenceOmissionReason;
  readonly sourceRef?: CharacterEvidenceSourceRef;
  readonly chunkId?: string;
  readonly message: string;
  readonly metadata?: CharacterEvidenceMetadata;
}

export interface CharacterEvidenceRequest {
  readonly entityRef: CreativeEntityRef;
  readonly mode: CharacterEvidenceMode;
  readonly query: string;
  readonly projectRoot: string;
  readonly budget: CharacterEvidenceBudget;
  readonly transcript?: readonly NpcTranscriptMessage[];
  readonly seedSourceRefs?: readonly CharacterEvidenceSourceRef[];
}

export interface CharacterEvidenceBundle {
  readonly entityRef: CreativeEntityRef;
  readonly mode: CharacterEvidenceMode;
  readonly query: string;
  readonly chunks: readonly CharacterEvidenceChunk[];
  readonly omitted: readonly CharacterEvidenceOmission[];
  readonly freshness: ProjectIndexFreshness;
  readonly budget: CharacterEvidenceBudget;
}

export interface CharacterEvidenceLoader {
  loadEvidence(request: CharacterEvidenceRequest): Promise<CharacterEvidenceBundle>;
}

export interface CharacterEvidenceScoreInput {
  readonly chunk: Omit<CharacterEvidenceChunk, 'relevance'> & {
    readonly relevance?: CharacterEvidenceRelevance;
  };
  readonly queryTokens: readonly string[];
  readonly entityTokens?: readonly string[];
  readonly transcriptTokens?: readonly string[];
}

export interface CharacterEvidenceTrimResult {
  readonly chunks: readonly CharacterEvidenceChunk[];
  readonly omitted: readonly CharacterEvidenceOmission[];
}

export const DEFAULT_CHARACTER_EVIDENCE_BUDGET: CharacterEvidenceBudget = {
  maxChunks: 8,
  maxCharacters: 12000,
  perChunkMaxCharacters: 3000,
  maxTokens: 3000,
  charsPerToken: 4,
  minScore: 0,
};

const FRESHNESS_SCORE: Readonly<Record<ProjectIndexFreshness, number>> = {
  fresh: 3,
  partial: 1,
  building: 0,
  stale: -1,
  failed: -4,
};

const AUTHORITY_SCORE: Readonly<Record<CharacterEvidenceAuthority, number>> = {
  confirmed: 3,
  indexed: 2,
  suggested: 1,
};

export function normalizeCharacterEvidenceTokens(
  input: string | readonly string[],
): readonly string[] {
  const raw = typeof input === 'string' ? input : input.join(' ');
  const normalized = raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .trim();
  if (!normalized) return [];
  return dedupeStrings(normalized.split(/\s+/).filter((token) => token.length > 0));
}

export function scoreCharacterEvidenceChunk(
  input: CharacterEvidenceScoreInput,
): CharacterEvidenceRelevance {
  const textTokens = new Set(normalizeCharacterEvidenceTokens(input.chunk.text));
  const signals: CharacterEvidenceRelevanceSignal[] = [];
  let score = 0;

  const queryMatches = input.queryTokens.filter((token) => textTokens.has(token));
  if (queryMatches.length > 0) {
    const weight = queryMatches.length * 5;
    score += weight;
    signals.push({ name: 'query-token-match', weight, matched: queryMatches });
  }

  const entityMatches = (input.entityTokens ?? []).filter((token) => textTokens.has(token));
  if (entityMatches.length > 0) {
    const weight = entityMatches.length * 3;
    score += weight;
    signals.push({ name: 'entity-token-match', weight, matched: entityMatches });
  }

  const transcriptMatches = (input.transcriptTokens ?? []).filter((token) => textTokens.has(token));
  if (transcriptMatches.length > 0) {
    const weight = Math.min(6, transcriptMatches.length * 2);
    score += weight;
    signals.push({ name: 'recent-transcript-match', weight, matched: transcriptMatches });
  }

  const authorityWeight = AUTHORITY_SCORE[input.chunk.authority];
  score += authorityWeight;
  signals.push({ name: 'authority', weight: authorityWeight });

  const freshnessWeight = FRESHNESS_SCORE[input.chunk.freshness];
  score += freshnessWeight;
  signals.push({ name: 'freshness', weight: freshnessWeight });

  return { score, signals };
}

export function rankCharacterEvidenceChunks(
  chunks: readonly CharacterEvidenceChunk[],
): readonly CharacterEvidenceChunk[] {
  return [...chunks].sort((left, right) => {
    const scoreDelta = right.relevance.score - left.relevance.score;
    if (scoreDelta !== 0) return scoreDelta;
    const leftLine = firstSourceLine(left);
    const rightLine = firstSourceLine(right);
    if (leftLine !== rightLine) return leftLine - rightLine;
    return stableChunkSortKey(left).localeCompare(stableChunkSortKey(right));
  });
}

export function dedupeCharacterEvidenceChunks(
  chunks: readonly CharacterEvidenceChunk[],
): readonly CharacterEvidenceChunk[] {
  const byKey = new Map<string, CharacterEvidenceChunk>();
  const order: string[] = [];

  for (const chunk of chunks) {
    const key = characterEvidenceDedupeKey(chunk);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, chunk);
      order.push(key);
      continue;
    }

    byKey.set(key, mergeCharacterEvidenceChunks(existing, chunk));
  }

  return order
    .map((key) => byKey.get(key))
    .filter((chunk): chunk is CharacterEvidenceChunk => !!chunk);
}

export function trimCharacterEvidenceChunks(input: {
  readonly chunks: readonly CharacterEvidenceChunk[];
  readonly budget: CharacterEvidenceBudget;
}): CharacterEvidenceTrimResult {
  const budget = normalizeBudget(input.budget);
  const minScore = budget.minScore ?? 0;
  const charsPerToken = budget.charsPerToken ?? 4;
  const ranked = rankCharacterEvidenceChunks(input.chunks).filter(
    (chunk) => chunk.relevance.score >= minScore,
  );
  const chunks: CharacterEvidenceChunk[] = [];
  const omitted: CharacterEvidenceOmission[] = [];
  let usedCharacters = 0;

  for (const chunk of ranked) {
    if (chunks.length >= budget.maxChunks) {
      omitted.push(createBudgetOmission(chunk, 'Chunk limit reached.'));
      continue;
    }

    const remainingCharacters = budget.maxCharacters - usedCharacters;
    const remainingTokenCharacters =
      budget.maxTokens !== undefined
        ? budget.maxTokens * charsPerToken - usedCharacters
        : remainingCharacters;
    const remaining = Math.min(
      remainingCharacters,
      remainingTokenCharacters,
      budget.perChunkMaxCharacters,
    );

    if (remaining <= 0) {
      omitted.push(createBudgetOmission(chunk, 'Character budget reached.'));
      continue;
    }

    const normalizedChunk =
      chunk.text.length > remaining
        ? {
            ...chunk,
            text: truncateEvidenceText(chunk.text, remaining),
            metadata: {
              ...(chunk.metadata ?? {}),
              truncated: true,
              originalCharacters: chunk.text.length,
            },
          }
        : chunk;

    chunks.push(normalizedChunk);
    usedCharacters += normalizedChunk.text.length;

    if (chunk.text.length > normalizedChunk.text.length) {
      omitted.push(createBudgetOmission(chunk, 'Chunk was truncated to fit evidence budget.'));
    }
  }

  const filtered = input.chunks.filter((chunk) => chunk.relevance.score < minScore);
  for (const chunk of filtered) {
    omitted.push(createBudgetOmission(chunk, 'Chunk was below the minimum relevance score.'));
  }

  return { chunks, omitted };
}

export function renderCharacterEvidenceBundle(bundle: CharacterEvidenceBundle): string {
  const lines = [
    'Turn-scoped project evidence:',
    `Mode: ${bundle.mode}`,
    `Freshness: ${bundle.freshness}`,
    `Loaded chunks: ${bundle.chunks.length}`,
  ];

  if (bundle.chunks.length === 0) {
    lines.push('- No relevant project evidence was loaded for this turn.');
  }

  bundle.chunks.forEach((chunk, index) => {
    lines.push(
      '',
      `[Evidence ${index + 1}] score=${chunk.relevance.score} authority=${chunk.authority} freshness=${chunk.freshness}`,
      `Source: ${formatPrimarySource(chunk.sourceRefs[0])}`,
      chunk.text,
    );
  });

  if (bundle.omitted.length > 0) {
    lines.push('', 'Omitted evidence:');
    for (const omission of bundle.omitted.slice(0, 12)) {
      lines.push(`- ${omission.reason}: ${omission.message}`);
    }
  }

  return lines.join('\n');
}

export function projectCharacterEvidenceBundleToProfileFacts(
  bundle: CharacterEvidenceBundle,
): readonly NpcProfileFact[] {
  return bundle.chunks.map((chunk, index) => ({
    key: `script.context.${index + 1}`,
    value: chunk.text,
    source: 'script-extraction',
    authority: chunk.authority === 'suggested' ? 'suggested' : 'confirmed',
    sourceRef: formatPrimarySource(chunk.sourceRefs[0]),
    providerId: chunk.sourceRefs[0]?.providerId ?? chunk.sourceRefs[0]?.kind,
    metadata: {
      evidenceChunkId: chunk.id,
      relevanceScore: chunk.relevance.score,
      freshness: chunk.freshness,
    },
  }));
}

export function aggregateCharacterEvidenceFreshness(
  freshnessValues: readonly ProjectIndexFreshness[],
): ProjectIndexFreshness {
  if (freshnessValues.length === 0) return 'failed';
  if (freshnessValues.includes('failed')) return 'partial';
  if (freshnessValues.includes('building')) return 'building';
  if (freshnessValues.includes('stale')) return 'stale';
  if (freshnessValues.includes('partial')) return 'partial';
  return 'fresh';
}

export function normalizeCharacterEvidenceBudget(
  budget: Partial<CharacterEvidenceBudget> = {},
): CharacterEvidenceBudget {
  return normalizeBudget({ ...DEFAULT_CHARACTER_EVIDENCE_BUDGET, ...budget });
}

function normalizeBudget(budget: CharacterEvidenceBudget): CharacterEvidenceBudget {
  const charsPerToken = Math.max(
    1,
    budget.charsPerToken ?? DEFAULT_CHARACTER_EVIDENCE_BUDGET.charsPerToken ?? 4,
  );
  return {
    maxChunks: Math.max(0, Math.floor(budget.maxChunks)),
    maxCharacters: Math.max(0, Math.floor(budget.maxCharacters)),
    perChunkMaxCharacters: Math.max(0, Math.floor(budget.perChunkMaxCharacters)),
    ...(budget.maxTokens !== undefined
      ? { maxTokens: Math.max(0, Math.floor(budget.maxTokens)) }
      : {}),
    charsPerToken,
    ...(budget.minScore !== undefined ? { minScore: budget.minScore } : { minScore: 0 }),
  };
}

function characterEvidenceDedupeKey(chunk: CharacterEvidenceChunk): string {
  const source = chunk.sourceRefs[0];
  const location = source
    ? [
        source.projectRelativePath ?? source.filePath ?? source.uri ?? source.location ?? source.id,
        source.lineStart ?? '',
        source.lineEnd ?? '',
      ].join(':')
    : chunk.id;
  return `${location}\u0000${stableTextHash(chunk.text)}`;
}

function mergeCharacterEvidenceChunks(
  left: CharacterEvidenceChunk,
  right: CharacterEvidenceChunk,
): CharacterEvidenceChunk {
  const preferred = right.relevance.score > left.relevance.score ? right : left;
  return {
    ...preferred,
    sourceRefs: dedupeSourceRefs([...left.sourceRefs, ...right.sourceRefs]),
    relevance: {
      score: Math.max(left.relevance.score, right.relevance.score),
      signals: dedupeRelevanceSignals([...left.relevance.signals, ...right.relevance.signals]),
    },
    freshness: aggregateCharacterEvidenceFreshness([left.freshness, right.freshness]),
  };
}

function dedupeSourceRefs(
  sourceRefs: readonly CharacterEvidenceSourceRef[],
): readonly CharacterEvidenceSourceRef[] {
  const seen = new Set<string>();
  const result: CharacterEvidenceSourceRef[] = [];
  for (const sourceRef of sourceRefs) {
    const key = [
      sourceRef.kind,
      sourceRef.id,
      sourceRef.projectRelativePath ?? sourceRef.filePath ?? sourceRef.uri ?? '',
      sourceRef.lineStart ?? '',
      sourceRef.lineEnd ?? '',
    ].join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(sourceRef);
  }
  return result;
}

function dedupeRelevanceSignals(
  signals: readonly CharacterEvidenceRelevanceSignal[],
): readonly CharacterEvidenceRelevanceSignal[] {
  const byName = new Map<string, CharacterEvidenceRelevanceSignal>();
  for (const signal of signals) {
    const existing = byName.get(signal.name);
    if (!existing) {
      byName.set(signal.name, signal);
      continue;
    }
    byName.set(signal.name, {
      name: signal.name,
      weight: Math.max(existing.weight, signal.weight),
      matched: dedupeStrings([...(existing.matched ?? []), ...(signal.matched ?? [])]),
    });
  }
  return [...byName.values()];
}

function createBudgetOmission(
  chunk: CharacterEvidenceChunk,
  message: string,
): CharacterEvidenceOmission {
  return {
    reason: 'budget',
    chunkId: chunk.id,
    sourceRef: chunk.sourceRefs[0],
    message,
    metadata: {
      relevanceScore: chunk.relevance.score,
      characters: chunk.text.length,
    },
  };
}

function truncateEvidenceText(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) return text;
  if (maxCharacters <= 12) return text.slice(0, maxCharacters);
  return `${text.slice(0, maxCharacters - 12).trimEnd()}\n[truncated]`;
}

function firstSourceLine(chunk: CharacterEvidenceChunk): number {
  return chunk.sourceRefs[0]?.lineStart ?? Number.MAX_SAFE_INTEGER;
}

function stableChunkSortKey(chunk: CharacterEvidenceChunk): string {
  const source = chunk.sourceRefs[0];
  return [
    source?.projectRelativePath ?? source?.filePath ?? source?.uri ?? source?.location ?? '',
    source?.lineStart ?? '',
    source?.lineEnd ?? '',
    chunk.id,
  ].join('\u0000');
}

function stableTextHash(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function formatPrimarySource(sourceRef: CharacterEvidenceSourceRef | undefined): string {
  if (!sourceRef) return 'unknown';
  const location =
    sourceRef.location ??
    (sourceRef.projectRelativePath
      ? `${sourceRef.projectRelativePath}${formatLineRange(sourceRef)}`
      : (sourceRef.uri ?? sourceRef.filePath ?? sourceRef.id));
  return [sourceRef.label, location].filter((value): value is string => Boolean(value)).join(' @ ');
}

function formatLineRange(sourceRef: CharacterEvidenceSourceRef): string {
  if (sourceRef.lineStart === undefined) return '';
  if (sourceRef.lineEnd === undefined || sourceRef.lineEnd === sourceRef.lineStart) {
    return `:${sourceRef.lineStart}`;
  }
  return `:${sourceRef.lineStart}-${sourceRef.lineEnd}`;
}

function dedupeStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
