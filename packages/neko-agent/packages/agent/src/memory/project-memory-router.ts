import type { IProjectMemoryManager, KeyFact } from '@neko/shared';

export interface RoutedProjectMemoryFact {
  id: string;
  content: string;
  category: KeyFact['category'];
  confidence: number;
  destination: 'project';
  section: string;
}

export interface ProjectMemoryRoutingResult {
  facts: RoutedProjectMemoryFact[];
  writtenFacts: RoutedProjectMemoryFact[];
  dedupedFacts: RoutedProjectMemoryFact[];
}

interface MemorySection {
  key: string;
  body: string;
}

const SECTION_BY_CATEGORY: Record<KeyFact['category'], string> = {
  preference: 'User Preferences',
  decision: 'Recent Decisions',
  context: 'Project Context',
  action: 'Recent Actions',
};

export class ProjectMemoryRouter {
  constructor(private readonly _projectMemory: IProjectMemoryManager) {}

  async writeFacts(facts: readonly KeyFact[]): Promise<ProjectMemoryRoutingResult> {
    if (facts.length === 0) {
      return { facts: [], writtenFacts: [], dedupedFacts: [] };
    }

    const routedFacts = facts.map((fact, index) => this._toRoutedFact(fact, index));
    const groupedFacts = new Map<string, RoutedProjectMemoryFact[]>();

    for (const fact of routedFacts) {
      const group = groupedFacts.get(fact.section);
      if (group) {
        group.push(fact);
      } else {
        groupedFacts.set(fact.section, [fact]);
      }
    }

    const writtenFacts: RoutedProjectMemoryFact[] = [];
    const dedupedFacts: RoutedProjectMemoryFact[] = [];
    const sections = new Map(
      parseSections(this._projectMemory.getContent()).map((section) => [section.key, section.body]),
    );

    for (const [section, sectionFacts] of groupedFacts) {
      const existingBody = sections.get(section) ?? '';
      const knownEntries = collectNormalizedEntries(existingBody);
      const nextBulletLines: string[] = [];

      for (const fact of sectionFacts) {
        const signatures = collectMemorySignatures(fact.content);
        if (
          signatures.size === 0 ||
          [...signatures].some((signature) => knownEntries.has(signature))
        ) {
          dedupedFacts.push(fact);
          continue;
        }

        for (const signature of signatures) {
          knownEntries.add(signature);
        }
        nextBulletLines.push(`- ${stripBulletPrefix(fact.content)}`);
        writtenFacts.push(fact);
      }

      if (nextBulletLines.length === 0) {
        continue;
      }

      const nextBody = appendBulletLines(existingBody, nextBulletLines);
      await this._projectMemory.upsertEntry(section, nextBody);
      sections.set(section, nextBody);
    }

    return {
      facts: routedFacts,
      writtenFacts,
      dedupedFacts,
    };
  }

  private _toRoutedFact(fact: KeyFact, index: number): RoutedProjectMemoryFact {
    return {
      id: createProjectMemoryFactId(fact, index),
      content: stripBulletPrefix(fact.content),
      category: fact.category,
      confidence: fact.confidence,
      destination: 'project',
      section: SECTION_BY_CATEGORY[fact.category],
    };
  }
}

function parseSections(content: string | null): MemorySection[] {
  if (!content) return [];

  const lines = content.split('\n');
  const sections: MemorySection[] = [];
  let currentKey: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentKey !== null) {
        sections.push({ key: currentKey, body: currentLines.join('\n') });
      }
      currentKey = line.slice(3).trim();
      currentLines = [];
      continue;
    }

    if (currentKey !== null) {
      currentLines.push(line);
    }
  }

  if (currentKey !== null) {
    sections.push({ key: currentKey, body: currentLines.join('\n') });
  }

  return sections;
}

function collectNormalizedEntries(body: string): Set<string> {
  const entries = new Set<string>();
  for (const line of body.split('\n')) {
    for (const signature of collectMemorySignatures(line)) {
      entries.add(signature);
    }
  }
  return entries;
}

function appendBulletLines(body: string, bulletLines: readonly string[]): string {
  const trimmed = body.trimEnd();
  if (trimmed.length === 0) {
    return bulletLines.join('\n');
  }

  return `${trimmed}\n${bulletLines.join('\n')}`;
}

function normalizeMemoryEntry(input: string): string {
  return stripBulletPrefix(input).toLowerCase().replace(/\s+/g, ' ').trim();
}

function collectMemorySignatures(input: string): Set<string> {
  const normalized = normalizeMemoryEntry(input);
  const signatures = new Set<string>();

  if (!normalized) {
    return signatures;
  }

  signatures.add(`exact:${normalized}`);

  const semantic = createSemanticSignature(normalized);
  if (semantic) {
    signatures.add(`semantic:${semantic}`);
  }

  return signatures;
}

function createSemanticSignature(normalized: string): string | null {
  const tokens = normalized.match(/[a-z0-9]+/g);
  if (!tokens || tokens.length === 0) {
    return null;
  }

  const normalizedTokens = tokens
    .map((token) => normalizeEnglishToken(token))
    .filter((token) => token.length > 1 && !ENGLISH_MEMORY_STOPWORDS.has(token));

  if (normalizedTokens.length < 2) {
    return null;
  }

  return [...new Set(normalizedTokens)].sort().join('|');
}

function normalizeEnglishToken(token: string): string {
  if (ENGLISH_MEMORY_STEMS.has(token)) {
    return ENGLISH_MEMORY_STEMS.get(token)!;
  }

  if (token.endsWith("'s")) {
    token = token.slice(0, -2);
  }

  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith('ing') && token.length > 5) {
    return token.slice(0, -3);
  }

  if (token.endsWith('ed') && token.length > 4) {
    return token.slice(0, -2);
  }

  if (token.endsWith('es') && token.length > 4) {
    return token.slice(0, -2);
  }

  if (token.endsWith('s') && token.length > 3) {
    return token.slice(0, -1);
  }

  return token;
}

const ENGLISH_MEMORY_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'with',
]);

const ENGLISH_MEMORY_STEMS = new Map<string, string>([
  ['preference', 'prefer'],
  ['preferences', 'prefer'],
  ['preferred', 'prefer'],
  ['prefers', 'prefer'],
  ['user', 'user'],
  ['users', 'user'],
]);

function stripBulletPrefix(input: string): string {
  return input.replace(/^[-*+]\s+/, '').trim();
}

function createProjectMemoryFactId(fact: KeyFact, index: number): string {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  const digest = crypto
    .createHash('sha1')
    .update(`${fact.category}\u0000${fact.content}\u0000${index}`)
    .digest('hex')
    .slice(0, 12);

  return `pmf-${digest}`;
}
