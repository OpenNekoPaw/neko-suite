export type NekoMarkdownDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface NekoMarkdownSourceRange {
  readonly start: number;
  readonly end: number;
}

export interface NekoMarkdownDiagnostic {
  readonly severity: NekoMarkdownDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly token?: string;
  readonly range?: NekoMarkdownSourceRange;
}

export interface NekoMarkdownCommonMarkImageReference {
  readonly kind: 'commonmark-image';
  readonly altText: string;
  readonly rawTarget: string;
  readonly lookupToken: string;
  readonly placementHint?: string;
  readonly range: NekoMarkdownSourceRange;
}

export interface NekoMarkdownMentionToken {
  readonly kind: 'mention';
  readonly raw: string;
  readonly label: string;
  readonly status: NekoMarkdownReferenceStatus;
  readonly ref?: NekoMarkdownStableRef;
  readonly candidates: readonly NekoMarkdownStableRef[];
  readonly range: NekoMarkdownSourceRange;
}

export interface NekoMarkdownResourceReferenceToken {
  readonly kind: 'resource-reference';
  readonly embed: boolean;
  readonly raw: string;
  readonly target: string;
  readonly lookupToken: string;
  readonly status: NekoMarkdownReferenceStatus;
  readonly ref?: NekoMarkdownStableRef;
  readonly candidates: readonly NekoMarkdownStableRef[];
  readonly placementHint?: string;
  readonly range: NekoMarkdownSourceRange;
}

export interface NekoMarkdownCreativeTableProjection {
  readonly kind: 'creative-table';
  readonly range: NekoMarkdownSourceRange;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly unknownColumns: readonly string[];
}

export interface NekoMarkdownSemanticPromptSpan {
  readonly kind: string;
  readonly range: NekoMarkdownSourceRange;
  readonly fieldId?: string;
  readonly label?: string;
  readonly ref?: NekoMarkdownStableRef;
  readonly tone?: string;
  readonly tooltip?: string;
}

export type NekoMarkdownGenerationPromptPartKind =
  | 'intent'
  | 'reference'
  | 'operation'
  | 'camera'
  | 'dialogue'
  | 'constraint'
  | 'detail';

export interface NekoMarkdownGenerationPromptPart {
  readonly kind: NekoMarkdownGenerationPromptPartKind;
  readonly text: string;
}

export interface NekoMarkdownStableRef {
  readonly kind: string;
  readonly id: string;
  readonly namespace?: string;
}

export interface NekoMarkdownCanvasHandoffRef {
  readonly source: 'markdown';
  readonly ref: NekoMarkdownStableRef;
  readonly token: string;
  readonly placementHint?: string;
}

export type NekoMarkdownReferenceStatus = 'unresolved' | 'ambiguous' | 'resolved';

export interface NekoMarkdownMentionLookup {
  readonly label: string;
  readonly raw: string;
  readonly range: NekoMarkdownSourceRange;
}

export interface NekoMarkdownMentionResolution {
  readonly status: NekoMarkdownReferenceStatus;
  readonly ref?: NekoMarkdownStableRef;
  readonly candidates?: readonly NekoMarkdownStableRef[];
}

export interface NekoMarkdownMentionResolver {
  resolveMention(mention: NekoMarkdownMentionLookup): NekoMarkdownMentionResolution | undefined;
}

export interface NekoMarkdownResourceLookup {
  readonly target: string;
  readonly lookupToken: string;
  readonly placementHint?: string;
  readonly embed: boolean;
  readonly range: NekoMarkdownSourceRange;
}

export interface NekoMarkdownResourceResolution {
  readonly status: NekoMarkdownReferenceStatus;
  readonly ref?: NekoMarkdownStableRef;
  readonly candidates?: readonly NekoMarkdownStableRef[];
}

export interface NekoMarkdownResourceResolver {
  resolveResource(resource: NekoMarkdownResourceLookup): NekoMarkdownResourceResolution | undefined;
}

export interface NekoMarkdownCommonMarkImageLookup {
  readonly altText: string;
  readonly rawTarget: string;
  readonly lookupToken: string;
  readonly placementHint?: string;
  readonly range: NekoMarkdownSourceRange;
}

export interface NekoMarkdownCommonMarkImageResolution {
  readonly status: NekoMarkdownReferenceStatus;
  readonly ref?: NekoMarkdownStableRef;
  readonly renderUri?: string;
  readonly candidates?: readonly NekoMarkdownStableRef[];
}

