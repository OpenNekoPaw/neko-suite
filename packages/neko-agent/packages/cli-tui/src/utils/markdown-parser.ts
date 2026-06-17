/**
 * Markdown Parser
 *
 * Parses markdown text into a structured AST suitable for
 * rendering with Ink components. Uses a recursive-descent
 * approach — no heavy AST library needed since terminal
 * rendering is a simplified subset of full markdown.
 *
 * Supported elements:
 * - Headers (#, ##, ###)
 * - Code blocks (``` with language)
 * - Inline code (`code`)
 * - Bold (**text**)
 * - Italic (*text*)
 * - Unordered lists (-, *)
 * - Ordered lists (1., 2.)
 * - Blockquotes (>)
 * - Horizontal rules (---, ***)
 * - Links [text](url)
 * - Plain text paragraphs
 */

/**
 * Markdown node types for the AST
 */
export type MarkdownNodeType =
  | 'heading'
  | 'code_block'
  | 'paragraph'
  | 'list'
  | 'list_item'
  | 'blockquote'
  | 'horizontal_rule'
  | 'text'
  | 'inline_code'
  | 'bold'
  | 'italic'
  | 'link';

export interface MarkdownNode {
  readonly type: MarkdownNodeType;
  readonly content?: string;
  readonly children?: MarkdownNode[];
  /** Heading level (1-6) */
  readonly level?: number;
  /** Code block language */
  readonly language?: string;
  /** Link URL */
  readonly url?: string;
  /** List ordered vs unordered */
  readonly ordered?: boolean;
}

/**
 * Parse a markdown string into an AST of MarkdownNode.
 */
export function parseMarkdown(input: string): MarkdownNode[] {
  const lines = input.split('\n');
  const nodes: MarkdownNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Empty line — skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      nodes.push({ type: 'horizontal_rule' });
      i++;
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      nodes.push({
        type: 'heading',
        level: headingMatch[1]!.length,
        children: parseInline(headingMatch[2]!),
      });
      i++;
      continue;
    }

    // Code block
    const codeMatch = /^```([^\s`]*)/.exec(line);
    if (codeMatch) {
      const language = codeMatch[1] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        codeLines.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      nodes.push({
        type: 'code_block',
        content: codeLines.join('\n'),
        language,
      });
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('> ')) {
        quoteLines.push(lines[i]!.slice(2));
        i++;
      }
      nodes.push({
        type: 'blockquote',
        children: parseInline(quoteLines.join('\n')),
      });
      continue;
    }

    // Unordered list
    if (/^(\s*[-*+])\s+/.test(line)) {
      const items: MarkdownNode[] = [];
      while (i < lines.length && /^(\s*[-*+])\s+/.test(lines[i]!)) {
        const itemContent = lines[i]!.replace(/^\s*[-*+]\s+/, '');
        items.push({
          type: 'list_item',
          children: parseInline(itemContent),
        });
        i++;
      }
      nodes.push({ type: 'list', ordered: false, children: items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: MarkdownNode[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) {
        const itemContent = lines[i]!.replace(/^\s*\d+[.)]\s+/, '');
        items.push({
          type: 'list_item',
          children: parseInline(itemContent),
        });
        i++;
      }
      nodes.push({ type: 'list', ordered: true, children: items });
      continue;
    }

    // Plain paragraph — collect lines until empty line or block element
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !/^(#{1,6}\s|```|>\s|[-*+]\s|\d+[.)]\s|(-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[i]!)
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    if (paraLines.length > 0) {
      nodes.push({
        type: 'paragraph',
        children: parseInline(paraLines.join('\n')),
      });
    }
  }

  return nodes;
}

/**
 * Parse inline markdown elements (bold, italic, code, links).
 */
export function parseInline(text: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  // Regex for inline patterns: **bold**, *italic*, `code`, [text](url)
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    if (match[2] !== undefined) {
      // **bold**
      nodes.push({ type: 'bold', content: match[2] });
    } else if (match[3] !== undefined) {
      // *italic*
      nodes.push({ type: 'italic', content: match[3] });
    } else if (match[4] !== undefined) {
      // `inline code`
      nodes.push({ type: 'inline_code', content: match[4] });
    } else if (match[5] !== undefined && match[6] !== undefined) {
      // [text](url)
      nodes.push({ type: 'link', content: match[5], url: match[6] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    nodes.push({ type: 'text', content: text.slice(lastIndex) });
  }

  // If no inline patterns found, return as single text node
  if (nodes.length === 0) {
    nodes.push({ type: 'text', content: text });
  }

  return nodes;
}
