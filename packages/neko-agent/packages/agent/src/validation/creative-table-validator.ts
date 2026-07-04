import type { ValidationError, ValidationWarning } from './types';
import { STORYBOARD_CREATIVE_TABLE_PROFILE, classifyCreativeTableHeaders } from '@neko/shared';
import {
  STORYBOARD_CREATIVE_TABLE_HEADERS,
  STORYBOARD_CREATIVE_TABLE_VALIDATOR_ID,
  resolveStoryboardCreativeTableHeader,
  type StoryboardCreativeTableHeader,
} from '@neko-agent/types';

export { STORYBOARD_CREATIVE_TABLE_HEADERS, STORYBOARD_CREATIVE_TABLE_VALIDATOR_ID };

const FORBIDDEN_STORYBOARD_HEADERS = [
  '感知卡',
  '源页',
  '页/资源',
  '页资源',
  '景别/构图',
  '镜头设计',
  '动作与节奏',
  '动作与叙事功能',
  '镜头运动',
  '声音/氛围',
  '节奏',
  '情绪/节奏',
  '动画化建议',
  '页码',
  '备注',
  '节奏/情绪',
  '分镜概览',
  'page',
  'page summary',
  'image reference',
  'analysis',
  'suggestion',
  'overview',
  'notes',
] as const;

const YAML_FRONTMATTER_RE = /^---\s*\n[\s\S]*?\n---(?:\s*\n|$)/;

const STORYBOARD_CHAT_OUTPUT_IDENTITY_FIELDS = ['scene', 'shot'] as const;
const STORYBOARD_CHAT_OUTPUT_PRODUCTION_ANCHOR_FIELDS = [
  'source',
  ...STORYBOARD_CREATIVE_TABLE_PROFILE.fields
    .filter((field) => field.promptSlot)
    .map((field) => field.id),
] as const;

export interface StoryboardCreativeTableValidationResult {
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
  readonly table?: MarkdownTableSummary;
}

export interface MarkdownTableSummary {
  readonly headerLine: number;
  readonly headers: readonly string[];
  readonly rows: readonly MarkdownTableRowSummary[];
}

export interface MarkdownTableRowSummary {
  readonly line: number;
  readonly cells: readonly string[];
}

interface StoryboardChatOutputAnchorDiagnostic {
  readonly missingAnchor: 'scene-shot' | 'source-or-prompt-slot';
  readonly fieldGroup: readonly string[];
  readonly missingFields?: readonly string[];
}

export function validateStoryboardCreativeTableOutput(
  content: string,
): StoryboardCreativeTableValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (YAML_FRONTMATTER_RE.test(content.trimStart())) {
    errors.push(
      createStoryboardTableError('storyboard-frontmatter-not-allowed', [
        'Storyboard creative table output must not include YAML frontmatter.',
        'Creation-document frontmatter is only for host/runtime persistence, not chat replies.',
      ]),
    );
  }

  const tables = extractMarkdownTables(content);
  if (tables.length === 0) {
    errors.push(
      createStoryboardTableError(
        'storyboard-table-missing',
        'Storyboard output must include one Markdown creative table.',
      ),
    );
    return { errors, warnings };
  }

  const table = findStoryboardCandidateTable(tables) ?? tables[0]!;
  const normalizedHeaders = table.headers.map(normalizeHeader);
  const fieldHeaders = table.headers.map(resolveStoryboardCreativeTableHeader);

  for (const header of FORBIDDEN_STORYBOARD_HEADERS) {
    if (normalizedHeaders.includes(normalizeHeader(header))) {
      errors.push(
        createStoryboardTableError(
          'storyboard-table-forbidden-header',
          `Storyboard creative table uses unsupported display-only header "${header}". Use a supported localized field label or stable field id.`,
          { header, headerLine: table.headerLine },
        ),
      );
    }
  }

  const classification = classifyCreativeTableHeaders(
    STORYBOARD_CREATIVE_TABLE_PROFILE,
    table.headers,
  );
  for (const group of classification.missingMinimumGroups) {
    errors.push(
      createStoryboardTableError(
        'storyboard-table-missing-minimum-field-group',
        `Storyboard creative table is missing one of the required field groups: ${group.join(', ')}.`,
        { headerLine: table.headerLine, fieldGroup: group },
      ),
    );
  }
  for (const diagnostic of getStoryboardChatOutputAnchorDiagnostics(classification)) {
    errors.push(
      createStoryboardTableError(
        'storyboard-table-missing-chat-output-anchor',
        `Storyboard creative table is missing Agent chat output anchor "${diagnostic.missingAnchor}": ${diagnostic.fieldGroup.join(', ')}.`,
        { headerLine: table.headerLine, ...diagnostic },
      ),
    );
  }

  const outOfOrder = firstOutOfOrderHeader(table.headers);
  if (outOfOrder) {
    warnings.push({
      type: 'output',
      code: 'storyboard-table-header-order',
      message: `Storyboard creative table column "${outOfOrder.header}" should appear after "${outOfOrder.previousHeader}".`,
      suggestion: `Use the canonical header order: ${STORYBOARD_CREATIVE_TABLE_HEADERS.join(', ')}`,
    });
  }

  validateStoryboardTableRows(table, fieldHeaders, errors, warnings);

  return { errors, warnings, table };
}

