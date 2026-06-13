import type {
  ArtifactJsonValue,
  CharacterMemoryJsonRecord,
  CharacterMemorySourceRef,
  CharacterObservation,
  ContributionDiagnostic,
  CreativeEntityCandidate,
  CreativeEntityCandidateIdentityBasis,
  EntityMemoryContribution,
} from '@neko/shared';
import { isEntityMemoryContribution } from '@neko/shared';
import type { CompositeBlockData, CompositeSection } from '@neko-agent/types';

interface CharacterAnalysisRow {
  readonly sectionIndex: number;
  readonly rowIndex: number;
  readonly heading: string;
  readonly name: string;
  readonly observation: string;
}

interface MarkdownTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

const ENTITY_MEMORY_CONTRIBUTION_EXTENSION_KEYS = [
  'neko.entityMemoryContribution',
  'neko.entityMemoryContributionPayload',
] as const;

const CHARACTER_ANALYSIS_HEADING_PATTERN =
  /(?:主要角色观察|角色与关系变化|角色分析|人物观察|人物关系变化|character\s+observations?|character\s+(?:and\s+)?relationship\s+changes?)/iu;

const CHARACTER_HEADER_PATTERN = /^(?:角色|人物|character|name)$/iu;

const OBSERVATION_HEADER_PATTERN =
  /(?:观察|变化|新增|证据|描述|关系|observation|change|evidence|notes?)/iu;

const NON_ENTITY_NAME_PATTERN =
  /(?:[、,，/／]|众人|群众|人群|旁观者|路人|家人|父母|村民|士兵们|怪物们|characters?|group|crowd|people|family|extras?)/iu;

const GENERIC_ROLE_NAME_PATTERN =
  /^(?:父亲|母亲|爸爸|妈妈|哥哥|姐姐|弟弟|妹妹|孩子|小孩|男孩|女孩|少年|少女|男人|女人|老人|老师|国王|王后|商贾|守卫|士兵|怪物|角色|人物|character|boy|girl|man|woman|mother|father|guard|soldier|monster)$/iu;

const DEFAULT_CONFIDENCE = 0.62;

export function inferEntityMemoryContributionFromCharacterAnalysis(
  composite: CompositeBlockData,
): EntityMemoryContribution | undefined {
  if (findProjectedEntityMemoryContribution(composite)) return undefined;

  const rows = collectCharacterAnalysisRows(composite.sections);
  if (rows.length === 0) return undefined;

  const sourceRef = createInferenceSourceRef(composite);
  const candidates: CreativeEntityCandidate[] = [];
  const observations: CharacterObservation[] = [];
  const diagnostics: ContributionDiagnostic[] = [];
  const candidateIdsByName = new Map<string, string>();

  rows.forEach((row, index) => {
    const normalizedName = normalizeEntityName(row.name);
    if (!normalizedName || isLikelyNonEntityName(normalizedName)) {
      diagnostics.push({
        severity: 'warning',
        code: 'character-analysis-row-not-entity',
        message:
          'A character analysis row names a group or ambiguous identity and was not promoted to an entity candidate.',
        path: ['sections', row.sectionIndex, 'rows', row.rowIndex, 'name'],
        sourceRef,
        details: {
          name: row.name,
          heading: row.heading,
        },
      });
      return;
    }

    const candidateId =
      candidateIdsByName.get(normalizedName) ??
      `candidate-character-analysis-${slugifyIdentifier(normalizedName)}`;
    candidateIdsByName.set(normalizedName, candidateId);

    if (!candidates.some((candidate) => candidate.id === candidateId)) {
      const identityBasis = inferIdentityBasis(normalizedName);
      candidates.push({
        id: candidateId,
        kind: 'character',
        name: normalizedName,
        status: 'open',
        identityBasis,
        confidence: DEFAULT_CONFIDENCE,
        provenance: [
          {
            providerId: 'neko-agent',
            sourceKind: 'agent',
            sourceRef: `character-analysis:${row.sectionIndex}:${row.rowIndex}`,
            label: normalizedName,
            confidence: DEFAULT_CONFIDENCE,
            metadata: {
              inferredFrom: 'character-analysis-table',
              heading: row.heading,
              sectionIndex: row.sectionIndex,
              rowIndex: row.rowIndex,
            },
          },
        ],
        sourceRefs: [`character-analysis:${row.sectionIndex}:${row.rowIndex}`],
        metadata: {
          inferredFrom: 'character-analysis-table',
          identityBasisReason:
            identityBasis === 'user-named'
              ? 'explicit-character-analysis-name'
              : 'descriptive-character-analysis-label',
        },
      });
    }

    const mapping: CharacterMemoryJsonRecord = {
      inferredFrom: 'character-analysis-table',
      heading: row.heading,
      sectionIndex: row.sectionIndex,
      rowIndex: row.rowIndex,
      characterName: normalizedName,
    };
    observations.push({
      observationId: `obs-character-analysis-${slugifyIdentifier(normalizedName)}-${index + 1}`,
      sourceRef,
      provenance: {
        source: 'agent',
        providerId: 'neko-agent',
        metadata: mapping,
      },
      reviewStatus: 'needs-review',
      candidateId,
      candidate: {
        id: candidateId,
        kind: 'character',
        name: normalizedName,
        confidence: DEFAULT_CONFIDENCE,
      },
      mention: {
        mentionId: `mention-character-analysis-${slugifyIdentifier(normalizedName)}-${index + 1}`,
        kind: 'manual',
        candidateId,
        candidateName: normalizedName,
        confidence: DEFAULT_CONFIDENCE,
        sourceRef,
        metadata: mapping,
      },
      dimensions: [
        {
          dimension: inferObservationDimension(row.observation),
          value: row.observation,
          confidence: DEFAULT_CONFIDENCE,
          sourceRef,
          extensions: {
            'neko.characterAnalysisInference': mapping,
          },
        },
      ],
      confidence: DEFAULT_CONFIDENCE,
      extensions: {
        'neko.characterAnalysisInference': mapping,
      },
    });
  });

  if (candidates.length === 0 && observations.length === 0 && diagnostics.length === 0) {
    return undefined;
  }

  const contribution: EntityMemoryContribution = {
    contributionId: `character-analysis-${slugifyIdentifier(composite.title ?? 'composite')}`,
    sourcePackage: 'neko-agent',
    sourceRef,
    reviewPolicy: 'requires-user-review',
    ...(candidates.length > 0 ? { entityCandidates: candidates } : {}),
    ...(observations.length > 0 ? { characterObservations: observations } : {}),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    metadata: {
      inferredFrom: 'character-analysis-table',
      source: 'agent-runtime-composite-projection',
      rowCount: rows.length,
    },
  };

  return isEntityMemoryContribution(contribution) ? contribution : undefined;
}

