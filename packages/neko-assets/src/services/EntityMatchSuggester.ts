import type {
  AssetEntity,
  CreativeEntityMatchOptions,
  CreativeEntityMatchSource,
  CreativeEntityMatchSuggestion,
  MatchableAssetEntityCategory,
} from '@neko/shared';

interface MatchCandidate {
  readonly confidence: number;
  readonly reason: readonly string[];
  readonly source: CreativeEntityMatchSource;
}

interface MatchRule {
  readonly score: number;
  readonly reason: string;
  readonly source: CreativeEntityMatchSource;
  readonly matches: (candidate: string, needle: string) => boolean;
}

const DEFAULT_LIMIT = 5;
const RESOLVE_ENTITY_THRESHOLD = 0.75;

const EXACT_NAME_RULE: MatchRule = {
  score: 1,
  reason: 'exact-name',
  source: 'name',
  matches: (candidate, needle) => candidate === needle,
};

const EXACT_ALIAS_RULE: MatchRule = {
  score: 0.94,
  reason: 'exact-alias',
  source: 'alias',
  matches: (candidate, needle) => candidate === needle,
};

const EXACT_TAG_RULE: MatchRule = {
  score: 0.78,
  reason: 'exact-tag',
  source: 'tag',
  matches: (candidate, needle) => candidate === needle,
};

const PREFIX_NAME_RULE: MatchRule = {
  score: 0.72,
  reason: 'prefix-name',
  source: 'rule',
  matches: (candidate, needle) => candidate.startsWith(needle),
};

const PREFIX_ALIAS_RULE: MatchRule = {
  score: 0.68,
  reason: 'prefix-alias',
  source: 'rule',
  matches: (candidate, needle) => candidate.startsWith(needle),
};

const CONTAINS_NAME_RULE: MatchRule = {
  score: 0.6,
  reason: 'contains-name',
  source: 'rule',
  matches: (candidate, needle) => candidate.includes(needle),
};

const CONTAINS_ALIAS_RULE: MatchRule = {
  score: 0.56,
  reason: 'contains-alias',
  source: 'rule',
  matches: (candidate, needle) => candidate.includes(needle),
};

const CONTAINS_TAG_RULE: MatchRule = {
  score: 0.52,
  reason: 'contains-tag',
  source: 'rule',
  matches: (candidate, needle) => candidate.includes(needle),
};

export function suggestEntityMatches(
  query: string,
  entities: readonly AssetEntity[],
  options: CreativeEntityMatchOptions = {},
): CreativeEntityMatchSuggestion<AssetEntity>[] {
  const needle = normalizeEntityToken(query);
  if (!needle) {
    return [];
  }

  const categorySet = createCategorySet(options.categories);
  const minConfidence = options.minConfidence ?? 0;
  const limit = options.limit ?? DEFAULT_LIMIT;

  return entities
    .filter((entity) => matchesCategory(entity, categorySet))
    .map((entity) => buildSuggestion(entity, needle))
    .filter((suggestion): suggestion is CreativeEntityMatchSuggestion<AssetEntity> => {
      return suggestion !== null && suggestion.confidence >= minConfidence;
    })
    .sort(compareSuggestions)
    .slice(0, limit);
}

export function resolveEntityMatch(
  query: string,
  entities: readonly AssetEntity[],
  options: Omit<CreativeEntityMatchOptions, 'limit' | 'minConfidence'> = {},
): AssetEntity | null {
  return (
    suggestEntityMatches(query, entities, {
      ...options,
      limit: 1,
      minConfidence: RESOLVE_ENTITY_THRESHOLD,
    })[0]?.entity ?? null
  );
}

export function normalizeEntityToken(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
}

function createCategorySet(
  categories: readonly MatchableAssetEntityCategory[] | undefined,
): ReadonlySet<MatchableAssetEntityCategory> | undefined {
  return categories && categories.length > 0 ? new Set(categories) : undefined;
}

function matchesCategory(
  entity: AssetEntity,
  categorySet: ReadonlySet<MatchableAssetEntityCategory> | undefined,
): boolean {
  return categorySet ? categorySet.has(entity.category as MatchableAssetEntityCategory) : true;
}

function buildSuggestion(
  entity: AssetEntity,
  needle: string,
): CreativeEntityMatchSuggestion<AssetEntity> | null {
  let bestMatch = matchValue(entity.name, needle, [
    EXACT_NAME_RULE,
    PREFIX_NAME_RULE,
    CONTAINS_NAME_RULE,
  ]);

  for (const alias of entity.aliases ?? []) {
    const aliasMatch = matchValue(alias, needle, [
      EXACT_ALIAS_RULE,
      PREFIX_ALIAS_RULE,
      CONTAINS_ALIAS_RULE,
    ]);
    bestMatch = pickBetterMatch(bestMatch, aliasMatch);
  }

  for (const tag of entity.tags) {
    const tagMatch = matchValue(tag, needle, [EXACT_TAG_RULE, CONTAINS_TAG_RULE]);
    bestMatch = pickBetterMatch(bestMatch, tagMatch);
  }

  if (!bestMatch) {
    return null;
  }

  return {
    entity,
    confidence: bestMatch.confidence,
    reason: bestMatch.reason,
    source: bestMatch.source,
  };
}

function matchValue(
  value: string | undefined,
  needle: string,
  rules: readonly MatchRule[],
): MatchCandidate | null {
  const candidate = normalizeEntityToken(value);
  if (!candidate) {
    return null;
  }

  for (const rule of rules) {
    if (rule.matches(candidate, needle)) {
      return {
        confidence: rule.score,
        reason: [rule.reason],
        source: rule.source,
      };
    }
  }

  return null;
}

function pickBetterMatch(
  current: MatchCandidate | null,
  next: MatchCandidate | null,
): MatchCandidate | null {
  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  if (next.confidence > current.confidence) {
    return next;
  }

  if (next.confidence === current.confidence && next.source < current.source) {
    return next;
  }

  return current;
}

function compareSuggestions(
  left: CreativeEntityMatchSuggestion<AssetEntity>,
  right: CreativeEntityMatchSuggestion<AssetEntity>,
): number {
  return (
    right.confidence - left.confidence ||
    right.entity.usageCount - left.entity.usageCount ||
    right.entity.updatedAt - left.entity.updatedAt ||
    left.entity.name.localeCompare(right.entity.name)
  );
}
