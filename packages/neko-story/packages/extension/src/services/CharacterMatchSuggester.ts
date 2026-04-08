import type {
  CharacterRecord,
  CreativeEntityMatchOptions,
  CreativeEntityMatchSuggestion,
} from '@neko/shared';
import { normalizeCharacterLookupKey } from '@neko/shared';

interface CharacterMatchRule {
  readonly score: number;
  readonly reason: string;
  readonly matches: (candidate: string, needle: string) => boolean;
}

const DEFAULT_LIMIT = 5;

const EXACT_NAME_RULE: CharacterMatchRule = {
  score: 1,
  reason: 'exact-name',
  matches: (candidate, needle) => candidate === needle,
};

const EXACT_ALIAS_RULE: CharacterMatchRule = {
  score: 0.94,
  reason: 'exact-alias',
  matches: (candidate, needle) => candidate === needle,
};

const EXACT_SCRIPT_NAME_RULE: CharacterMatchRule = {
  score: 0.9,
  reason: 'exact-script-name',
  matches: (candidate, needle) => candidate === needle,
};

const PREFIX_NAME_RULE: CharacterMatchRule = {
  score: 0.72,
  reason: 'prefix-name',
  matches: (candidate, needle) => candidate.startsWith(needle),
};

const PREFIX_ALIAS_RULE: CharacterMatchRule = {
  score: 0.68,
  reason: 'prefix-alias',
  matches: (candidate, needle) => candidate.startsWith(needle),
};

const PREFIX_SCRIPT_NAME_RULE: CharacterMatchRule = {
  score: 0.66,
  reason: 'prefix-script-name',
  matches: (candidate, needle) => candidate.startsWith(needle),
};

const CONTAINS_NAME_RULE: CharacterMatchRule = {
  score: 0.6,
  reason: 'contains-name',
  matches: (candidate, needle) => candidate.includes(needle),
};

const CONTAINS_ALIAS_RULE: CharacterMatchRule = {
  score: 0.56,
  reason: 'contains-alias',
  matches: (candidate, needle) => candidate.includes(needle),
};

const CONTAINS_SCRIPT_NAME_RULE: CharacterMatchRule = {
  score: 0.54,
  reason: 'contains-script-name',
  matches: (candidate, needle) => candidate.includes(needle),
};

export function suggestCharacterMatches(
  query: string,
  records: readonly CharacterRecord[],
  options: Pick<CreativeEntityMatchOptions, 'limit' | 'minConfidence'> = {},
): CreativeEntityMatchSuggestion<CharacterRecord>[] {
  const needle = normalizeCharacterLookupKey(query);
  if (!needle) {
    return [];
  }

  const limit = options.limit ?? DEFAULT_LIMIT;
  const minConfidence = options.minConfidence ?? 0;

  return records
    .map((record) => buildSuggestion(record, needle))
    .filter((suggestion): suggestion is CreativeEntityMatchSuggestion<CharacterRecord> => {
      return suggestion !== null && suggestion.confidence >= minConfidence;
    })
    .sort(compareSuggestions)
    .slice(0, limit);
}

function buildSuggestion(
  record: CharacterRecord,
  needle: string,
): CreativeEntityMatchSuggestion<CharacterRecord> | null {
  let bestMatch = matchValue(record.canonicalName, needle, [
    EXACT_NAME_RULE,
    PREFIX_NAME_RULE,
    CONTAINS_NAME_RULE,
  ]);

  bestMatch = pickBetter(
    bestMatch,
    matchValue(record.displayName, needle, [EXACT_NAME_RULE, PREFIX_NAME_RULE, CONTAINS_NAME_RULE]),
  );

  for (const alias of record.aliases) {
    bestMatch = pickBetter(
      bestMatch,
      matchValue(alias, needle, [EXACT_ALIAS_RULE, PREFIX_ALIAS_RULE, CONTAINS_ALIAS_RULE]),
    );
  }

  for (const scriptName of record.bindings?.scriptNames ?? []) {
    bestMatch = pickBetter(
      bestMatch,
      matchValue(scriptName, needle, [
        EXACT_SCRIPT_NAME_RULE,
        PREFIX_SCRIPT_NAME_RULE,
        CONTAINS_SCRIPT_NAME_RULE,
      ]),
    );
  }

  if (!bestMatch) {
    return null;
  }

  return {
    entity: record,
    confidence: bestMatch.confidence,
    reason: [bestMatch.reason],
    source: bestMatch.source,
  };
}

function matchValue(
  value: string | undefined,
  needle: string,
  rules: readonly CharacterMatchRule[],
): { confidence: number; reason: string; source: 'name' | 'alias' | 'rule' } | null {
  const candidate = value ? normalizeCharacterLookupKey(value) : '';
  if (!candidate) {
    return null;
  }

  for (const rule of rules) {
    if (rule.matches(candidate, needle)) {
      return {
        confidence: rule.score,
        reason: rule.reason,
        source: rule.reason.includes('alias') ? 'alias' : 'name',
      };
    }
  }

  return null;
}

function pickBetter(
  current: { confidence: number; reason: string; source: 'name' | 'alias' | 'rule' } | null,
  next: { confidence: number; reason: string; source: 'name' | 'alias' | 'rule' } | null,
): { confidence: number; reason: string; source: 'name' | 'alias' | 'rule' } | null {
  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  if (next.confidence > current.confidence) {
    return next;
  }

  if (next.confidence === current.confidence && next.reason < current.reason) {
    return next;
  }

  return current;
}

function compareSuggestions(
  left: CreativeEntityMatchSuggestion<CharacterRecord>,
  right: CreativeEntityMatchSuggestion<CharacterRecord>,
): number {
  return (
    right.confidence - left.confidence ||
    compareStatus(right.entity.status) - compareStatus(left.entity.status) ||
    left.entity.canonicalName.localeCompare(right.entity.canonicalName)
  );
}

function compareStatus(status: CharacterRecord['status']): number {
  switch (status) {
    case 'confirmed':
      return 3;
    case 'candidate':
      return 2;
    case 'deprecated':
      return 1;
  }
}
