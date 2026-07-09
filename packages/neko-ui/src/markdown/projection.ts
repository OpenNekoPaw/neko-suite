import {
  projectNekoMarkdownExtensions,
  type NekoMarkdownProjectOptions,
  type NekoMarkdownSemanticPromptSpan,
} from '@neko/markdown';
import type {
  MarkdownEditorProfile,
  MarkdownProjectionInput,
  MarkdownProjectionResult,
  MarkdownSemanticSpan,
  MarkdownUiDiagnostic,
} from './types';

export function projectMarkdownForUi({
  value,
  profile = 'plain-markdown',
  projectionOptions,
  semanticSpans = [],
  diagnostics = [],
}: MarkdownProjectionInput): MarkdownProjectionResult {
  const options = createProjectionOptions(profile, projectionOptions, semanticSpans);
  const projection = projectNekoMarkdownExtensions(value, options);
  const invalidSpanDiagnostics = validateSemanticSpans(value, semanticSpans);
  return {
    profile,
    projection,
    semanticSpans,
    diagnostics: [
      ...projection.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        source: 'projection' as const,
      })),
      ...invalidSpanDiagnostics,
      ...diagnostics,
    ],
  };
}

export function createProjectionOptions(
  profile: MarkdownEditorProfile,
  projectionOptions: NekoMarkdownProjectOptions | undefined,
  semanticSpans: readonly MarkdownSemanticSpan[],
): NekoMarkdownProjectOptions {
  const resourceReferences =
    projectionOptions?.resourceReferences ??
    (profile === 'resource-markdown' || profile === 'semantic-prompt' ? 'enabled' : 'disabled');

  return {
    ...projectionOptions,
    resourceReferences,
    promptSpans:
      projectionOptions?.promptSpans ??
      semanticSpans.map((span): NekoMarkdownSemanticPromptSpan => ({
        kind: span.kind,
        range: span.range,
        ...(span.fieldId ? { fieldId: span.fieldId } : {}),
        ...(span.label ? { label: span.label } : {}),
        ...(span.tone ? { tone: span.tone } : {}),
        ...(span.tooltip ? { tooltip: span.tooltip } : {}),
      })),
  };
}

export function validateSemanticSpans(
  value: string,
  semanticSpans: readonly MarkdownSemanticSpan[],
): readonly MarkdownUiDiagnostic[] {
  const diagnostics: MarkdownUiDiagnostic[] = [];
  const validSpans: MarkdownSemanticSpan[] = [];

  for (const span of semanticSpans) {
    if (!Number.isInteger(span.range.start) || !Number.isInteger(span.range.end)) {
      diagnostics.push({
        severity: 'error',
        code: 'markdown-ui-invalid-span-range',
        message: 'Semantic span range must use integer offsets.',
        range: normalizeInvalidRange(value),
        source: 'editor',
      });
      continue;
    }

    if (
      span.range.start < 0 ||
      span.range.end <= span.range.start ||
      span.range.end > value.length
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'markdown-ui-invalid-span-range',
        message: 'Semantic span range is outside the current text.',
        range: normalizeInvalidRange(value),
        source: 'editor',
      });
      continue;
    }

    validSpans.push(span);
  }

  let cursor = 0;
  for (const span of [...validSpans].sort((left, right) => left.range.start - right.range.start)) {
    if (span.range.start < cursor) {
      diagnostics.push({
        severity: 'error',
        code: 'markdown-ui-overlapping-span-range',
        message: 'Semantic span ranges must not overlap.',
        range: span.range,
        source: 'editor',
      });
    }
    cursor = Math.max(cursor, span.range.end);
  }

  return diagnostics;
}

function normalizeInvalidRange(value: string): { start: number; end: number } {
  return { start: 0, end: Math.min(value.length, 1) };
}
