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
import { RichContentRenderer } from '@/components/ChatView/RichContent';
import { projectCompositeBlockRichContent } from '@/presenters/composite-content-presenter';
import {
  normalizeMarkdownResourceLookupToken,
  type MarkdownResourceRenderingProjection,
} from '@/presenters/markdown-resource-rendering-presenter';
import { t } from '@/i18n';
import { validateCompositeArtifact, type CompositeArtifact } from '@neko/shared';
import { CodeBlock } from './CodeBlock';
import { MermaidBlock } from './MermaidBlock';

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
            ? `Image reference "${src}" is not projected by the host.`
            : 'Image reference is missing a source.'}
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
        <span className="flex max-w-[12rem] flex-wrap gap-1">
          {projection.renderUris.slice(0, 4).map((uri, index) => (
            <img
              key={`${uri}-${index}`}
              src={uri}
              alt={projection.refs[index]?.label ?? token}
              className="h-12 w-12 rounded border border-[var(--vscode-panel-border)] object-cover"
              loading="lazy"
            />
          ))}
        </span>
      ) : null}
      {projection.diagnostics.length > 0 ? (
        <span className="text-[10px] text-[var(--vscode-errorForeground)]">
          {projection.diagnostics[0]?.message}
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
  const normalizedToken = normalizeMarkdownResourceLookupToken(src);
  const projection = markdownResources?.tokens.find(
    (candidate) => normalizeMarkdownResourceLookupToken(candidate.token) === normalizedToken,
  );
  if (!projection) return null;
  if (projection.renderUris.length === 0) {
    return projectMarkdownResourceTokenCell(src, markdownResources);
  }
  const renderUri = projection.renderUris[0];
  return (
    <span className="my-2 inline-flex max-w-full flex-col gap-1">
      <img
        src={renderUri}
        alt={projection.refs[0]?.label ?? src}
        className="max-w-full rounded border border-[var(--vscode-panel-border)]"
        loading="lazy"
      />
      <span
        className="text-[10px] text-[var(--vscode-descriptionForeground)]"
        data-markdown-image-status={projection.status}
      >
        {src}
      </span>
    </span>
  );
}

function markdownResourceStatusLabel(
  projection: MarkdownResourceRenderingProjection['tokens'][number],
): string {
  if (projection.status === 'bound') {
    return projection.refs.length > 1 ? `${projection.refs.length} images` : 'image';
  }
  if (projection.status === 'ambiguous') {
    const candidateCount = projection.diagnostics[0]?.candidates?.length;
    return candidateCount ? `${candidateCount} candidates` : 'ambiguous';
  }
  if (projection.status === 'missing') return 'missing';
  if (projection.status === 'unsupported') return 'unsupported';
  return 'unbound';
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
          {diagnostic.message}
        </div>
      ))}
    </div>
  );
}

function MarkdownRendererComponent({
  content,
  isStreaming,
  className,
  markdownResources,
}: MarkdownRendererProps) {
  // Memoize remark plugins
  const remarkPlugins = useMemo(() => [remarkGfm], []);
  const markdownComponents = useMemo(
    () => createMarkdownComponents(isStreaming, markdownResources),
    [isStreaming, markdownResources],
  );

  return (
    <div
      className={`markdown-content min-w-0 max-w-full overflow-hidden text-[13px] leading-relaxed break-words ${className || ''}`}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
        {content}
      </ReactMarkdown>
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
          {diagnostic.message}
        </div>
      ))}
    </div>
  );
}
