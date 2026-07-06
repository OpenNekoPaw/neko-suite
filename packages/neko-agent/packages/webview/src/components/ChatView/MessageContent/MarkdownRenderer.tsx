/**
 * MarkdownRenderer - Markdown 渲染组件
 * 支持 GFM (表格、任务列表、删除线等)
 * 支持 Mermaid 图表渲染
 */

import { isValidElement, memo, useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import {
  isCompositeContentFenceLanguage,
  parseCompositeContentJson,
  parseCompositeContentJsonCandidates,
} from '@neko-agent/types';
import {
  classifyCreativeTableHeaders,
  resolveCreativeTableField,
  STORYBOARD_CREATIVE_TABLE_PROFILE,
  validateCompositeArtifact,
  type CreativeTableFieldDescriptor,
  type CompositeArtifact,
} from '@neko/shared';
import { RichContentRenderer } from '@/components/ChatView/RichContent';
import { projectCompositeBlockRichContent } from '@/presenters/composite-content-presenter';
import {
  normalizeMarkdownResourceLookupToken,
  type MarkdownResourceDiagnostic,
  type MarkdownResourceRenderingProjection,
} from '@/presenters/markdown-resource-rendering-presenter';
import { getLocale, t } from '@/i18n';
import { CodeBlock } from './CodeBlock';
import { MermaidBlock } from './MermaidBlock';

type MarkdownDisplayLocale = 'en' | 'zh-cn';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
  markdownResources?: MarkdownResourceRenderingProjection;
}

function createMarkdownComponents(
  isStreaming?: boolean,
  markdownResources?: MarkdownResourceRenderingProjection,
): Components {
  return {
    // Code blocks
    code({ node, className, children, ...props }) {
      const match = /language-([^\s]+)/.exec(className || '');
      const isInline = !match && !className;
      const code = String(children).replace(/\n$/, '');
      const language = match?.[1]?.toLowerCase();

      if (isInline) {
        return (
          <code
            className="px-1.5 py-0.5 rounded bg-[var(--vscode-textCodeBlock-background)] text-[var(--vscode-textPreformat-foreground)] text-[12px] font-mono break-words"
            {...props}
          >
            {children}
          </code>
        );
      }

      if (language === 'mermaid') {
        return <MermaidBlock code={code} />;
      }

      const structuredContent = projectStructuredCodeBlock(code, language, Boolean(isStreaming));
      if (structuredContent) {
        return structuredContent;
      }

      return <CodeBlock code={code} language={language} />;
    },
    pre({ children }) {
      return <>{children}</>;
    },

    // Paragraphs
    p({ children }) {
      return <p className="mb-2 last:mb-0">{children}</p>;
    },

    // Headers
    h1({ children }) {
      return (
        <h1 className="text-lg font-bold mb-2 mt-4 first:mt-0 text-[var(--vscode-foreground)]">
          {children}
        </h1>
      );
    },
    h2({ children }) {
      return (
        <h2 className="text-base font-bold mb-2 mt-3 first:mt-0 text-[var(--vscode-foreground)]">
          {children}
        </h2>
      );
    },
    h3({ children }) {
      return (
        <h3 className="text-sm font-bold mb-1.5 mt-2 first:mt-0 text-[var(--vscode-foreground)]">
          {children}
        </h3>
      );
    },
    h4({ children }) {
      return (
        <h4 className="text-sm font-semibold mb-1 mt-2 first:mt-0 text-[var(--vscode-foreground)]">
          {children}
        </h4>
      );
    },

    // Lists
    ul({ children }) {
      return <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>;
    },
    li({ children }) {
      return <li className="text-[var(--vscode-foreground)]">{children}</li>;
    },

    // Links
    a({ href, children }) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--vscode-textLink-foreground)] hover:underline"
        >
          {children}
        </a>
      );
    },

    // Blockquotes
    blockquote({ children }) {
      return (
        <blockquote className="border-l-2 border-[var(--vscode-textBlockQuote-border)] pl-3 my-2 text-[var(--vscode-textBlockQuote-foreground)]">
          {children}
        </blockquote>
      );
    },

    // Tables
    table({ children }) {
      return (
        <div className="overflow-x-auto my-2 w-full max-w-full">
          <table className="w-full border-collapse border border-[var(--vscode-panel-border)]">
            {children}
          </table>
        </div>
      );
    },
    thead({ children }) {
      return <thead className="bg-[var(--vscode-editorWidget-background)]">{children}</thead>;
    },
    tbody({ children }) {
      return <tbody>{children}</tbody>;
    },
    tr({ children }) {
      return <tr className="border-b border-[var(--vscode-panel-border)]">{children}</tr>;
    },
    th({ children }) {
      return (
        <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-[var(--vscode-foreground)] border border-[var(--vscode-panel-border)]">
          {children}
        </th>
      );
    },
    td({ children }) {
      const tokenProjection = projectMarkdownResourceTokenCell(children, markdownResources);
      return (
        <td className="px-3 py-1.5 text-[12px] text-[var(--vscode-foreground)] border border-[var(--vscode-panel-border)]">
          {tokenProjection ?? children}
        </td>
      );
    },

    // Horizontal rule
    hr() {
      return <hr className="my-3 border-t border-[var(--vscode-panel-border)]" />;
    },

    // Strong and emphasis
    strong({ children }) {
      return <strong className="font-semibold">{children}</strong>;
    },
    em({ children }) {
      return <em className="italic">{children}</em>;
    },

    // Strikethrough
    del({ children }) {
      return (
        <del className="line-through text-[var(--vscode-descriptionForeground)]">{children}</del>
      );
    },

    // Images
    img({ src }) {
      const imageProjection = projectMarkdownImageResource(src, markdownResources);
      if (imageProjection) {
        return imageProjection;
      }
      return (
        <span
          className="my-2 inline-flex rounded border border-[var(--vscode-inputValidation-warningBorder)] bg-[var(--vscode-inputValidation-warningBackground)] px-2 py-1 text-[11px] text-[var(--vscode-inputValidation-warningForeground)]"
          data-markdown-image-status="unprojected"
        >
          {src
            ? t('chat.markdown.image.unprojected', { src })
            : t('chat.markdown.image.missingSource')}
        </span>
      );
    },
  };
}

