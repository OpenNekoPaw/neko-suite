export type ParsedFrontmatterValue = string | string[];

export interface ParsedMarkdownArtifact {
  readonly frontmatter: Readonly<Record<string, ParsedFrontmatterValue>>;
  readonly body: string;
}

export function parseMarkdownArtifact(content: string): ParsedMarkdownArtifact {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(content);
  if (!match) {
    if (!content.startsWith('---')) {
      throw new Error('Artifact markdown is missing a YAML frontmatter block');
    }
    throw new Error('Artifact markdown frontmatter is missing a closing fence');
  }

  return {
    frontmatter: Object.freeze(parseFrontmatter(match[1] ?? '')),
    body: match[2] ?? '',
  };
}

export function getFrontmatterString(
  frontmatter: Readonly<Record<string, ParsedFrontmatterValue>>,
  key: string,
): string | undefined {
  const value = frontmatter[key];
  return typeof value === 'string' ? value : undefined;
}

export function getFrontmatterStringList(
  frontmatter: Readonly<Record<string, ParsedFrontmatterValue>>,
  key: string,
): readonly string[] | undefined {
  const value = frontmatter[key];
  return Array.isArray(value) ? [...value] : undefined;
}

export function parseRequiredTimestamp(raw: string | undefined, field: string): number {
  if (!raw) {
    throw new Error(`Artifact markdown is missing required timestamp "${field}"`);
  }

  const value = Date.parse(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Artifact markdown has invalid timestamp "${field}": ${raw}`);
  }
  return value;
}

export function collectMarkdownSections(
  markdown: string,
  headingLevel: 2 | 3,
): ReadonlyMap<string, string> {
  const lines = markdown.split(/\r?\n/);
  const prefix = '#'.repeat(headingLevel);
  const sections = new Map<string, string>();
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  const flush = (): void => {
    if (currentHeading === null) {
      return;
    }
    sections.set(currentHeading, trimTrailingBlankLines(currentLines).join('\n').trim());
  };

  for (const line of lines) {
    if (line.startsWith(`${prefix} `)) {
      flush();
      currentHeading = line.slice(prefix.length + 1).trim();
      currentLines = [];
      continue;
    }

    if (currentHeading !== null) {
      currentLines.push(line);
    }
  }

  flush();
  return sections;
}

function parseFrontmatter(source: string): Record<string, ParsedFrontmatterValue> {
  const lines = source.split(/\r?\n/);
  const parsed: Record<string, ParsedFrontmatterValue> = {};
  let activeListKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      if (!activeListKey) {
        throw new Error(`Artifact markdown contains a list item without a parent key: ${trimmed}`);
      }
      const current = parsed[activeListKey];
      if (!Array.isArray(current)) {
        throw new Error(`Artifact markdown list key "${activeListKey}" is not an array`);
      }
      current.push(unquote(trimmed.replace(/^\s*-\s+/, '')));
      continue;
    }

    activeListKey = null;
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Artifact markdown frontmatter line is missing ":" separator: ${trimmed}`);
    }

    const key = line.slice(0, colonIndex).trim();
    const rawValue = line.slice(colonIndex + 1).trim();
    if (!key) {
      throw new Error(`Artifact markdown frontmatter has an empty key: ${trimmed}`);
    }

    if (rawValue.length === 0) {
      parsed[key] = [];
      activeListKey = key;
      continue;
    }

    parsed[key] = unquote(rawValue);
  }

  return parsed;
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function trimTrailingBlankLines(lines: readonly string[]): string[] {
  const trimmed = [...lines];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1]?.trim() === '') {
    trimmed.pop();
  }
  return trimmed;
}
