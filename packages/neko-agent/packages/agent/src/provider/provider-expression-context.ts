import type {
  ProviderCard,
  ProviderGenerationCapability,
  ProviderId,
  ProviderModelId,
  PromptFragment,
  StyleFamily,
} from '@neko/shared';

export type ProviderExpressionContextMode = 'selected' | 'candidates';
export type ProviderExpressionTaskStage = 'planning' | 'routing' | 'generation';

export interface ProviderExpressionTarget {
  readonly providerId?: ProviderId;
  readonly modelId?: ProviderModelId;
  readonly capability?: ProviderGenerationCapability;
}

export interface ProviderExpressionContextOptions {
  readonly cards: readonly ProviderCard[];
  readonly maxCards?: number;
  readonly maxCardsPerCapability?: number;
  readonly maxContextTokens?: number;
  readonly estimateTokens?: (content: string) => number;
  readonly fragmentId?: string;
  readonly capability?: ProviderGenerationCapability;
  readonly providerId?: ProviderId;
  readonly modelId?: ProviderModelId;
  readonly preferredStyleFamily?: StyleFamily;
  readonly taskStage?: ProviderExpressionTaskStage;
  readonly mode?: ProviderExpressionContextMode;
}

const DEFAULT_SELECTED_PROVIDER_CONTEXT_CARDS = 1;
const DEFAULT_CANDIDATE_PROVIDER_CONTEXT_CARDS = 6;
const DEFAULT_CANDIDATE_PROVIDER_CONTEXT_CARDS_PER_CAPABILITY = 2;

export function createProviderExpressionPromptFragments(
  options: ProviderExpressionContextOptions,
): readonly PromptFragment[] {
  const cards = selectProviderCards(options);
  if (cards.length === 0) {
    return [];
  }

  return [
    {
      id: options.fragmentId ?? 'provider:expression-context',
      priority: 68,
      content: renderProviderExpressionContext(cards, options.mode ?? 'selected', options),
    },
  ];
}

function selectProviderCards(options: ProviderExpressionContextOptions): readonly ProviderCard[] {
  const mode = options.mode ?? 'selected';
  const scored = options.cards
    .filter((card) => matchesCapability(card, options.capability))
    .filter((card) => matchesProviderTarget(card, options))
    .map((card) => ({ card, score: scoreProviderCard(card, options) }))
    .sort((left, right) => compareScoredProviderCards(left, right));

  if (mode === 'candidates' && !options.capability) {
    return selectCandidateCardsByCapability(scored, options);
  }

  const maxCards =
    options.maxCards ??
    (mode === 'candidates'
      ? DEFAULT_CANDIDATE_PROVIDER_CONTEXT_CARDS
      : DEFAULT_SELECTED_PROVIDER_CONTEXT_CARDS);
  return scored.slice(0, maxCards).map((entry) => entry.card);
}

function selectCandidateCardsByCapability(
  scored: readonly { readonly card: ProviderCard; readonly score: number }[],
  options: ProviderExpressionContextOptions,
): readonly ProviderCard[] {
  const maxCards = options.maxCards ?? DEFAULT_CANDIDATE_PROVIDER_CONTEXT_CARDS;
  const maxCardsPerCapability =
    options.maxCardsPerCapability ?? DEFAULT_CANDIDATE_PROVIDER_CONTEXT_CARDS_PER_CAPABILITY;
  const selected: ProviderCard[] = [];
  const counts = new Map<ProviderGenerationCapability, number>();

  for (const entry of scored) {
    const capability = entry.card.capabilities[0];
    if (!capability) continue;
    const count = counts.get(capability) ?? 0;
    if (count >= maxCardsPerCapability) continue;
    selected.push(entry.card);
    counts.set(capability, count + 1);
    if (selected.length >= maxCards) break;
  }

  return selected;
}