function projectMarkdownResourceTokenCell(
  children: ReactNode,
  markdownResources: MarkdownResourceRenderingProjection | undefined,
): ReactNode | null {
  const token = readPlainText(children);
  if (!token) return null;
  const normalizedToken = normalizeMarkdownResourceLookupToken(token);
  const projection = markdownResources?.tokens.find(
    (candidate) => normalizeMarkdownResourceLookupToken(candidate.token) === normalizedToken,
  );
  if (!projection) return null;
  if (projection.status === 'bound' && projection.renderUris.length > 0) {
    return (
      <span className="flex max-w-[28rem] flex-wrap gap-1.5 align-top">
        {projection.renderUris.slice(0, 4).map((uri, index) => (
          <img
            key={`${uri}-${index}`}
            src={uri}
            alt={projection.refs[index]?.label ?? token}
            title={projection.refs[index]?.label ?? token}
            className="max-h-40 min-h-24 w-auto max-w-[14rem] rounded border border-[var(--vscode-panel-border)] object-contain"
            loading="lazy"
          />
        ))}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-[8rem] max-w-full flex-col gap-1 align-top">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] text-[var(--vscode-foreground)]">{token}</span>
        <span
          className="rounded border border-[var(--vscode-panel-border)] px-1 py-0.5 text-[10px] text-[var(--vscode-descriptionForeground)]"
          data-markdown-resource-status={projection.status}
        >
          {markdownResourceStatusLabel(projection)}
        </span>
      </span>
      {projection.renderUris.length > 0 ? (
        <span className="flex max-w-[28rem] flex-wrap gap-1.5">
          {projection.renderUris.slice(0, 4).map((uri, index) => (
            <img
              key={`${uri}-${index}`}
              src={uri}
              alt={projection.refs[index]?.label ?? token}
              className="max-h-40 min-h-24 w-auto max-w-[14rem] rounded border border-[var(--vscode-panel-border)] object-contain"
              loading="lazy"
            />
          ))}
        </span>
      ) : null}
      {projection.diagnostics.length > 0 ? (
        <span className="text-[10px] text-[var(--vscode-errorForeground)]">
          {formatMarkdownResourceDiagnostic(projection.diagnostics[0])}
        </span>
      ) : null}
    </span>
  );
}

function projectMarkdownImageResource(
  src: string | undefined,
  markdownResources: MarkdownResourceRenderingProjection | undefined,
): ReactNode | null {
  if (!src) return null;
  const baseToken = stripResourcePlacementHint(src);
  const normalizedToken = normalizeMarkdownResourceLookupToken(baseToken);
  const projection = markdownResources?.tokens.find(
    (candidate) => normalizeMarkdownResourceLookupToken(candidate.token) === normalizedToken,
  );
  if (!projection) return null;
  if (projection.renderUris.length === 0) {
    return projectMarkdownResourceTokenCell(baseToken, markdownResources);
  }
  const renderUri = projection.renderUris[0];
  return (
    <span className="my-2 inline-flex max-w-full flex-col gap-1">
      <img
        src={renderUri}
        alt={projection.refs[0]?.label ?? baseToken}
        title={projection.refs[0]?.label ?? baseToken}
        className="max-w-full rounded border border-[var(--vscode-panel-border)]"
        loading="lazy"
      />
    </span>
  );
}

function stripResourcePlacementHint(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z][A-Za-z0-9_.~:@/%+-]*#[A-Za-z][A-Za-z0-9_.:-]*$/.test(trimmed)) {
    return trimmed.slice(0, trimmed.indexOf('#'));
  }
  return trimmed;
}

