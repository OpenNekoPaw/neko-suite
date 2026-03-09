/**
 * CodeBlock Component
 *
 * Renders a fenced code block with optional syntax highlighting.
 * Shows language label and bordered box.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { highlightLine } from '../../utils/syntax-highlight';

interface CodeBlockProps {
  /** Code content */
  readonly code: string;
  /** Language for syntax highlighting */
  readonly language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps): React.JSX.Element {
  const codeLines = code.split('\n');

  return (
    <Box flexDirection="column" marginTop={0} marginBottom={1}>
      {/* Language label */}
      {language ? (
        <Text dimColor>
          {'╭─ '}
          {language}
          {' ─'}
        </Text>
      ) : (
        <Text dimColor>{'╭──'}</Text>
      )}

      {/* Code lines with syntax highlighting */}
      {codeLines.map((line, idx) => (
        <Box key={idx}>
          <Text dimColor>{'│ '}</Text>
          <HighlightedLine line={line} language={language} />
        </Box>
      ))}

      {/* Bottom border */}
      <Text dimColor>{'╰──'}</Text>
    </Box>
  );
}

/** Render a single highlighted code line */
function HighlightedLine({
  line,
  language,
}: {
  readonly line: string;
  readonly language?: string;
}): React.JSX.Element {
  if (!language) {
    return <Text>{line}</Text>;
  }

  const lineTokens = highlightLine(line, language);

  return (
    <Text>
      {lineTokens.map((token, idx) => (
        <Text key={idx} color={token.color}>
          {token.text}
        </Text>
      ))}
    </Text>
  );
}