export interface NekoMarkdownCommonMarkImageResolver {
  resolveCommonMarkImage(
    image: NekoMarkdownCommonMarkImageLookup,
  ): NekoMarkdownCommonMarkImageResolution | undefined;
}

export interface NekoMarkdownSemanticPromptSpanResolution {
  readonly status: NekoMarkdownReferenceStatus;
  readonly ref?: NekoMarkdownStableRef;
  readonly diagnostics?: readonly NekoMarkdownDiagnostic[];
}

export interface NekoMarkdownSemanticPromptSpanResolver {
  resolvePromptSpan(
    span: NekoMarkdownSemanticPromptSpan,
  ): NekoMarkdownSemanticPromptSpanResolution | undefined;
}

export interface NekoMarkdownRenderAdapter<TRendered = unknown> {
  renderProjection(projection: NekoMarkdownExtensionProjection): TRendered;
}

export interface NekoMarkdownExtensionProjection {
  readonly source: string;
  readonly images: readonly NekoMarkdownCommonMarkImageReference[];
  readonly mentions: readonly NekoMarkdownMentionToken[];
  readonly resourceReferences: readonly NekoMarkdownResourceReferenceToken[];
  readonly creativeTables: readonly NekoMarkdownCreativeTableProjection[];
  readonly promptSpans: readonly NekoMarkdownSemanticPromptSpan[];
  readonly diagnostics: readonly NekoMarkdownDiagnostic[];
  readonly handoffRefs: readonly NekoMarkdownCanvasHandoffRef[];
}

export interface NekoMarkdownProjectOptions {
  readonly resourceReferences?: 'disabled' | 'enabled';
  readonly promptSpans?: readonly NekoMarkdownSemanticPromptSpan[];
  readonly creativeTableKnownColumns?: readonly string[];
  readonly mentionResolver?: NekoMarkdownMentionResolver;
  readonly resourceResolver?: NekoMarkdownResourceResolver;
  readonly commonMarkImageResolver?: NekoMarkdownCommonMarkImageResolver;
  readonly promptSpanResolver?: NekoMarkdownSemanticPromptSpanResolver;
  readonly requireResolvedReferences?: boolean;
}

export interface NekoMarkdownPlacementTarget {
  readonly lookupToken: string;
  readonly placementHint?: string;
}

const COMMONMARK_IMAGE_RE = /!\[([^\]]*)]\(([^)]+)\)/g;
const RESOURCE_REFERENCE_RE = /(!?)\[\[([^\]]+)]]/g;
const MENTION_RE = /(^|[^\p{L}\p{N}_./-])@([\p{L}\p{N}_.-]{1,80})/gu;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;

export function projectNekoMarkdownExtensions(
  markdown: string,
  options: NekoMarkdownProjectOptions = {},
): NekoMarkdownExtensionProjection {
  const images = extractCommonMarkImageReferences(markdown);
  const resourceReferences = extractResourceReferences(markdown, options);
  const mentions = extractMentions(markdown, options);
  const diagnostics = [
    ...diagnoseResourceReferences(resourceReferences, options),
    ...diagnoseMentions(mentions, options),
  ];
  return {
    source: markdown,
    images,
    mentions,
    resourceReferences,
    creativeTables: extractCreativeTables(markdown, options),
    promptSpans: options.promptSpans ?? [],
    diagnostics,
    handoffRefs: [
      ...mentions.flatMap((mention) =>
        mention.status === 'resolved' && mention.ref
          ? [{ source: 'markdown' as const, ref: mention.ref, token: mention.raw }]
          : [],
      ),
      ...resourceReferences.flatMap((reference) =>
        reference.status === 'resolved' && reference.ref
          ? [
              {
                source: 'markdown' as const,
                ref: reference.ref,
                token: reference.raw,
                ...(reference.placementHint ? { placementHint: reference.placementHint } : {}),
              },
            ]
          : [],
      ),
    ],
  };
}