function markdownResourceStatusLabel(
  projection: MarkdownResourceRenderingProjection['tokens'][number],
): string {
  if (projection.status === 'bound') {
    return projection.refs.length > 1
      ? t('chat.markdown.resourceStatus.images', { count: projection.refs.length })
      : t('chat.markdown.resourceStatus.image');
  }
  if (projection.status === 'ambiguous') {
    const candidateCount = projection.diagnostics[0]?.candidates?.length;
    return candidateCount
      ? t('chat.markdown.resourceStatus.candidates', { count: candidateCount })
      : t('chat.markdown.resourceStatus.ambiguous');
  }
  if (projection.status === 'missing') return t('chat.markdown.resourceStatus.missing');
  if (projection.status === 'unsupported') return t('chat.markdown.resourceStatus.unsupported');
  return t('chat.markdown.resourceStatus.unbound');
}

function readPlainText(node: ReactNode): string | undefined {
  if (typeof node === 'string' || typeof node === 'number') {
    const value = String(node).trim();
    return value.length > 0 ? value : undefined;
  }
  if (Array.isArray(node)) {
    const parts = node.map(readPlainText);
    if (parts.some((part) => part === undefined)) return undefined;
    const value = parts.join('').trim();
    return value.length > 0 ? value : undefined;
  }
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) {
    return readPlainText(node.props.children);
  }
  return undefined;
}

function projectStructuredCodeBlock(
  code: string,
  language: string | undefined,
  isStreaming: boolean,
) {
  if (!isCompositeContentFenceLanguage(language)) return null;

  const composites = parseCompositeContentJson(code);
  const artifacts = composites.length === 0 ? parseCompositeArtifacts(code) : [];
  if (composites.length === 0 && artifacts.length === 0) {
    if (!isStreaming || !shouldTreatAsStreamingStructuredArtifact(code, language)) return null;
    return <StructuredArtifactPending />;
  }

  return (
    <div className="my-2 flex flex-col gap-2">
      {composites.map((composite, index) => {
        const richContent = projectCompositeBlockRichContent({ composite });
        return (
          <RichContentRenderer
            key={`${composite.template}-${composite.title ?? 'artifact'}-${index}`}
            kind={richContent.kind}
            data={richContent.data}
          />
        );
      })}
      {artifacts.map((artifact) => (
        <RichContentRenderer key={artifact.artifactId} kind="composite-artifact" data={artifact} />
      ))}
    </div>
  );
}

