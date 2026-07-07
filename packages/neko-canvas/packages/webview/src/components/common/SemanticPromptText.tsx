import type { ReactNode } from 'react';
import type { CanvasAuthoringSemanticPromptSpan } from '@neko/shared';
import { t } from '../../i18n';

export interface SemanticPromptTextProps {
  readonly text: string;
  readonly spans?: readonly CanvasAuthoringSemanticPromptSpan[];
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly placeholderClassName?: string;
  readonly spanVariant?: 'compact' | 'editor';
}

interface RenderablePromptSpan {
  readonly span: CanvasAuthoringSemanticPromptSpan;
  readonly start: number;
  readonly end: number;
}

export function SemanticPromptText({
  text,
  spans,
  placeholder,
  ariaLabel,
  className,
  placeholderClassName,
  spanVariant = 'compact',
}: SemanticPromptTextProps): ReactNode {
  const renderableSpans = normalizePromptSpans(text, spans ?? []);
  return (
    <div
      className={className}
      data-semantic-prompt-text="true"
      data-semantic-prompt-visual-style="subtle"
      data-semantic-prompt-span-count={renderableSpans.length}
      aria-label={ariaLabel}
      title={text || placeholder}
    >
      {text ? (
        renderPromptSegments(text, renderableSpans, spanVariant)
      ) : (
        <span className={placeholderClassName ?? 'text-gray-400'}>{placeholder}</span>
      )}
    </div>
  );
}

export function readSemanticPromptSpanText(
  text: string,
  span: CanvasAuthoringSemanticPromptSpan,
): string {
  const start = clampPromptOffset(span.range.start, text.length);
  const end = clampPromptOffset(span.range.end, text.length);
  if (end <= start) return '';
  return text.slice(start, end).trim();
}

export function formatSemanticPromptSpanTitle(
  text: string,
  span: CanvasAuthoringSemanticPromptSpan,
): string {
  const kindLabel = getSemanticPromptSpanKindLabel(span.kind);
  const fieldLabel = span.fieldId ? getSemanticPromptFieldLabel(span.fieldId) : undefined;
  const parts = [
    kindLabel,
    fieldLabel && fieldLabel !== kindLabel ? fieldLabel : undefined,
    readSemanticPromptSpanText(text, span),
  ].filter(Boolean);
  return parts.join(' · ');
}

export function getSemanticPromptSpanKindLabel(kind: string): string {
  return translateDisplayKey(`content.promptSpanKind.${kind}`, kind);
}

export function getSemanticPromptFieldLabel(fieldId: string): string {
  return translateDisplayKey(`content.promptField.${fieldId}`, fieldId);
}

function renderPromptSegments(
  text: string,
  spans: readonly RenderablePromptSpan[],
  spanVariant: 'compact' | 'editor',
): ReactNode {
  if (spans.length === 0) return text;

  const segments: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((entry, index) => {
    if (entry.start > cursor) {
      segments.push(text.slice(cursor, entry.start));
    }
    segments.push(
      <span
        key={entry.span.id ?? `${entry.span.kind}-${entry.start}-${entry.end}-${index}`}
        className={getSemanticPromptSpanClassName(entry.span.kind, spanVariant)}
        data-semantic-prompt-span-kind={entry.span.kind}
        data-semantic-prompt-field-id={entry.span.fieldId}
        title={formatSemanticPromptSpanTitle(text, entry.span)}
      >
        {text.slice(entry.start, entry.end)}
      </span>,
    );
    cursor = entry.end;
  });
  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }
  return segments;
}

function normalizePromptSpans(
  text: string,
  spans: readonly CanvasAuthoringSemanticPromptSpan[],
): readonly RenderablePromptSpan[] {
  const sorted = spans
    .map((span): RenderablePromptSpan | undefined => {
      if (!Number.isInteger(span.range.start) || !Number.isInteger(span.range.end)) {
        return undefined;
      }
      if (span.range.start < 0 || span.range.end <= span.range.start) {
        return undefined;
      }
      if (span.range.end > text.length) {
        return undefined;
      }
      return { span, start: span.range.start, end: span.range.end };
    })
    .filter((span): span is RenderablePromptSpan => Boolean(span))
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const result: RenderablePromptSpan[] = [];
  let cursor = 0;
  for (const span of sorted) {
    if (span.start < cursor) {
      continue;
    }
    result.push(span);
    cursor = span.end;
  }
  return result;
}

function clampPromptOffset(value: number, textLength: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), textLength);
}

function getSemanticPromptSpanClassName(kind: string, variant: 'compact' | 'editor'): string {
  const base =
    variant === 'editor'
      ? 'rounded-sm border px-0.5 py-[1px] font-medium text-current underline decoration-2 underline-offset-[3px] shadow-sm box-decoration-clone'
      : 'rounded-sm border px-0.5 py-[1px] text-current underline decoration-2 underline-offset-[3px] box-decoration-clone';
  switch (kind) {
    case 'scene':
      return `${base} border-emerald-300/60 bg-emerald-50/45 decoration-emerald-400/75`;
    case 'character':
    case 'entity':
      return `${base} border-violet-300/60 bg-violet-50/45 decoration-violet-400/75`;
    case 'action':
      return `${base} border-blue-300/60 bg-blue-50/45 decoration-blue-400/75`;
    case 'camera':
      return `${base} border-amber-300/60 bg-amber-50/50 decoration-amber-400/80`;
    case 'style':
      return `${base} border-pink-300/60 bg-pink-50/45 decoration-pink-400/75`;
    case 'voice':
      return `${base} border-indigo-300/60 bg-indigo-50/45 decoration-indigo-400/75`;
    case 'resource':
    case 'media':
      return `${base} border-cyan-300/60 bg-cyan-50/45 decoration-cyan-400/75`;
    default:
      return `${base} border-gray-300/60 bg-gray-50/55 decoration-gray-400/75`;
  }
}

function translateDisplayKey(key: string, fallback: string): string {
  const value = t(key);
  return value === key ? fallback : value;
}