export function hasStoryboardCreativeTableArtifactShape(content: string): boolean {
  if (YAML_FRONTMATTER_RE.test(content.trimStart())) {
    return true;
  }

  return extractMarkdownTables(content).some((table) => {
    const resolvedHeaderCount = table.headers.filter(
      (header) => resolveStoryboardCreativeTableHeader(header) !== undefined,
    ).length;
    if (resolvedHeaderCount >= 2) {
      return true;
    }

    const normalizedHeaders = table.headers.map(normalizeHeader);
    return FORBIDDEN_STORYBOARD_HEADERS.some((header) =>
      normalizedHeaders.includes(normalizeHeader(header)),
    );
  });
}

function findStoryboardCandidateTable(
  tables: readonly MarkdownTableSummary[],
): MarkdownTableSummary | undefined {
  return (
    tables.find((table) => hasStoryboardChatOutputAnchors(table.headers)) ??
    tables.find(
      (table) =>
        classifyCreativeTableHeaders(STORYBOARD_CREATIVE_TABLE_PROFILE, table.headers)
          .matchedProfile,
    ) ??
    tables.find((table) =>
      table.headers.some((header) => resolveStoryboardCreativeTableHeader(header) !== undefined),
    )
  );
}

function hasStoryboardChatOutputAnchors(headers: readonly string[]): boolean {
  const classification = classifyCreativeTableHeaders(STORYBOARD_CREATIVE_TABLE_PROFILE, headers);
  return getStoryboardChatOutputAnchorDiagnostics(classification).length === 0;
}

function getStoryboardChatOutputAnchorDiagnostics(
  classification: ReturnType<typeof classifyCreativeTableHeaders>,
): StoryboardChatOutputAnchorDiagnostic[] {
  const knownFieldIds = new Set(classification.knownFields.map((field) => field.id));
  const diagnostics: StoryboardChatOutputAnchorDiagnostic[] = [];
  const missingIdentityFields = STORYBOARD_CHAT_OUTPUT_IDENTITY_FIELDS.filter(
    (field) => !knownFieldIds.has(field),
  );
  if (missingIdentityFields.length > 0) {
    diagnostics.push({
      missingAnchor: 'scene-shot',
      fieldGroup: STORYBOARD_CHAT_OUTPUT_IDENTITY_FIELDS,
      missingFields: missingIdentityFields,
    });
  }

  const hasProductionAnchor =
    knownFieldIds.has('source') ||
    knownFieldIds.has('prompt') ||
    classification.knownFields.some((field) => field.promptSlot);
  if (!hasProductionAnchor) {
    diagnostics.push({
      missingAnchor: 'source-or-prompt-slot',
      fieldGroup: STORYBOARD_CHAT_OUTPUT_PRODUCTION_ANCHOR_FIELDS,
    });
  }

  return diagnostics;
}

function firstOutOfOrderHeader(
  headers: readonly string[],
): { readonly header: string; readonly previousHeader: string } | null {
  const positions = new Map<StoryboardCreativeTableHeader, number>();
  headers.forEach((header, index) => {
    const field = resolveStoryboardCreativeTableHeader(header);
    if (field && !positions.has(field)) positions.set(field, index);
  });
  let previousHeader: StoryboardCreativeTableHeader = STORYBOARD_CREATIVE_TABLE_HEADERS[0];
  let previousIndex = positions.get(previousHeader);
  if (previousIndex === undefined) return null;

  for (const header of STORYBOARD_CREATIVE_TABLE_HEADERS.slice(1)) {
    const index = positions.get(header);
    if (index === undefined) return null;
    if (index < previousIndex) {
      return { header, previousHeader };
    }
    previousHeader = header;
    previousIndex = index;
  }

  return null;
}

