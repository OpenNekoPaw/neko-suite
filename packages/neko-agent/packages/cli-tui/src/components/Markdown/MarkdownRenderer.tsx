/**
 * MarkdownRenderer Component
 *
 * Converts a markdown string into Ink components.
 * Uses the markdown-parser AST and renders each node type
 * with appropriate terminal styling.
 */

import React from 'react';
import { Box, Text } from 'ink';
import {
  isCompositeContentFenceLanguage,
  parseCompositeContentJson,
  parseCompositeContentJsonCandidates,
} from '@neko-agent/types';
import { validateCompositeArtifact, type CompositeArtifact } from '@neko/shared';
import { parseMarkdown, type MarkdownNode } from '../../utils/markdown-parser';
import { tokens } from '../../theme/tokens';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  /** Raw markdown content */
  readonly content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps): React.JSX.Element {
  const nodes = parseMarkdown(content);

  return (
    <Box flexDirection="column">
      {nodes.map((node, idx) => (
        <MarkdownNodeView key={idx} node={node} />
      ))}
    </Box>
  );
}

/** Render a single AST node */
function MarkdownNodeView({ node }: { readonly node: MarkdownNode }): React.JSX.Element {
  switch (node.type) {
    case 'heading':
      return (
        <Box marginBottom={0}>
          <Text bold color={tokens.info}>
            {'#'.repeat(node.level ?? 1)} {renderInlineChildren(node.children)}
          </Text>
        </Box>
      );

    case 'code_block':
      if (isCompositeContentFenceLanguage(node.language)) {
        const summary = projectStructuredArtifactSummary(node.content ?? '');
        if (summary) return <StructuredArtifactSummary summary={summary} />;
      }
      return <CodeBlock code={node.content ?? ''} language={node.language} />;

    case 'paragraph':
      return (
        <Box marginBottom={0}>
          <Text>{renderInlineChildren(node.children)}</Text>
        </Box>
      );

    case 'list':
      return (
        <Box flexDirection="column" marginBottom={0} marginLeft={1}>
          {node.children?.map((item, idx) => (
            <Box key={idx}>
              <Text>
                {node.ordered ? `${idx + 1}. ` : '• '}
                {renderInlineChildren(item.children)}
              </Text>
            </Box>
          ))}
        </Box>
      );

    case 'blockquote':
      return (
        <Box marginBottom={0}>
          <Text color={tokens.muted}>│ </Text>
          <Text italic>{renderInlineChildren(node.children)}</Text>
        </Box>
      );

    case 'horizontal_rule':
      return (
        <Box marginBottom={0}>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>
      );

    default:
      return <Text>{node.content ?? ''}</Text>;
  }
}

interface StructuredArtifactSummaryData {
  readonly title: string;
  readonly subtitle: string;
  readonly details: readonly string[];
}

function projectStructuredArtifactSummary(code: string): StructuredArtifactSummaryData | null {
  const composites = parseCompositeContentJson(code);
  if (composites.length > 0) {
    const first = composites[0];
    return {
      title: first?.title ?? 'Structured artifact',
      subtitle:
        composites.length === 1
          ? `${first?.template ?? 'composite'} content`
          : `${composites.length} structured artifacts`,
      details: composites.map(
        (composite) => `${composite.template}: ${composite.sections.length} rows`,
      ),
    };
  }

  const artifacts = parseCompositeContentJsonCandidates(code).filter(isValidCompositeArtifact);
  if (artifacts.length === 0) return null;
  const first = artifacts[0];
  return {
    title: first?.title ?? first?.artifactId ?? 'Composite artifact',
    subtitle:
      artifacts.length === 1
        ? `${first?.blocks.length ?? 0} blocks`
        : `${artifacts.length} composite artifacts`,
    details: artifacts.flatMap((artifact) =>
      artifact.blocks.slice(0, 4).map((block) => `${block.kind}: ${block.title ?? block.blockId}`),
    ),
  };
}

function isValidCompositeArtifact(value: unknown): value is CompositeArtifact {
  return validateCompositeArtifact(value).ok;
}

function StructuredArtifactSummary({
  summary,
}: {
  readonly summary: StructuredArtifactSummaryData;
}): React.JSX.Element {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={tokens.info}>╭─ {summary.title}</Text>
      <Text color={tokens.muted}>│ {summary.subtitle}</Text>
      {summary.details.map((detail, index) => (
        <Text key={index} color={tokens.muted}>
          │ {detail}
        </Text>
      ))}
      <Text color={tokens.info}>╰─ structured content rendered as summary in TUI</Text>
    </Box>
  );
}

/**
 * Render inline children nodes as a flat Text composition.
 * Returns React elements that can be placed inside a <Text>.
 */
function renderInlineChildren(children?: MarkdownNode[]): React.ReactNode {
  if (!children || children.length === 0) return null;

  return children.map((child, idx) => {
    switch (child.type) {
      case 'bold':
        return (
          <Text key={idx} bold>
            {child.content}
          </Text>
        );
      case 'italic':
        return (
          <Text key={idx} italic>
            {child.content}
          </Text>
        );
      case 'inline_code':
        return <Text key={idx} color={tokens.warning}>{`\`${child.content}\``}</Text>;
      case 'link':
        return (
          <Text key={idx} color={tokens.info} underline>
            {child.content}
          </Text>
        );
      case 'text':
      default:
        return <Text key={idx}>{child.content}</Text>;
    }
  });
}