export function normalizeMarkdownResourceLookupToken(value: string): string {
  return stripMarkdownPlacementHint(stripMarkdownToken(value))
    .lookupToken.trim()
    .toLowerCase()
    .replace(/[/|、，,]+/g, '_')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function projectNekoMarkdownGenerationPromptParts(
  value: string,
): readonly NekoMarkdownGenerationPromptPart[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const intentMatch = /^([^：:]{2,32})[：:]\s*(.*)$/u.exec(trimmed);
  const parts: NekoMarkdownGenerationPromptPart[] = [];
  const body = intentMatch?.[2]?.trim() ?? trimmed;
  const intent = intentMatch?.[1]?.trim();
  if (intent) {
    parts.push({ kind: 'intent', text: intent });
  }

  const chunks = body
    .split(/[。；;，,]/u)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  for (const chunk of chunks.length > 0 ? chunks : [body]) {
    parts.push({
      kind: classifyNekoMarkdownGenerationPromptPart(chunk),
      text: chunk,
    });
  }
  return parts;
}

export function classifyNekoMarkdownGenerationPromptPart(
  value: string,
): NekoMarkdownGenerationPromptPartKind {
  const lower = value.toLocaleLowerCase();
  if (
    /(^|\s)(p\d+(?:#panel_\d+)?|page_\d+(?:#panel_\d+)?)(\s|$)/iu.test(value) ||
    /参考|来源|reference|source/u.test(lower)
  ) {
    return 'reference';
  }
  if (
    /裁切|切分|旋转|校正|上色|去字|去文字|去除|清理|补全|遮挡|重绘|修复|扩图|放大|统一风格|crop|split|rotate|correct|colori[sz]e|remove|clean|inpaint|outpaint|redraw|repair|upscale|normalize/u.test(
      lower,
    )
  ) {
    return 'operation';
  }
  if (
    /镜头|运镜|推近|推远|下移|上移|横移|摇镜|特写|视差|camera|dolly|pan|tilt|zoom|push-in|pull-back/u.test(
      lower,
    )
  ) {
    return 'camera';
  }
  if (/对白|台词|无对白|旁白|dialogue|voice|silence|no dialogue/u.test(lower)) {
    return 'dialogue';
  }
  if (
    /保持|保留|不新增|不要|一致|约束|preserve|keep|consistent|constraint|do not|without adding/u.test(
      lower,
    )
  ) {
    return 'constraint';
  }
  return 'detail';
}

export function stripMarkdownPlacementHint(value: string): NekoMarkdownPlacementTarget {
  const token = stripMarkdownToken(value);
  const fragmentStart = token.indexOf('#');
  if (fragmentStart < 0) return { lookupToken: token };
  const lookupToken = token.slice(0, fragmentStart);
  const placementHint = token.slice(fragmentStart + 1);
  return placementHint.length > 0 ? { lookupToken, placementHint } : { lookupToken };
}

function extractCommonMarkImageReferences(
  markdown: string,
): readonly NekoMarkdownCommonMarkImageReference[] {
  return Array.from(markdown.matchAll(COMMONMARK_IMAGE_RE)).map((match) => {
    const rawTarget = match[2] ?? '';
    const placementTarget = stripMarkdownPlacementHint(rawTarget);
    return {
      kind: 'commonmark-image',
      altText: match[1] ?? '',
      rawTarget,
      lookupToken: placementTarget.lookupToken,
      ...(placementTarget.placementHint ? { placementHint: placementTarget.placementHint } : {}),
      range: {
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
      },
    };
  });
}

function extractResourceReferences(
  markdown: string,
  options: NekoMarkdownProjectOptions,
): readonly NekoMarkdownResourceReferenceToken[] {
  return Array.from(markdown.matchAll(RESOURCE_REFERENCE_RE)).map((match) => {
    const raw = match[0] ?? '';
    const target = match[2] ?? '';
    const placementTarget = stripMarkdownPlacementHint(target);
    const lookup = {
      target,
      lookupToken: placementTarget.lookupToken,
      ...(placementTarget.placementHint
        ? { placementHint: placementTarget.placementHint }
        : {}),
      embed: match[1] === '!',
      range: {
        start: match.index ?? 0,
        end: (match.index ?? 0) + raw.length,
      },
    };
    const resolution =
      options.resourceReferences === 'enabled'
        ? options.resourceResolver?.resolveResource(lookup)
        : undefined;
    const status = resolution?.status ?? 'unresolved';
    return {
      kind: 'resource-reference',
      embed: lookup.embed,
      raw,
      target,
      lookupToken: lookup.lookupToken,
      status,
      ...(resolution?.ref ? { ref: resolution.ref } : {}),
      candidates: resolution?.candidates ?? [],
      ...(lookup.placementHint ? { placementHint: lookup.placementHint } : {}),
      range: lookup.range,
    };
  });
}

function extractMentions(
  markdown: string,
  options: NekoMarkdownProjectOptions,
): readonly NekoMarkdownMentionToken[] {
  return Array.from(markdown.matchAll(MENTION_RE)).flatMap((match) => {
    const prefix = match[1] ?? '';
    const label = trimMentionLabel(match[2] ?? '');
    if (!label) return [];
    const start = (match.index ?? 0) + prefix.length;
    const raw = `@${label}`;
    const lookup = { label, raw, range: { start, end: start + raw.length } };
    const resolution = options.mentionResolver?.resolveMention(lookup);
    const status = resolution?.status ?? 'unresolved';
    return {
      kind: 'mention',
      raw,
      label,
      status,
      ...(resolution?.ref ? { ref: resolution.ref } : {}),
      candidates: resolution?.candidates ?? [],
      range: lookup.range,
    };
  });
}

function trimMentionLabel(label: string): string {
  return label.replace(/[.,!?;:，。！？；：]+$/u, '');
}

function extractCreativeTables(
  markdown: string,
  options: NekoMarkdownProjectOptions,
): readonly NekoMarkdownCreativeTableProjection[] {
  const tables: NekoMarkdownCreativeTableProjection[] = [];
  const knownColumns = new Set(
    (options.creativeTableKnownColumns ?? []).map(normalizeMarkdownResourceLookupToken),
  );
  const lines = markdown.split(/\r?\n/);
  const lineStarts = createLineStartOffsets(markdown, lines);

  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = parseTableLine(lines[index] ?? '');
    const separator = parseTableLine(lines[index + 1] ?? '');
    if (!header || !separator || !isSeparatorRow(separator)) continue;

    const rows: string[][] = [];
    let lastLineIndex = index + 1;
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const line = lines[rowIndex] ?? '';
      if (!TABLE_ROW_RE.test(line)) break;
      const row = parseTableLine(line);
      if (!row) break;
      rows.push([...row]);
      lastLineIndex = rowIndex;
    }

    const unknownColumns =
      knownColumns.size === 0
        ? []
        : header.filter(
            (column) => !knownColumns.has(normalizeMarkdownResourceLookupToken(column)),
          );
    const tableStart = lineStarts[index] ?? 0;
    const lastLine = lines[lastLineIndex] ?? '';
    const lastLineStart = lineStarts[lastLineIndex] ?? tableStart;
    tables.push({
      kind: 'creative-table',
      range: { start: tableStart, end: lastLineStart + lastLine.length },
      headers: header,
      rows,
      unknownColumns,
    });
    index = lastLineIndex;
  }
  return tables;
}

function diagnoseResourceReferences(
  references: readonly NekoMarkdownResourceReferenceToken[],
  options: NekoMarkdownProjectOptions,
): readonly NekoMarkdownDiagnostic[] {
  if (options.resourceReferences !== 'enabled') {
    return references.map((reference) => ({
      severity: 'warning',
      code: 'unsupported-resource-reference-markdown-extension',
      token: reference.target,
      message: 'Neko resource-reference embeds and links are not enabled for this projection.',
      range: reference.range,
    }));
  }
  if (!options.requireResolvedReferences) return [];
  return references.flatMap((reference) => {
    if (reference.status === 'resolved') return [];
    return [
      {
        severity: 'error' as const,
        code:
          reference.status === 'ambiguous'
            ? 'ambiguous-resource-reference'
            : 'missing-resource-reference',
        token: reference.raw,
        message:
          reference.status === 'ambiguous'
            ? `Markdown resource reference "${reference.raw}" matches multiple references.`
            : `Markdown resource reference "${reference.raw}" does not resolve to a stable reference.`,
        range: reference.range,
      },
    ];
  });
}

function diagnoseMentions(
  mentions: readonly NekoMarkdownMentionToken[],
  options: NekoMarkdownProjectOptions,
): readonly NekoMarkdownDiagnostic[] {
  if (!options.requireResolvedReferences) return [];
  return mentions.flatMap((mention) => {
    if (mention.status === 'resolved') return [];
    return [
      {
        severity: 'error' as const,
        code:
          mention.status === 'ambiguous'
            ? 'ambiguous-mention-reference'
            : 'missing-mention-reference',
        token: mention.raw,
        message:
          mention.status === 'ambiguous'
            ? `Markdown mention "${mention.raw}" matches multiple references.`
            : `Markdown mention "${mention.raw}" does not resolve to a stable reference.`,
        range: mention.range,
      },
    ];
  });
}

function parseTableLine(line: string): readonly string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return undefined;
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function createLineStartOffsets(markdown: string, lines: readonly string[]): readonly number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    offsets.push(cursor);
    cursor += line.length + newlineLengthAt(markdown, cursor + line.length);
  }
  return offsets;
}

function newlineLengthAt(markdown: string, index: number): number {
  if (markdown[index] === '\r' && markdown[index + 1] === '\n') return 2;
  if (markdown[index] === '\n') return 1;
  return 0;
}

function stripMarkdownToken(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('`') && trimmed.endsWith('`')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