export function maybeAttachInferredEntityMemoryContribution(
  composite: CompositeBlockData,
): CompositeBlockData {
  if (findProjectedEntityMemoryContribution(composite)) return composite;

  const contribution = inferEntityMemoryContributionFromCharacterAnalysis(composite);
  if (!contribution) return composite;

  return {
    ...composite,
    extensions: {
      ...(composite.extensions ?? {}),
      'neko.entityMemoryContributionPayload': toArtifactJsonValue(contribution),
    },
  };
}

export function findProjectedEntityMemoryContribution(
  composite: CompositeBlockData,
): EntityMemoryContribution | undefined {
  const candidates: readonly unknown[] = [
    composite.extensions?.['neko.entityMemoryContribution'],
    composite.extensions?.['neko.entityMemoryContributionPayload'],
    ...composite.sections.flatMap((section) => [
      section.extensions?.['neko.entityMemoryContribution'],
      section.extensions?.['neko.entityMemoryContributionPayload'],
    ]),
  ];
  return candidates.find((candidate): candidate is EntityMemoryContribution =>
    isEntityMemoryContribution(candidate),
  );
}

function collectCharacterAnalysisRows(
  sections: readonly CompositeSection[],
): readonly CharacterAnalysisRow[] {
  const rows: CharacterAnalysisRow[] = [];
  sections.forEach((section, sectionIndex) => {
    const heading = section.heading?.trim() ?? '';
    const content = section.content ?? '';
    if (!CHARACTER_ANALYSIS_HEADING_PATTERN.test(`${heading}\n${content}`)) return;

    const table = parseFirstMarkdownTable(content);
    if (!table) return;

    const characterColumnIndex = table.headers.findIndex((header) =>
      CHARACTER_HEADER_PATTERN.test(normalizeHeader(header)),
    );
    const observationColumnIndex = table.headers.findIndex((header, index) => {
      if (index === characterColumnIndex) return false;
      return OBSERVATION_HEADER_PATTERN.test(normalizeHeader(header));
    });
    if (characterColumnIndex < 0 || observationColumnIndex < 0) return;

    table.rows.forEach((cells, rowIndex) => {
      const name = cleanupMarkdownCell(cells[characterColumnIndex] ?? '');
      const observation = cleanupMarkdownCell(cells[observationColumnIndex] ?? '');
      if (!name || !observation) return;
      rows.push({
        sectionIndex,
        rowIndex,
        heading: heading || 'Character Analysis',
        name,
        observation,
      });
    });
  });
  return rows;
}