function parseCompositeArtifacts(code: string): readonly CompositeArtifact[] {
  return parseCompositeContentJsonCandidates(code).filter(isValidCompositeArtifact);
}

function isValidCompositeArtifact(value: unknown): value is CompositeArtifact {
  return validateCompositeArtifact(value).ok;
}

function shouldTreatAsStreamingStructuredArtifact(code: string, language?: string): boolean {
  if (language !== 'json') return true;
  return /"kind"\s*:\s*"(?:composite-artifact|storyboard-table)"/i.test(code);
}

function StructuredArtifactPending() {
  return (
    <div className="my-2 rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] px-3 py-2 text-[12px] text-[var(--vscode-descriptionForeground)]">
      <span className="inline-block h-2 w-2 rounded-full bg-[var(--vscode-charts-blue)] align-middle animate-pulse" />
      <span className="ml-2 align-middle">{t('chat.structuredArtifact.generating')}</span>
    </div>
  );
}

function CreativeDraftDiagnostics({
  markdownResources,
}: {
  readonly markdownResources?: MarkdownResourceRenderingProjection;
}) {
  const diagnostics =
    markdownResources?.status === 'diagnostic'
      ? markdownResources.diagnostics
          .filter((diagnostic) => diagnostic.severity === 'error')
          .filter((diagnostic) => !isSemanticPromptDiagnostic(diagnostic))
          .slice(0, 3)
      : [];
  if (diagnostics.length === 0) return null;

  return (
    <div
      role="alert"
      className="mt-2 rounded border border-[var(--vscode-inputValidation-errorBorder)] bg-[var(--vscode-inputValidation-errorBackground)] px-2 py-1.5 text-[11px] text-[var(--vscode-inputValidation-errorForeground)]"
    >
      {diagnostics.map((diagnostic, index) => (
        <div key={`${diagnostic.code}-${diagnostic.token ?? 'markdown'}-${index}`}>
          {formatMarkdownResourceDiagnostic(diagnostic)}
        </div>
      ))}
    </div>
  );
}

function SemanticPromptSpanProjectionList({
  content,
  markdownResources,
}: {
  readonly content: string;
  readonly markdownResources?: MarkdownResourceRenderingProjection;
}) {
  const spans = markdownResources?.promptSpans ?? [];
  if (spans.length === 0) return null;

  return (
    <div className="mt-2 flex max-w-full flex-wrap gap-1.5" data-markdown-prompt-spans="true">
      {spans.map((span, index) => (
        <SemanticPromptSpanChip
          key={`${span.kind}:${span.range.start}:${span.range.end}:${span.fieldId ?? index}`}
          content={content}
          span={span}
        />
      ))}
    </div>
  );
}

