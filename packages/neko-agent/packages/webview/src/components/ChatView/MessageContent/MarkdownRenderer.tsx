/**
 * MarkdownRenderer - Markdown 渲染组件
 * 支持 GFM (表格、任务列表、删除线等)
 * 支持 Mermaid 图表渲染
 */

import { Fragment, isValidElement, memo, useMemo, type ReactNode } from 'react';
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
  isCanvasStoryboardReferenceImageProcessingPrompt,
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
  locale: MarkdownDisplayLocale = 'en',
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
    table({ node, children }) {
      const storyboardProjection = projectStoryboardCreativeTableNode(
        node,
        markdownResources,
        locale,
      );
      if (storyboardProjection) {
        return storyboardProjection;
      }
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

function projectStoryboardResourceTokenCell(
  token: string,
  markdownResources: MarkdownResourceRenderingProjection | undefined,
): ReactNode | null {
  const normalizedToken = normalizeMarkdownResourceLookupToken(token);
  const projection = markdownResources?.tokens.find(
    (candidate) => normalizeMarkdownResourceLookupToken(candidate.token) === normalizedToken,
  );
  if (!projection) return null;
  if (projection.status === 'bound' && projection.renderUris.length > 0) {
    return (
      <span className="flex max-w-full flex-wrap gap-1.5 align-top">
        {projection.renderUris.slice(0, 2).map((uri, index) => (
          <img
            key={`${uri}-${index}`}
            src={uri}
            alt={projection.refs[index]?.label ?? token}
            title={projection.refs[index]?.label ?? token}
            className="max-h-28 min-h-16 w-auto max-w-[7rem] rounded border border-[var(--vscode-panel-border)] object-contain"
            loading="lazy"
          />
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1 align-top">
      <span className="min-w-0 truncate font-mono text-[11px] text-[var(--vscode-foreground)]">
        {token}
      </span>
      <span
        className="shrink-0 rounded border border-[var(--vscode-panel-border)] px-1 py-0.5 text-[10px] text-[var(--vscode-descriptionForeground)]"
        data-markdown-resource-status={projection.status}
      >
        {markdownResourceStatusLabel(projection)}
      </span>
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

interface MarkdownTableProjection {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly fields: readonly (CreativeTableFieldDescriptor | undefined)[];
}

type StoryboardSceneColumnId =
  'shot' | 'referenceMedia' | 'imagePrompt' | 'videoPrompt' | 'duration' | 'dialogue' | 'action';

type StoryboardPromptCellKind = 'image' | 'video';

type StoryboardPromptPartKind =
  'intent' | 'reference' | 'operation' | 'camera' | 'dialogue' | 'constraint' | 'detail';

interface StoryboardPromptPart {
  readonly kind: StoryboardPromptPartKind;
  readonly text: string;
}

const STORYBOARD_SCENE_COLUMNS = [
  'shot',
  'referenceMedia',
  'imagePrompt',
  'videoPrompt',
  'duration',
  'dialogue',
  'action',
] as const;

const STORYBOARD_SCENE_COLUMN_WIDTHS: Record<StoryboardSceneColumnId, number> = {
  shot: 76,
  referenceMedia: 132,
  imagePrompt: 216,
  videoPrompt: 248,
  duration: 72,
  dialogue: 176,
  action: 112,
};

const STORYBOARD_SCENE_TABLE_MIN_WIDTH = STORYBOARD_SCENE_COLUMNS.reduce(
  (total, columnId) => total + STORYBOARD_SCENE_COLUMN_WIDTHS[columnId],
  0,
);

function projectStoryboardCreativeTableNode(
  node: unknown,
  markdownResources: MarkdownResourceRenderingProjection | undefined,
  locale: MarkdownDisplayLocale,
): ReactNode | null {
  const table = readMarkdownTableProjectionFromNode(node);
  if (!table || !shouldRenderCanvasSceneStoryboardTable(table)) return null;

  return (
    <div
      className="my-2 min-w-0 max-w-full overflow-x-auto"
      data-markdown-storyboard-scene-table="true"
    >
      <table
        className="table-fixed border-collapse text-left text-[11px] text-[var(--vscode-foreground)]"
        style={{ minWidth: STORYBOARD_SCENE_TABLE_MIN_WIDTH }}
      >
        <colgroup>
          {STORYBOARD_SCENE_COLUMNS.map((columnId) => (
            <col key={columnId} style={{ width: STORYBOARD_SCENE_COLUMN_WIDTHS[columnId] }} />
          ))}
        </colgroup>
        <thead className="bg-[var(--vscode-editorWidget-background)] text-[10px] uppercase tracking-normal text-[var(--vscode-descriptionForeground)]">
          <tr>
            {STORYBOARD_SCENE_COLUMNS.map((columnId) => (
              <th
                key={columnId}
                className="border border-[var(--vscode-panel-border)] px-2 py-1.5 font-medium"
                data-markdown-storyboard-scene-column={columnId}
              >
                {storyboardSceneColumnLabel(columnId, locale)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <MarkdownStoryboardSceneTableRow
              key={`${readCellByField(table, row, 'scene')}:${readCellByField(table, row, 'shot')}:${rowIndex}`}
              table={table}
              row={row}
              rowIndex={rowIndex}
              markdownResources={markdownResources}
              locale={locale}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkdownStoryboardSceneTableRow({
  table,
  row,
  rowIndex,
  markdownResources,
  locale,
}: {
  readonly table: MarkdownTableProjection;
  readonly row: readonly string[];
  readonly rowIndex: number;
  readonly markdownResources: MarkdownResourceRenderingProjection | undefined;
  readonly locale: MarkdownDisplayLocale;
}) {
  const shot = readCellByField(table, row, 'shot') || String(rowIndex + 1);
  const source = readCellByField(table, row, 'source');
  const imagePrompt =
    readCellByField(table, row, 'imagePrompt') || readCellByField(table, row, 'prompt');
  const videoPrompt = readCellByField(table, row, 'videoPrompt');
  const duration = readCellByField(table, row, 'duration');
  const dialogue = readCellByField(table, row, 'dialogue');
  const action =
    readCellByField(table, row, 'nextAction') ||
    deriveStoryboardSceneAction({
      source,
      imagePrompt,
      videoPrompt,
      locale,
    });

  return (
    <tr
      className="align-top text-[11px] text-[var(--vscode-foreground)] odd:bg-[color-mix(in_srgb,var(--vscode-editorWidget-background)_44%,transparent)] hover:bg-[var(--vscode-list-hoverBackground)]"
      data-markdown-storyboard-scene-row="true"
    >
      <StoryboardSceneTableCell columnId="shot">
        <span className="flex min-w-0 items-center gap-1 text-left text-[12px] font-medium text-[var(--vscode-foreground)]">
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--vscode-button-background)] text-[10px] leading-none text-[var(--vscode-button-foreground)]">
            {rowIndex + 1}
          </span>
          <span className="truncate">{shot}</span>
        </span>
      </StoryboardSceneTableCell>
      <StoryboardSceneTableCell columnId="referenceMedia">
        {source ? (
          (projectStoryboardResourceCell(source, markdownResources) ?? (
            <BoundedStoryboardSceneCellText value={source} />
          ))
        ) : (
          <BoundedStoryboardSceneCellText
            value=""
            placeholder={storyboardScenePlaceholder('referenceMedia', locale)}
          />
        )}
      </StoryboardSceneTableCell>
      <StoryboardSceneTableCell columnId="imagePrompt">
        <StoryboardPromptCellText
          kind="image"
          value={imagePrompt}
          placeholder={storyboardScenePlaceholder('imagePrompt', locale)}
        />
      </StoryboardSceneTableCell>
      <StoryboardSceneTableCell columnId="videoPrompt">
        <StoryboardPromptCellText
          kind="video"
          value={videoPrompt}
          placeholder={storyboardScenePlaceholder('videoPrompt', locale)}
        />
      </StoryboardSceneTableCell>
      <StoryboardSceneTableCell columnId="duration">
        <BoundedStoryboardSceneCellText
          value={duration}
          placeholder={storyboardScenePlaceholder('duration', locale)}
        />
      </StoryboardSceneTableCell>
      <StoryboardSceneTableCell columnId="dialogue">
        <BoundedStoryboardSceneCellText
          value={dialogue}
          placeholder={storyboardScenePlaceholder('dialogue', locale)}
        />
      </StoryboardSceneTableCell>
      <StoryboardSceneTableCell columnId="action">
        <StoryboardSceneActionPill value={action} locale={locale} />
      </StoryboardSceneTableCell>
    </tr>
  );
}

function StoryboardSceneTableCell({
  columnId,
  children,
}: {
  readonly columnId: StoryboardSceneColumnId;
  readonly children: ReactNode;
}) {
  return (
    <td
      className="border border-[var(--vscode-panel-border)] px-2 py-2"
      data-markdown-storyboard-scene-cell={columnId}
    >
      {children}
    </td>
  );
}

function StoryboardPromptCellText({
  kind,
  value,
  placeholder,
}: {
  readonly kind: StoryboardPromptCellKind;
  readonly value: string;
  readonly placeholder: string;
}) {
  if (!value) {
    return <BoundedStoryboardSceneCellText value="" placeholder={placeholder} />;
  }
  const parts = projectStoryboardPromptParts(value);
  return (
    <div
      className="min-w-0 whitespace-pre-wrap break-words text-[11px] leading-[1.45] text-[var(--vscode-foreground)]"
      title={value}
      data-markdown-storyboard-prompt-cell={kind}
      data-markdown-storyboard-prompt-visual-style="subtle-inline"
    >
      {parts.map((part, index) => {
        const separator = index === 0 ? '' : ' ';
        return (
          <Fragment key={`${part.kind}:${index}:${part.text}`}>
            {separator}
            <span
              className={getStoryboardPromptPartClassName(part.kind)}
              data-markdown-storyboard-prompt-part="true"
              data-markdown-storyboard-prompt-part-kind={part.kind}
            >
              {part.text}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

function BoundedStoryboardSceneCellText({
  value,
  placeholder = '-',
}: {
  readonly value: string;
  readonly placeholder?: string;
}) {
  return (
    <div
      className="line-clamp-2 min-w-0 whitespace-pre-wrap break-words text-[11px] leading-[1.35] text-[var(--vscode-foreground)]"
      title={value || placeholder}
    >
      {value || <span className="text-[var(--vscode-descriptionForeground)]">{placeholder}</span>}
    </div>
  );
}

function projectStoryboardPromptParts(value: string): readonly StoryboardPromptPart[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const intentMatch = /^([^：:]{2,32})[：:]\s*(.*)$/u.exec(trimmed);
  const parts: StoryboardPromptPart[] = [];
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
      kind: classifyStoryboardPromptPart(chunk),
      text: chunk,
    });
  }
  return parts;
}

function classifyStoryboardPromptPart(value: string): StoryboardPromptPartKind {
  const lower = value.toLocaleLowerCase();
  if (
    /(^|\s)(p\d+(?:#panel_\d+)?|page_\d+(?:#panel_\d+)?)(\s|$)/iu.test(value) ||
    /参考|来源|reference|source/u.test(lower)
  ) {
    return 'reference';
  }
  if (isCanvasStoryboardReferenceImageProcessingPrompt(value)) {
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

function getStoryboardPromptPartClassName(kind: StoryboardPromptPartKind): string {
  const base =
    'rounded-sm border px-0.5 py-[1px] text-[var(--vscode-foreground)] underline decoration-2 underline-offset-[3px] box-decoration-clone';
  switch (kind) {
    case 'intent':
      return `${base} border-[color-mix(in_srgb,var(--vscode-button-background)_42%,transparent)] bg-[color-mix(in_srgb,var(--vscode-button-background)_8%,transparent)] font-medium decoration-[color-mix(in_srgb,var(--vscode-button-background)_70%,transparent)]`;
    case 'reference':
      return `${base} border-cyan-300/60 bg-cyan-50/40 decoration-cyan-400/75`;
    case 'operation':
      return `${base} border-amber-300/60 bg-amber-50/45 decoration-amber-400/80`;
    case 'camera':
      return `${base} border-blue-300/60 bg-blue-50/40 decoration-blue-400/75`;
    case 'dialogue':
      return `${base} border-indigo-300/60 bg-indigo-50/40 decoration-indigo-400/75`;
    case 'constraint':
      return `${base} border-emerald-300/60 bg-emerald-50/40 decoration-emerald-400/75`;
    case 'detail':
      return `${base} border-[color-mix(in_srgb,var(--vscode-foreground)_16%,transparent)] bg-[color-mix(in_srgb,var(--vscode-foreground)_4%,transparent)] decoration-[color-mix(in_srgb,var(--vscode-foreground)_30%,transparent)]`;
  }
}

function StoryboardSceneActionPill({
  value,
  locale,
}: {
  readonly value: string;
  readonly locale: MarkdownDisplayLocale;
}) {
  if (!value) {
    return (
      <BoundedStoryboardSceneCellText
        value=""
        placeholder={storyboardScenePlaceholder('action', locale)}
      />
    );
  }
  return (
    <span
      className="inline-flex max-w-full rounded border border-[var(--vscode-button-background)] bg-[var(--vscode-button-secondaryBackground)] px-2 py-1 text-[11px] leading-none text-[var(--vscode-button-secondaryForeground)]"
      title={value}
      data-markdown-storyboard-scene-action={value}
    >
      <span className="truncate">{value}</span>
    </span>
  );
}

function projectStoryboardResourceCell(
  value: string,
  markdownResources: MarkdownResourceRenderingProjection | undefined,
): ReactNode | null {
  const tokens = extractStoryboardResourceCellTokens(value);
  const projected = tokens.flatMap((token, index) => {
    const projection = projectStoryboardResourceTokenCell(token, markdownResources);
    return projection ? [<Fragment key={`${token}:${index}`}>{projection}</Fragment>] : [];
  });
  if (projected.length === 0) return null;
  return <span className="flex max-w-full flex-wrap gap-1.5">{projected}</span>;
}

function extractStoryboardResourceCellTokens(value: string): readonly string[] {
  const imageTargets = Array.from(value.matchAll(/!\[[^\]]*]\(([^)]+)\)/g))
    .map((match) => match[1])
    .filter((target): target is string => Boolean(target));
  if (imageTargets.length > 0) {
    return imageTargets.map(stripResourcePlacementHint);
  }
  return value
    .split(/[\s,，、;；]+/)
    .map((token) => stripInlineMarkdown(token.trim()))
    .filter(Boolean);
}

function readCellByField(
  table: MarkdownTableProjection,
  row: readonly string[],
  fieldId: string,
): string {
  const index = table.fields.findIndex((field) => field?.id === fieldId);
  return index >= 0 ? (row[index]?.trim() ?? '') : '';
}

function shouldRenderCanvasSceneStoryboardTable(table: MarkdownTableProjection): boolean {
  return shouldRenderCanvasSceneStoryboardFields(table.fields);
}

function shouldRenderCanvasSceneStoryboardFields(
  fields: readonly (CreativeTableFieldDescriptor | undefined)[],
): boolean {
  const fieldIds = new Set(fields.flatMap((field) => (field ? [field.id] : [])));
  const hasPromptFirstSurface =
    fieldIds.has('imagePrompt') ||
    fieldIds.has('videoPrompt') ||
    fieldIds.has('duration') ||
    fieldIds.has('dialogue');
  return fieldIds.has('scene') && fieldIds.has('shot') && hasPromptFirstSurface;
}

function storyboardSceneColumnLabel(
  columnId: StoryboardSceneColumnId,
  locale: MarkdownDisplayLocale,
): string {
  const labels: Record<StoryboardSceneColumnId, Record<MarkdownDisplayLocale, string>> = {
    shot: { en: 'Shot', 'zh-cn': '镜头' },
    referenceMedia: { en: 'Reference', 'zh-cn': '参考素材' },
    imagePrompt: { en: 'Image Prompt', 'zh-cn': '图片提示词' },
    videoPrompt: { en: 'Scene Video Prompt', 'zh-cn': '场景视频提示词' },
    duration: { en: 'Duration', 'zh-cn': '时长' },
    dialogue: { en: 'Dialogue', 'zh-cn': '台词' },
    action: { en: 'Action', 'zh-cn': '操作' },
  };
  return labels[columnId][locale];
}

function storyboardScenePlaceholder(
  columnId: StoryboardSceneColumnId,
  locale: MarkdownDisplayLocale,
): string {
  const labels: Partial<Record<StoryboardSceneColumnId, Record<MarkdownDisplayLocale, string>>> = {
    referenceMedia: { en: 'No reference', 'zh-cn': '无参考' },
    imagePrompt: { en: 'Not needed', 'zh-cn': '不需要' },
    videoPrompt: { en: 'None', 'zh-cn': '暂无' },
    duration: { en: '-', 'zh-cn': '-' },
    dialogue: { en: 'No dialogue', 'zh-cn': '无台词' },
    action: { en: 'None', 'zh-cn': '暂无' },
  };
  return labels[columnId]?.[locale] ?? '-';
}

function deriveStoryboardSceneAction(input: {
  readonly source: string;
  readonly imagePrompt: string;
  readonly videoPrompt: string;
  readonly locale: MarkdownDisplayLocale;
}): string {
  if (input.source && isCanvasStoryboardReferenceImageProcessingPrompt(input.imagePrompt)) {
    return input.locale === 'zh-cn' ? '处理参考素材' : 'Process reference';
  }
  if (!input.videoPrompt) {
    return input.locale === 'zh-cn' ? '优化场景视频提示词' : 'Optimize scene video prompt';
  }
  if (!input.source && input.imagePrompt) {
    return input.locale === 'zh-cn' ? '生成图片' : 'Generate image';
  }
  return input.locale === 'zh-cn' ? '生成视频' : 'Generate video';
}

function readMarkdownTableProjectionFromNode(node: unknown): MarkdownTableProjection | undefined {
  const rows = collectMarkdownTableRowsFromNode(node);
  const headerRowIndex = rows.findIndex((row) => row.kind === 'header');
  const headerRow = rows[headerRowIndex >= 0 ? headerRowIndex : 0];
  if (!headerRow || headerRow.cells.length < 2) return undefined;
  const bodyRows = rows
    .slice((headerRowIndex >= 0 ? headerRowIndex : 0) + 1)
    .filter((row) => row.cells.length === headerRow.cells.length)
    .map((row) => row.cells);
  if (bodyRows.length === 0) return undefined;
  const fields = headerRow.cells.map((header) =>
    resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, header),
  );
  return {
    headers: headerRow.cells,
    rows: bodyRows,
    fields,
  };
}

function collectMarkdownTableRowsFromNode(
  node: unknown,
): readonly { readonly kind: 'header' | 'body'; readonly cells: readonly string[] }[] {
  const rows: Array<{ kind: 'header' | 'body'; cells: string[] }> = [];
  const visit = (value: unknown): void => {
    const element = readHastElement(value);
    if (!element) return;
    if (element.tagName === 'tr') {
      const cellElements = element.children
        .map(readHastElement)
        .filter((child): child is HastElement =>
          Boolean(child && (child.tagName === 'th' || child.tagName === 'td')),
        );
      if (cellElements.length > 0) {
        rows.push({
          kind: cellElements.some((cell) => cell.tagName === 'th') ? 'header' : 'body',
          cells: cellElements.map((cell) => readHastText(cell).trim()),
        });
      }
      return;
    }
    for (const child of element.children) visit(child);
  };
  visit(node);
  return rows;
}

interface HastElement {
  readonly tagName: string;
  readonly children: readonly unknown[];
}

function readHastElement(value: unknown): HastElement | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const tagName = record['tagName'];
  const children = record['children'];
  if (typeof tagName !== 'string' || !Array.isArray(children)) return undefined;
  return { tagName, children };
}

function readHastText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (record['type'] === 'text' && typeof record['value'] === 'string') return record['value'];
  const children = record['children'];
  if (Array.isArray(children)) return children.map(readHastText).join('');
  return '';
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
  content,
  markdownResources,
}: {
  readonly content: string;
  readonly markdownResources?: MarkdownResourceRenderingProjection;
}) {
  const storyboardReferenceTokens = collectStoryboardReferenceResourceTokens(content);
  const diagnostics =
    markdownResources?.status === 'diagnostic'
      ? markdownResources.diagnostics
          .filter((diagnostic) => diagnostic.severity === 'error')
          .filter((diagnostic) => !isSemanticPromptDiagnostic(diagnostic))
          .filter(
            (diagnostic) =>
              !isStoryboardReferenceResourceDiagnostic(diagnostic, storyboardReferenceTokens),
          )
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

const STORYBOARD_REFERENCE_RESOURCE_DIAGNOSTIC_CODES = new Set([
  'ambiguous-resource-token',
  'missing-resource-context',
  'missing-resource-token',
]);

function collectStoryboardReferenceResourceTokens(markdown: string): ReadonlySet<string> {
  const tokens = new Set<string>();
  const lines = markdown.split(/\r?\n/);
  let inFence = false;

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index] ?? '';
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const headers = parseMarkdownTableCells(line);
    const separator = parseMarkdownTableCells(lines[index + 1] ?? '');
    if (!headers || !separator || !isMarkdownTableSeparator(separator)) continue;

    const fields = headers.map((header) =>
      resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, header),
    );
    if (!shouldRenderCanvasSceneStoryboardFields(fields)) continue;

    const sourceIndexes = fields
      .map((field, fieldIndex) => (field?.id === 'source' ? fieldIndex : -1))
      .filter((fieldIndex) => fieldIndex >= 0);
    if (sourceIndexes.length === 0) continue;

    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const cells = parseMarkdownTableCells(lines[rowIndex] ?? '');
      if (!cells) break;
      for (const sourceIndex of sourceIndexes) {
        for (const token of extractStoryboardResourceCellTokens(cells[sourceIndex] ?? '')) {
          tokens.add(normalizeMarkdownResourceLookupToken(token));
        }
      }
    }
  }

  return tokens;
}

function isStoryboardReferenceResourceDiagnostic(
  diagnostic: MarkdownResourceDiagnostic,
  storyboardReferenceTokens: ReadonlySet<string>,
): boolean {
  return Boolean(
    diagnostic.token &&
    STORYBOARD_REFERENCE_RESOURCE_DIAGNOSTIC_CODES.has(diagnostic.code) &&
    storyboardReferenceTokens.has(normalizeMarkdownResourceLookupToken(diagnostic.token)),
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
  if (
    span.range.start < 0 ||
    span.range.end <= span.range.start ||
    span.range.end > content.length
  ) {
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
    () =>
      localizeMarkdownCreativeTablesForDisplay(
        removeNonActionableDiagnosticTablesForDisplay(
          removeMarkdownResourceIndexSectionsForDisplay(content),
        ),
        locale,
      ),
    [content, locale],
  );
  const markdownComponents = useMemo(
    () => createMarkdownComponents(isStreaming, markdownResources, locale),
    [isStreaming, markdownResources, locale],
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
      <CreativeDraftDiagnostics content={content} markdownResources={markdownResources} />
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

const MARKDOWN_RESOURCE_INDEX_HEADING_RE =
  /^\s{0,3}#{1,6}\s*(?:资源索引|图片索引|资源图片索引|resource\s+index|image\s+index|resource\s+image\s+index)\s*#*\s*$/i;

function removeMarkdownResourceIndexSectionsForDisplay(markdown: string): string {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(/\r?\n/);
  const visibleLines: string[] = [];
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      visibleLines.push(line);
      continue;
    }
    if (!inFence && MARKDOWN_RESOURCE_INDEX_HEADING_RE.test(line)) {
      const tableStartIndex = findNextNonBlankLineIndex(lines, index + 1);
      if (isMarkdownTableStart(lines, tableStartIndex)) {
        index = skipMarkdownTableLines(lines, tableStartIndex) - 1;
        continue;
      }
    }
    visibleLines.push(line);
  }

  return visibleLines.join(newline);
}

function removeNonActionableDiagnosticTablesForDisplay(markdown: string): string {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(/\r?\n/);
  const visibleLines: string[] = [];
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      visibleLines.push(line);
      continue;
    }
    if (!inFence && isMarkdownTableStart(lines, index)) {
      const headers = parseMarkdownTableCells(line) ?? [];
      const tableEndIndex = skipMarkdownTableLines(lines, index);
      const rowCount = countMarkdownTableDataRows(lines, index, headers.length);
      if (
        isResourceMetadataInventoryDisplayTable(headers) ||
        (rowCount === 0 && isStoryboardCreativeDisplayTable(headers))
      ) {
        index = tableEndIndex - 1;
        continue;
      }
    }
    visibleLines.push(line);
  }

  return visibleLines.join(newline);
}

function countMarkdownTableDataRows(
  lines: readonly string[],
  tableStartIndex: number,
  headerCellCount: number,
): number {
  let count = 0;
  for (let index = tableStartIndex + 2; index < lines.length; index += 1) {
    const cells = parseMarkdownTableCells(lines[index] ?? '');
    if (!cells || cells.length !== headerCellCount) break;
    if (cells.some((cell) => cell.length > 0)) count += 1;
  }
  return count;
}

function isStoryboardCreativeDisplayTable(headers: readonly string[]): boolean {
  const fields = headers.map((header) =>
    resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, header),
  );
  return shouldRenderCanvasSceneStoryboardFields(fields);
}

function isResourceMetadataInventoryDisplayTable(headers: readonly string[]): boolean {
  const normalizedHeaders = headers.map(normalizeMarkdownTableHeader);
  if (hasStoryboardCreativeDisplayAnchors(normalizedHeaders)) return false;

  const hasPage = normalizedHeaders.some((header) =>
    ['page', 'pageno', 'pagenumber', 'sourcepage', '页', '页码', '页面', '来源页'].includes(header),
  );
  const hasAsset = normalizedHeaders.some((header) =>
    [
      'asset',
      'assetid',
      'resource',
      'resourceid',
      'image',
      'imageid',
      'source',
      'token',
      '感知卡',
      '图片卡片',
      '资源',
      '素材',
      '来源',
    ].includes(header),
  );
  const hasSize = normalizedHeaders.some((header) =>
    ['size', 'dimensions', 'resolution', '尺寸', '分辨率'].includes(header),
  );
  const hasType = normalizedHeaders.some((header) =>
    ['type', 'mimetype', 'mime', '类型'].includes(header),
  );

  return (hasPage && hasAsset && hasSize) || (hasAsset && hasSize && hasType);
}

function hasStoryboardCreativeDisplayAnchors(normalizedHeaders: readonly string[]): boolean {
  const hasScene = normalizedHeaders.some((header) => header === 'scene' || header === '场景');
  const hasShot = normalizedHeaders.some((header) => header === 'shot' || header === '镜头');
  return hasScene && hasShot;
}

function normalizeMarkdownTableHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_\-/#:：]+/g, '');
}

function findNextNonBlankLineIndex(lines: readonly string[], startIndex: number): number {
  let index = startIndex;
  while (index < lines.length && (lines[index] ?? '').trim().length === 0) {
    index += 1;
  }
  return index;
}

function isMarkdownTableStart(lines: readonly string[], index: number): boolean {
  const header = parseMarkdownTableCells(lines[index] ?? '');
  const separator = parseMarkdownTableCells(lines[index + 1] ?? '');
  return Boolean(header && separator && isMarkdownTableSeparator(separator));
}

function skipMarkdownTableLines(lines: readonly string[], tableStartIndex: number): number {
  let index = tableStartIndex + 2;
  while (index < lines.length && parseMarkdownTableCells(lines[index] ?? '')) {
    index += 1;
  }
  return index;
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