function parseFirstMarkdownTable(markdown: string): MarkdownTable | undefined {
  const lines = markdown
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = lines[index];
    const separator = lines[index + 1];
    if (!header?.includes('|') || !isMarkdownTableSeparator(separator)) continue;

    const headers = splitMarkdownTableRow(header).map(cleanupMarkdownCell);
    if (headers.length < 2) continue;

    const rows: string[][] = [];
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const line = lines[rowIndex];
      if (!line?.includes('|') || isMarkdownTableSeparator(line)) break;
      const cells = splitMarkdownTableRow(line).map(cleanupMarkdownCell);
      if (cells.length === headers.length) rows.push(cells);
    }

    if (rows.length > 0) return { headers, rows };
  }

  return undefined;
}

function splitMarkdownTableRow(line: string): readonly string[] {
  const trimmed = line.trim().replace(/^\|/u, '').replace(/\|$/u, '');
  return trimmed.split('|');
}

function isMarkdownTableSeparator(line: string | undefined): boolean {
  if (!line) return false;
  const cells = splitMarkdownTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell.trim()));
}

function normalizeHeader(value: string): string {
  return cleanupMarkdownCell(value).replace(/\s+/gu, ' ').trim();
}

function cleanupMarkdownCell(value: string): string {
  return value
    .replace(/<br\s*\/?>/giu, ' ')
    .replace(/\*\*(.*?)\*\*/gu, '$1')
    .replace(/__(.*?)__/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/\[(.*?)\]\([^)]*\)/gu, '$1')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeEntityName(value: string): string {
  return cleanupMarkdownCell(value)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, '')
    .replace(/[：:]\s*$/u, '')
    .trim();
}

function isLikelyNonEntityName(name: string): boolean {
  return NON_ENTITY_NAME_PATTERN.test(name) || name.length > 40;
}

function inferIdentityBasis(name: string): CreativeEntityCandidateIdentityBasis {
  if (
    /[A-Za-z\u4e00-\u9fff]/u.test(name) &&
    !GENERIC_ROLE_NAME_PATTERN.test(name) &&
    !/(?:少年|少女|男人|女人|角色|人物|character)$/iu.test(name)
  ) {
    return 'user-named';
  }
  return 'visual';
}

function inferObservationDimension(
  observation: string,
): CharacterObservation['dimensions'][number]['dimension'] {
  if (/(?:关系|互动|relationship|ally|friend|enemy|with\b)/iu.test(observation)) {
    return 'relationship';
  }
  if (
    /(?:外观|服装|发型|颜色|发色|头发|围巾|衣|帽|鞋|红色|蓝色|黑色|白色|金色|appearance|outfit|hair|wearing|looks?)/iu.test(
      observation,
    )
  ) {
    return 'appearance';
  }
  if (
    /(?:情绪|表情|害怕|愤怒|高兴|emotion|expression|angry|afraid|happy|sad)/iu.test(observation)
  ) {
    return 'emotion';
  }
  if (/(?:行动|动作|跑|走|举起|攻击|action|runs?|walks?|holds?|attacks?)/iu.test(observation)) {
    return 'action';
  }
  return 'continuity';
}

function createInferenceSourceRef(composite: CompositeBlockData): CharacterMemorySourceRef {
  return {
    kind: 'manual',
    label: composite.title
      ? `Agent character analysis: ${composite.title}`
      : 'Agent character analysis',
  };
}

function toArtifactJsonValue(value: unknown): ArtifactJsonValue {
  if (isArtifactJsonPrimitive(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toArtifactJsonValue(item));
  }
  if (isRecord(value)) {
    const record: Record<string, ArtifactJsonValue> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      if (entryValue !== undefined) {
        record[key] = toArtifactJsonValue(entryValue);
      }
    }
    return record;
  }
  return null;
}

function isArtifactJsonPrimitive(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slugifyIdentifier(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  if (ascii) return ascii.slice(0, 64);
  const encoded = Array.from(value.trim())
    .map((char) => char.codePointAt(0)?.toString(36) ?? '')
    .filter(Boolean)
    .join('-');
  return (encoded || 'unknown').slice(0, 64);
}