function SemanticPromptSpanChip({
  content,
  span,
}: {
  readonly content: string;
  readonly span: NonNullable<MarkdownResourceRenderingProjection['promptSpans']>[number];
}) {
  const sourceText = readPromptSpanSourceText(content, span);
  const displayLabel = span.label ?? sourceText ?? span.kind;
  const title = formatPromptSpanTitle(span, sourceText);

  return (
    <span
      className="inline-flex min-h-6 max-w-full items-center gap-1 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] px-1.5 py-0.5 text-[11px] text-[var(--vscode-foreground)] border-b-2"
      style={{ borderBottomColor: promptSpanColor(span) }}
      title={title}
      data-markdown-prompt-span="true"
      data-markdown-prompt-span-kind={span.kind}
      data-markdown-prompt-span-field-id={span.fieldId}
      data-markdown-prompt-span-ref-kind={span.ref?.kind}
      data-markdown-prompt-span-ref-id={span.ref?.id}
      data-markdown-prompt-span-ref-namespace={span.ref?.namespace}
      data-markdown-prompt-span-range={`${span.range.start}:${span.range.end}`}
      data-canvas-handoff-ref-kind={span.ref?.kind}
      data-canvas-handoff-ref-id={span.ref?.id}
      data-canvas-handoff-ref-namespace={span.ref?.namespace}
    >
      <span className="max-w-[14rem] truncate underline decoration-[var(--vscode-descriptionForeground)] underline-offset-2">
        {displayLabel}
      </span>
      {span.fieldId ? (
        <span className="max-w-[10rem] truncate font-mono text-[10px] text-[var(--vscode-descriptionForeground)]">
          {span.fieldId}
        </span>
      ) : null}
      {span.ref ? (
        <span className="max-w-[10rem] truncate font-mono text-[10px] text-[var(--vscode-descriptionForeground)]">
          @{span.ref.id}
        </span>
      ) : null}
    </span>
  );
}

function SemanticPromptSpanDiagnostics({
  markdownResources,
}: {
  readonly markdownResources?: MarkdownResourceRenderingProjection;
}) {
  const diagnostics =
    markdownResources?.diagnostics.filter(isSemanticPromptDiagnostic).slice(0, 3) ?? [];
  if (diagnostics.length === 0) return null;

  const hasError = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  return (
    <div
      role={hasError ? 'alert' : 'note'}
      className={`mt-2 rounded border px-2 py-1.5 text-[11px] ${
        hasError
          ? 'border-[var(--vscode-inputValidation-errorBorder)] bg-[var(--vscode-inputValidation-errorBackground)] text-[var(--vscode-inputValidation-errorForeground)]'
          : 'border-[var(--vscode-inputValidation-warningBorder)] bg-[var(--vscode-inputValidation-warningBackground)] text-[var(--vscode-inputValidation-warningForeground)]'
      }`}
    >
      {diagnostics.map((diagnostic, index) => (
        <div key={`${diagnostic.code}-${diagnostic.token ?? 'prompt-span'}-${index}`}>
          {formatMarkdownResourceDiagnostic(diagnostic)}
        </div>
      ))}
    </div>
  );
}

function readPromptSpanSourceText(
  content: string,
  span: NonNullable<MarkdownResourceRenderingProjection['promptSpans']>[number],
): string | undefined {
  if (span.range.start < 0 || span.range.end <= span.range.start || span.range.end > content.length) {
    return undefined;
  }
  const value = content.slice(span.range.start, span.range.end).trim();
  return value.length > 0 ? value : undefined;
}

function formatPromptSpanTitle(
  span: NonNullable<MarkdownResourceRenderingProjection['promptSpans']>[number],
  sourceText: string | undefined,
): string {
  return [
    span.tooltip,
    sourceText ? `source: ${sourceText}` : undefined,
    span.fieldId ? `field: ${span.fieldId}` : undefined,
    span.ref ? `ref: ${span.ref.kind}:${span.ref.id}` : undefined,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n');
}

function promptSpanColor(
  span: NonNullable<MarkdownResourceRenderingProjection['promptSpans']>[number],
): string {
  const tone = (span.tone ?? span.kind).toLowerCase();
  if (tone.includes('scene') || tone.includes('location')) return 'var(--vscode-charts-green)';
  if (tone.includes('character') || tone.includes('entity')) return 'var(--vscode-charts-purple)';
  if (tone.includes('voice') || tone.includes('audio') || tone.includes('dialogue')) {
    return 'var(--vscode-charts-yellow)';
  }
  if (tone.includes('resource') || tone.includes('media') || tone.includes('asset')) {
    return 'var(--vscode-charts-orange)';
  }
  if (tone.includes('style')) return 'var(--vscode-charts-red)';
  return 'var(--vscode-charts-blue)';
}

function MarkdownRendererComponent({
  content,
  isStreaming,
  className,
  markdownResources,
}: MarkdownRendererProps) {
  const locale = normalizeMarkdownDisplayLocale(getLocale());
  // Memoize remark plugins
  const remarkPlugins = useMemo(() => [remarkGfm], []);
  const displayContent = useMemo(
    () => localizeMarkdownCreativeTablesForDisplay(content, locale),
    [content, locale],
  );
  const markdownComponents = useMemo(
    () => createMarkdownComponents(isStreaming, markdownResources),
    [isStreaming, markdownResources],
  );

  return (
    <div
      className={`markdown-content min-w-0 max-w-full overflow-hidden text-[13px] leading-relaxed break-words ${className || ''}`}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
        {displayContent}
      </ReactMarkdown>
      <SemanticPromptSpanProjectionList content={content} markdownResources={markdownResources} />
      <SemanticPromptSpanDiagnostics markdownResources={markdownResources} />
      <MarkdownExtensionDiagnostics markdownResources={markdownResources} />
      <CreativeDraftDiagnostics markdownResources={markdownResources} />
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 ml-1 bg-[var(--vscode-foreground)] animate-pulse" />
      )}
    </div>
  );
}

