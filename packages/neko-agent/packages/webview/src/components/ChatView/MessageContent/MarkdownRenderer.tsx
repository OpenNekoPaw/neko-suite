/**
 * MarkdownRenderer - Markdown 渲染组件
 * 支持 GFM (表格、任务列表、删除线等)
 * 支持 Mermaid 图表渲染
 */

import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { CodeBlock } from './CodeBlock';
import { MermaidBlock } from './MermaidBlock';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

// Custom components for react-markdown
const components: Components = {
  // Code blocks
  code({ node, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const isInline = !match && !className;
    const code = String(children).replace(/\n$/, '');
    const language = match?.[1]?.toLowerCase();

    if (isInline) {
      // Inline code
      return (
        <code
          className="px-1.5 py-0.5 rounded bg-[var(--vscode-textCodeBlock-background)] text-[var(--vscode-textPreformat-foreground)] text-[12px] font-mono break-words"
          {...props}
        >
          {children}
        </code>
      );
    }

    // Mermaid diagram
    if (language === 'mermaid') {
      return <MermaidBlock code={code} />;
    }

    // Regular code block
    return <CodeBlock code={code} language={language} />;
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
    return (
      <td className="px-3 py-1.5 text-[12px] text-[var(--vscode-foreground)] border border-[var(--vscode-panel-border)]">
        {children}
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
  img({ src, alt }) {
    return (
      <img src={src} alt={alt || ''} className="max-w-full h-auto rounded my-2" loading="lazy" />
    );
  },
};

function MarkdownRendererComponent({ content, isStreaming, className }: MarkdownRendererProps) {
  // Memoize remark plugins
  const remarkPlugins = useMemo(() => [remarkGfm], []);

  return (
    <div
      className={`markdown-content min-w-0 max-w-full overflow-hidden text-[13px] leading-relaxed break-words ${className || ''}`}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 ml-1 bg-[var(--vscode-foreground)] animate-pulse" />
      )}
    </div>
  );
}

// Memoize to prevent unnecessary re-renders during streaming
export const MarkdownRenderer = memo(MarkdownRendererComponent);