function extractMarkdownTables(content: string): MarkdownTableSummary[] {
  const tables: MarkdownTableSummary[] = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;

  for (let index = 0; index < lines.length - 1; index++) {
    const line = lines[index] ?? '';
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const nextLine = lines[index + 1] ?? '';
    if (!looksLikeTableRow(line) || !looksLikeDividerRow(nextLine)) {
      continue;
    }

    const headers = parseTableCells(line);
    if (headers.length > 0) {
      const rows: MarkdownTableRowSummary[] = [];
      let rowIndex = index + 2;
      while (rowIndex < lines.length) {
        const rowLine = lines[rowIndex] ?? '';
        if (!looksLikeTableRow(rowLine) || looksLikeDividerRow(rowLine)) break;
        rows.push({ line: rowIndex + 1, cells: parseTableCells(rowLine) });
        rowIndex += 1;
      }
      tables.push({ headerLine: index + 1, headers, rows });
    }
  }

  return tables;
}

function validateStoryboardTableRows(
  table: MarkdownTableSummary,
  fieldHeaders: readonly (StoryboardCreativeTableHeader | undefined)[],
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  const positions = new Map<StoryboardCreativeTableHeader, number>();
  fieldHeaders.forEach((field, index) => {
    if (field && !positions.has(field)) positions.set(field, index);
  });

  for (const [field, index] of positions) {
    const descriptor = STORYBOARD_CREATIVE_TABLE_PROFILE.fields.find((item) => item.id === field);
    if (descriptor?.role !== 'execution') continue;
    for (const row of table.rows) {
      const value = row.cells[index]?.trim();
      if (!value) continue;
      errors.push(
        createStoryboardTableError(
          'storyboard-table-execution-field-not-supported',
          `Storyboard creative table row ${row.line} includes execution field "${field}", but executable actions must come from trusted Canvas lifecycle results.`,
          { field, value, line: row.line },
        ),
      );
    }
  }

  for (const row of table.rows) {
    validateKnownValueCell(row, positions, 'decision', STORYBOARD_DECISION_VALUES, errors);
    validateKnownValueCell(row, positions, 'reviewStatus', STORYBOARD_REVIEW_STATUS_VALUES, errors);
    validateKnownValueCell(row, positions, 'contentType', STORYBOARD_CONTENT_TYPE_VALUES, warnings);
    validateBooleanCell(row, positions, 'requiresSplit', errors);
    validateHumanDescriptionCell(row, positions, 'characters', errors);
    validateDurationCell(row, positions, 'duration', warnings);
    validateDurationCell(row, positions, 'sceneDuration', warnings);
  }
}

function validateKnownValueCell(
  row: MarkdownTableRowSummary,
  positions: ReadonlyMap<StoryboardCreativeTableHeader, number>,
  field: StoryboardCreativeTableHeader,
  allowedValues: ReadonlySet<string>,
  diagnostics: ValidationError[] | ValidationWarning[],
): void {
  const value = getRowFieldValue(row, positions, field);
  if (value === undefined || value.length === 0) return;
  const normalized = normalizeCellValue(value);
  if (allowedValues.has(normalized)) return;
  diagnostics.push(
    createStoryboardTableError(
      'storyboard-table-invalid-cell-value',
      `Storyboard creative table row ${row.line} has unsupported "${field}" value "${value}".`,
      { field, value, line: row.line },
    ),
  );
}

function validateDurationCell(
  row: MarkdownTableRowSummary,
  positions: ReadonlyMap<StoryboardCreativeTableHeader, number>,
  field: StoryboardCreativeTableHeader,
  warnings: ValidationWarning[],
): void {
  const value = getRowFieldValue(row, positions, field);
  if (value === undefined || value.length === 0) return;
  if (/^\d+(?:\.\d+)?\s*(?:s|秒|sec|seconds)?$/i.test(value.trim())) return;
  warnings.push({
    type: 'output',
    code: 'storyboard-table-duration-format',
    message: `Storyboard creative table row ${row.line} has a non-standard "${field}" duration "${value}".`,
    suggestion: 'Use a short duration such as 3s, 4.5s, or 30s.',
  });
}