// Memoize to prevent unnecessary re-renders during streaming
export const MarkdownRenderer = memo(MarkdownRendererComponent);

function MarkdownExtensionDiagnostics({
  markdownResources,
}: {
  readonly markdownResources?: MarkdownResourceRenderingProjection;
}) {
  const diagnostics =
    markdownResources?.diagnostics
      .filter(
        (diagnostic) => diagnostic.code === 'unsupported-resource-reference-markdown-extension',
      )
      .slice(0, 3) ?? [];
  if (diagnostics.length === 0) return null;

  return (
    <div
      role="note"
      className="mt-2 rounded border border-[var(--vscode-inputValidation-warningBorder)] bg-[var(--vscode-inputValidation-warningBackground)] px-2 py-1.5 text-[11px] text-[var(--vscode-inputValidation-warningForeground)]"
    >
      {diagnostics.map((diagnostic, index) => (
        <div key={`${diagnostic.code}-${diagnostic.token ?? 'embed'}-${index}`}>
          {formatMarkdownResourceDiagnostic(diagnostic)}
        </div>
      ))}
    </div>
  );
}

function normalizeMarkdownDisplayLocale(locale: string | undefined): MarkdownDisplayLocale {
  return locale?.trim().toLowerCase().startsWith('zh') ? 'zh-cn' : 'en';
}

function localizeMarkdownCreativeTablesForDisplay(
  markdown: string,
  locale: MarkdownDisplayLocale,
): string {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(/\r?\n/);
  let inFence = false;

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index] ?? '';
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const separatorLine = lines[index + 1] ?? '';
    const headers = parseMarkdownTableCells(line);
    const separator = parseMarkdownTableCells(separatorLine);
    if (!headers || !separator || !isMarkdownTableSeparator(separator)) continue;

    const classification = classifyCreativeTableHeaders(STORYBOARD_CREATIVE_TABLE_PROFILE, headers);
    if (!shouldLocalizeStoryboardCreativeTable(classification.knownFields)) continue;

    const fields = headers.map((header) =>
      resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, header),
    );
    lines[index] = formatMarkdownTableRow(
      headers.map((header, headerIndex) =>
        fields[headerIndex] ? fields[headerIndex].labels[locale] : header,
      ),
    );

    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const cells = parseMarkdownTableCells(lines[rowIndex] ?? '');
      if (!cells) break;
      lines[rowIndex] = formatMarkdownTableRow(
        cells.map((cell, cellIndex) => localizeCreativeTableCell(cell, fields[cellIndex], locale)),
      );
    }
  }

  return lines.join(newline);
}

