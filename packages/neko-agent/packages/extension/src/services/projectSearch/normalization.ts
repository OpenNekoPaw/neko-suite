import type {
  ProjectNormalizedSearchQuery,
  ProjectSearchItem,
  ProjectSearchQuery,
} from '@neko/shared';

export function normalizeProjectSearchQuery(text: string): ProjectNormalizedSearchQuery {
  const normalized = normalizeSearchText(text);
  return {
    raw: text,
    normalized,
    tokens: normalized ? normalized.split(' ').filter(Boolean) : [],
  };
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_\-./\\:()[\]{}'"`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildProjectSearchText(
  parts: readonly (string | undefined | readonly string[])[],
): string {
  const flattened: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (typeof part === 'string') {
      flattened.push(part);
    } else {
      flattened.push(...part.filter(Boolean));
    }
  }
  return flattened.join(' ');
}

export function matchesProjectSearchItem(
  item: ProjectSearchItem,
  query: ProjectSearchQuery,
): boolean {
  const normalized = normalizeProjectSearchQuery(query.text);
  if (!normalized.normalized) return true;

  const haystack = normalizeSearchText(
    buildProjectSearchText([
      item.label,
      item.description,
      item.canonicalName,
      item.aliases,
      item.filePath,
      item.source.sourceId,
      item.source.sourceKind,
      item.source.refId,
      item.source.filePath,
      item.searchText,
    ]),
  );

  return normalized.tokens.every((token) => haystack.includes(token));
}

export function rankProjectSearchItems(
  items: readonly ProjectSearchItem[],
  query: ProjectSearchQuery,
): ProjectSearchItem[] {
  const normalized = normalizeProjectSearchQuery(query.text);
  return [...items]
    .map((item, index) => ({ item, index, score: scoreProjectSearchItem(item, normalized) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

function scoreProjectSearchItem(
  item: ProjectSearchItem,
  query: ProjectNormalizedSearchQuery,
): number {
  let score = item.scoreHints?.priority ?? 0;
  const label = normalizeSearchText(item.label);
  const canonicalName = normalizeSearchText(item.canonicalName ?? '');
  const aliases = (item.aliases ?? []).map(normalizeSearchText);
  const searchText = normalizeSearchText(item.searchText);

  if (!query.normalized) return score;
  if (label === query.normalized) score += 100;
  if (canonicalName === query.normalized) score += 95;
  if (aliases.includes(query.normalized)) score += 90;
  if (label.startsWith(query.normalized)) score += 60;
  if (canonicalName.startsWith(query.normalized)) score += 55;
  if (searchText.includes(query.normalized)) score += 20;
  if (item.scoreHints?.exact) score += 15;
  if (item.scoreHints?.currentProject) score += 5;

  return score;
}