function validateBooleanCell(
  row: MarkdownTableRowSummary,
  positions: ReadonlyMap<StoryboardCreativeTableHeader, number>,
  field: StoryboardCreativeTableHeader,
  errors: ValidationError[],
): void {
  const value = getRowFieldValue(row, positions, field);
  if (value === undefined || value.length === 0) return;
  const normalized = normalizeCellValue(value);
  if (normalized === 'true' || normalized === 'false') return;
  errors.push(
    createStoryboardTableError(
      'storyboard-table-invalid-boolean-cell',
      `Storyboard creative table row ${row.line} must use true/false for "${field}", got "${value}".`,
      { field, value, line: row.line },
    ),
  );
}

function validateHumanDescriptionCell(
  row: MarkdownTableRowSummary,
  positions: ReadonlyMap<StoryboardCreativeTableHeader, number>,
  field: StoryboardCreativeTableHeader,
  errors: ValidationError[],
): void {
  const value = getRowFieldValue(row, positions, field);
  if (value === undefined || value.length === 0) return;
  const normalized = normalizeCellValue(value);
  if (!STORYBOARD_MACHINE_PLACEHOLDER_VALUES.has(normalized)) return;
  errors.push(
    createStoryboardTableError(
      'storyboard-table-placeholder-in-wrong-column',
      `Storyboard creative table row ${row.line} places machine placeholder "${value}" in "${field}". Write the actual character/person description there.`,
      { field, value, line: row.line },
    ),
  );
}

function getRowFieldValue(
  row: MarkdownTableRowSummary,
  positions: ReadonlyMap<StoryboardCreativeTableHeader, number>,
  field: StoryboardCreativeTableHeader,
): string | undefined {
  const index = positions.get(field);
  if (index === undefined) return undefined;
  return row.cells[index]?.trim() ?? '';
}

function normalizeCellValue(value: string): string {
  return stripInlineMarkdown(value)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

function looksLikeTableRow(line: string): boolean {
  return line.includes('|') && parseTableCells(line).length > 1;
}

function looksLikeDividerRow(line: string): boolean {
  const cells = parseTableCells(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim();
  const withoutLeading = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const withoutTrailing = withoutLeading.endsWith('|')
    ? withoutLeading.slice(0, -1)
    : withoutLeading;
  return withoutTrailing.split('|').map((cell) => stripInlineMarkdown(cell.trim()));
}

function stripInlineMarkdown(value: string): string {
  return value.replace(/^`(.+)`$/, '$1').trim();
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function createStoryboardTableError(
  code: string,
  message: string | readonly string[],
  details?: Record<string, unknown>,
): ValidationError {
  return {
    type: 'output',
    code,
    message: typeof message === 'string' ? message : message.join(' '),
    ...(details ? { details } : {}),
  };
}

const STORYBOARD_DECISION_VALUES = new Set([
  'keep',
  'skip',
  'merge',
  'split',
  'duplicate',
  'reference-only',
  'skip-cover',
  'skip-ad',
  'skip-blank',
  'skip-metadata',
]);

const STORYBOARD_REVIEW_STATUS_VALUES = new Set([
  'needs-review',
  'approved',
  'rejected',
  'needs-panel-analysis',
  'needs-resource-binding',
  'needs-prompt',
  'needs-ocr',
]);

const STORYBOARD_PLAN_TOKEN_PLACEHOLDER_VALUES = new Set([
  'needs-review',
  'needs-panel-analysis',
  'needs-resource-binding',
  'needs-prompt',
  'use-as-reference',
  'use-as-style-reference',
  'split-panel',
  'split-panels',
  'crop-panel',
  'remove-text',
  'inpaint',
  'outpaint',
  'generate-image',
  'generate-video',
  'skip-cover',
  'skip',
]);

const STORYBOARD_CONTENT_TYPE_VALUES = new Set([
  'story',
  'cover',
  'reference',
  'metadata',
  'ad',
  'blank',
  'dialogue',
  'action',
]);

const STORYBOARD_MACHINE_PLACEHOLDER_VALUES = new Set([
  ...STORYBOARD_REVIEW_STATUS_VALUES,
  ...STORYBOARD_PLAN_TOKEN_PLACEHOLDER_VALUES,
  ...STORYBOARD_DECISION_VALUES,
  'true',
  'false',
]);