function shouldLocalizeStoryboardCreativeTable(
  knownFields: readonly CreativeTableFieldDescriptor[],
): boolean {
  if (knownFields.length < 3) return false;
  const fieldIds = new Set(knownFields.map((field) => field.id));
  return fieldIds.has('scene') || fieldIds.has('shot');
}

function parseMarkdownTableCells(line: string): readonly string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return undefined;
  const withoutLeading = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const withoutTrailing = withoutLeading.endsWith('|')
    ? withoutLeading.slice(0, -1)
    : withoutLeading;
  const cells = withoutTrailing.split('|').map((cell) => cell.trim());
  return cells.length > 1 ? cells : undefined;
}

function isMarkdownTableSeparator(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function formatMarkdownTableRow(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`;
}

function localizeCreativeTableCell(
  cell: string,
  field: CreativeTableFieldDescriptor | undefined,
  locale: MarkdownDisplayLocale,
): string {
  if (!field) return cell;
  const value = stripInlineMarkdown(cell).trim();
  if (!value) return cell;
  const label = STORYBOARD_CREATIVE_TABLE_VALUE_LABELS[field.id]?.[value.toLowerCase()]?.[locale];
  return label ?? cell;
}

function stripInlineMarkdown(value: string): string {
  return value.replace(/^`(.+)`$/, '$1').trim();
}

const STORYBOARD_CREATIVE_TABLE_VALUE_LABELS: Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<MarkdownDisplayLocale, string>>>>>
> = {
  decision: {
    keep: { en: 'Keep', 'zh-cn': '保留' },
    skip: { en: 'Skip', 'zh-cn': '跳过' },
    merge: { en: 'Merge', 'zh-cn': '合并' },
    split: { en: 'Split', 'zh-cn': '拆分' },
    duplicate: { en: 'Duplicate', 'zh-cn': '重复' },
    'reference-only': { en: 'Reference only', 'zh-cn': '仅作参考' },
  },
  reviewStatus: {
    'needs-review': { en: 'Needs review', 'zh-cn': '待审阅' },
    'needs-panel-analysis': { en: 'Needs panel analysis', 'zh-cn': '待分析分格' },
    'needs-resource-binding': { en: 'Needs resource binding', 'zh-cn': '待绑定资源' },
    'needs-prompt': { en: 'Needs prompt', 'zh-cn': '待补提示词' },
    approved: { en: 'Approved', 'zh-cn': '已通过' },
    rejected: { en: 'Rejected', 'zh-cn': '已拒绝' },
  },
  contentType: {
    story: { en: 'Story', 'zh-cn': '正片' },
    cover: { en: 'Cover', 'zh-cn': '封面' },
    metadata: { en: 'Metadata', 'zh-cn': '元数据' },
    reference: { en: 'Reference', 'zh-cn': '参考' },
    transition: { en: 'Transition', 'zh-cn': '转场' },
  },
  requiresSplit: {
    true: { en: 'Yes', 'zh-cn': '是' },
    false: { en: 'No', 'zh-cn': '否' },
  },
};

function formatMarkdownResourceDiagnostic(
  diagnostic: MarkdownResourceDiagnostic | undefined,
): string {
  if (!diagnostic) return '';
  const token = diagnostic.token ?? '';
  if (diagnostic.code === 'missing-resource-token') {
    return t('chat.markdown.diagnostic.missingResourceToken', { token });
  }
  if (diagnostic.code === 'missing-resource-context') {
    return t('chat.markdown.diagnostic.missingResourceContext', { token });
  }
  if (diagnostic.code === 'ambiguous-resource-token') {
    return t('chat.markdown.diagnostic.ambiguousResourceToken', { token });
  }
  if (diagnostic.code === 'unsupported-resource-reference-markdown-extension') {
    return t('chat.markdown.diagnostic.unsupportedResourceReference');
  }
  return diagnostic.message;
}

function isSemanticPromptDiagnostic(diagnostic: MarkdownResourceDiagnostic): boolean {
  const code = diagnostic.code.toLowerCase();
  return code.includes('prompt-span') || code.includes('semantic-prompt');
}