function compareScoredProviderCards(
  left: { readonly card: ProviderCard; readonly score: number },
  right: { readonly card: ProviderCard; readonly score: number },
): number {
  return right.score - left.score || compareProviderCards(left.card, right.card);
}

function compareProviderCards(left: ProviderCard, right: ProviderCard): number {
  return (
    left.providerId.localeCompare(right.providerId) ||
    (left.modelId ?? '').localeCompare(right.modelId ?? '')
  );
}

function matchesCapability(
  card: ProviderCard,
  capability: ProviderGenerationCapability | undefined,
): boolean {
  return !capability || card.capabilities.includes(capability);
}

function matchesProviderTarget(card: ProviderCard, target: ProviderExpressionTarget): boolean {
  if (target.providerId && card.providerId !== target.providerId) {
    return false;
  }
  if (target.modelId && card.modelId !== target.modelId) {
    return false;
  }
  return true;
}

function scoreProviderCard(card: ProviderCard, options: ProviderExpressionContextOptions): number {
  let score = card.sourceLayer === 'project' ? 3 : card.sourceLayer === 'market' ? 2 : 1;
  if (options.providerId && card.providerId === options.providerId) {
    score += 8;
  }
  if (options.modelId && card.modelId === options.modelId) {
    score += 12;
  }
  if (options.capability && card.capabilities.includes(options.capability)) {
    score += 4;
  }
  const styleScore = options.preferredStyleFamily
    ? card.trainingProfile.styleAffinities[options.preferredStyleFamily]
    : undefined;
  if (typeof styleScore === 'number') {
    score += styleScore;
  }
  return score;
}

function renderProviderExpressionContext(
  cards: readonly ProviderCard[],
  mode: ProviderExpressionContextMode,
  options: ProviderExpressionContextOptions,
): string {
  const lines = [
    '## Provider Expression Context',
    '',
    mode === 'selected'
      ? 'Use this selected provider card as soft guidance for the current media generation target.'
      : 'Use these candidate provider cards only to choose a generation target or compare provider tendencies.',
    'They are expression tendencies, failure modes, and examples — not deterministic replacement rules.',
    'Do not silently replace user intent with card entries. Preserve the Plan/Task Markdown and user prompt as the source of truth.',
    'If no provider-specific guidance is relevant, write a native provider prompt directly.',
    '',
    ...cards.flatMap((card) =>
      renderProviderCardSummary(card, options.taskStage ?? defaultTaskStage(mode)),
    ),
  ];
  return applyTokenBudget(lines, options);
}

function renderProviderCardSummary(
  card: ProviderCard,
  taskStage: ProviderExpressionTaskStage,
): readonly string[] {
  const commonLines = [
    `### ${card.displayName} (${formatProviderTarget(card)})`,
    `- Capabilities: ${card.capabilities.join(', ')}`,
  ];

  if (taskStage === 'routing') {
    return [
      ...commonLines,
      ...renderStyleAffinities(card),
      ...(card.trainingProfile.stylePrior
        ? [`- Style prior: ${card.trainingProfile.stylePrior}`]
        : []),
      '',
    ];
  }

  if (taskStage === 'generation') {
    return [
      ...commonLines,
      ...(card.trainingProfile.descriptionDensity
        ? [`- Description density: ${card.trainingProfile.descriptionDensity}`]
        : []),
      ...(card.syntaxProfile.bestPhrasingPattern
        ? [`- Preferred phrasing: ${card.syntaxProfile.bestPhrasingPattern}`]
        : []),
      ...(card.syntaxProfile.supportsNegativePrompt !== undefined
        ? [
            `- Negative prompt support: ${card.syntaxProfile.supportsNegativePrompt ? 'supported' : 'weak/unsupported'}`,
          ]
        : []),
      ...(card.trainingProfile.spatialGrounding
        ? [`- Spatial grounding: ${card.trainingProfile.spatialGrounding}`]
        : []),
      ...renderSoftExpressionHints(card),
      ...card.trainingProfile.antiBiasStrategies.map(
        (strategy) => `- Failure/bias note: ${strategy}`,
      ),
      '',
    ];
  }

  return [
    ...commonLines,
    ...(card.trainingProfile.stylePrior
      ? [`- Style prior: ${card.trainingProfile.stylePrior}`]
      : []),
    ...renderStyleAffinities(card),
    ...(card.trainingProfile.descriptionDensity
      ? [`- Description density: ${card.trainingProfile.descriptionDensity}`]
      : []),
    ...(card.syntaxProfile.bestPhrasingPattern
      ? [`- Preferred phrasing: ${card.syntaxProfile.bestPhrasingPattern}`]
      : []),
    ...card.trainingProfile.antiBiasStrategies.map(
      (strategy) => `- Failure/bias note: ${strategy}`,
    ),
    '',
  ];
}

