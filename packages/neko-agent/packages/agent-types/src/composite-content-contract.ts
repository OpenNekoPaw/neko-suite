import type { CompositeBlockData, CompositeSection, MediaRef } from './message';

export const COMPOSITE_CONTENT_FENCE_LANGUAGES = ['neko-composite', 'neko-composite-json'] as const;

export interface CompositeContentExtraction {
  readonly text: string;
  readonly composites: readonly CompositeBlockData[];
}

interface CompositeContentEnvelope {
  readonly kind?: 'neko-composite';
  readonly composite?: unknown;
  readonly composites?: unknown;
}

const MAX_COMPOSITE_SECTIONS = 200;
const MAX_SECTION_MEDIA_REFS = 12;

const COMPOSITE_CONTENT_FENCE_PATTERN =
  /```(?:neko-composite|neko-composite-json)\s*\n([\s\S]*?)```/g;

export function extractCompositeContentBlocks(markdown: string): CompositeContentExtraction {
  const composites: CompositeBlockData[] = [];
  const text = markdown
    .replace(COMPOSITE_CONTENT_FENCE_PATTERN, (match, json: string) => {
      const parsed = parseCompositeContentJson(json);
      if (parsed.length === 0) return match;
      for (const composite of parsed) {
        composites.push(composite);
      }
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, composites };
}

export function parseCompositeContentJson(json: string): readonly CompositeBlockData[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  const candidates = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? readEnvelopeCandidates(parsed)
      : [];

  return candidates.flatMap((candidate) => {
    const composite = normalizeCompositeBlock(candidate);
    return composite ? [composite] : [];
  });
}

function readEnvelopeCandidates(envelope: CompositeContentEnvelope): readonly unknown[] {
  if (Array.isArray(envelope.composites)) return envelope.composites;
  if (envelope.composite !== undefined) return [envelope.composite];
  return [envelope];
}

function normalizeCompositeBlock(value: unknown): CompositeBlockData | null {
  if (!isRecord(value)) return null;
  const template = value.template;
  if (
    template !== 'storyboard-table' &&
    template !== 'comparison' &&
    template !== 'gallery' &&
    template !== 'report'
  ) {
    return null;
  }

  const sectionsValue = value.sections;
  if (!Array.isArray(sectionsValue) || sectionsValue.length === 0) return null;
  const sections = sectionsValue.slice(0, MAX_COMPOSITE_SECTIONS).flatMap((section) => {
    const normalized = normalizeCompositeSection(section);
    return normalized ? [normalized] : [];
  });
  if (sections.length === 0) return null;

  return {
    template,
    ...(readString(value, 'title') ? { title: readString(value, 'title') } : {}),
    sections,
  };
}

function normalizeCompositeSection(value: unknown): CompositeSection | null {
  if (!isRecord(value)) return null;
  const mediaRefs = Array.isArray(value.mediaRefs)
    ? value.mediaRefs.slice(0, MAX_SECTION_MEDIA_REFS).flatMap((mediaRef) => {
        const normalized = normalizeMediaRef(mediaRef);
        return normalized ? [normalized] : [];
      })
    : undefined;
  const heading = readString(value, 'heading');
  const content = readString(value, 'content');
  const layout = normalizeSectionLayout(value.layout);

  if (!heading && !content && (!mediaRefs || mediaRefs.length === 0)) return null;

  return {
    ...(heading ? { heading } : {}),
    ...(content ? { content } : {}),
    ...(mediaRefs && mediaRefs.length > 0 ? { mediaRefs } : {}),
    ...(layout ? { layout } : {}),
  };
}

function normalizeMediaRef(value: unknown): MediaRef | null {
  if (!isRecord(value)) return null;
  const toolCallId = readString(value, 'toolCallId');
  if (!toolCallId) return null;

  const assetIndex = readNonNegativeInteger(value.assetIndex);
  return {
    toolCallId,
    ...(assetIndex !== undefined ? { assetIndex } : {}),
    ...(readString(value, 'caption') ? { caption: readString(value, 'caption') } : {}),
    ...(readString(value, 'role') ? { role: readString(value, 'role') } : {}),
  };
}

function normalizeSectionLayout(value: unknown): CompositeSection['layout'] | undefined {
  return value === 'inline' || value === 'grid' || value === 'table-row' ? value : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