function defaultTaskStage(mode: ProviderExpressionContextMode): ProviderExpressionTaskStage {
  return mode === 'candidates' ? 'routing' : 'generation';
}

function formatProviderTarget(card: ProviderCard): string {
  return card.modelId ? `${card.providerId}/${card.modelId}` : card.providerId;
}

function renderStyleAffinities(card: ProviderCard): readonly string[] {
  const entries = Object.entries(card.trainingProfile.styleAffinities)
    .filter(([, score]) => typeof score === 'number' && score > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0
    ? [`- Style tendencies: ${entries.map(([style, score]) => `${style}(${score})`).join(', ')}`]
    : [];
}

function renderSoftExpressionHints(card: ProviderCard): readonly string[] {
  return card.conceptCoverage.entries.slice(0, 8).map((entry) => {
    const hint = entry.expansion ? `; possible phrasing: ${entry.expansion}` : '';
    return `- Soft expression hint: ${entry.concept} is ${entry.status}${hint}`;
  });
}

function applyTokenBudget(
  lines: readonly string[],
  options: Pick<ProviderExpressionContextOptions, 'maxContextTokens' | 'estimateTokens'>,
): string {
  const maxTokens = options.maxContextTokens;
  if (!maxTokens || maxTokens <= 0) {
    return lines.join('\n');
  }

  const estimateTokens = options.estimateTokens ?? estimatePromptTokens;
  const selected: string[] = [];
  let omitted = false;

  for (const line of lines) {
    const candidate = [...selected, line].join('\n');
    if (estimateTokens(candidate) <= maxTokens) {
      selected.push(line);
      continue;
    }
    omitted = true;
    if (
      line.startsWith('### ') &&
      selected.some((selectedLine) => selectedLine.startsWith('### '))
    ) {
      break;
    }
  }

  if (!omitted) {
    return selected.join('\n');
  }

  const omissionLine =
    '- Additional provider expression details omitted to stay within token budget.';
  const fallbackOmissionLine = fitLineToTokenBudget(omissionLine, maxTokens, estimateTokens);
  while (selected.length > 0) {
    const candidate = [...selected, omissionLine].join('\n');
    if (estimateTokens(candidate) <= maxTokens) {
      selected.push(omissionLine);
      break;
    }
    const fallbackCandidate = [...selected, fallbackOmissionLine].join('\n');
    if (estimateTokens(fallbackCandidate) <= maxTokens) {
      selected.push(fallbackOmissionLine);
      break;
    }
    selected.pop();
  }

  if (selected.length === 0) {
    return fallbackOmissionLine;
  }

  return selected.join('\n');
}

function fitLineToTokenBudget(
  line: string,
  maxTokens: number,
  estimateTokens: (content: string) => number,
): string {
  if (estimateTokens(line) <= maxTokens) {
    return line;
  }

  let candidate = line;
  while (candidate.length > 1 && estimateTokens(candidate) > maxTokens) {
    candidate = candidate.slice(0, -1);
  }
  return candidate || '…';
}

function estimatePromptTokens(content: string): number {
  return Math.ceil(content.length / 4);
}
