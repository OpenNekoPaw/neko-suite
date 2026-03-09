/**
 * InputEditor Component
 *
 * Multi-line text input with command history and slash command support.
 * - Enter: submit input
 * - Shift+Enter / Ctrl+J: add newline (multi-line mode)
 * - Up/Down: navigate command history
 * - /: prefix triggers slash command callback
 */

import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { tokens } from '../../theme/tokens';

interface InputEditorProps {
  /** Called when user submits a prompt */
  readonly onSubmit: (text: string) => void;
  /** Whether input is disabled (agent running) */
  readonly disabled?: boolean;
  /** Prompt prefix character */
  readonly prompt?: string;
  /** Called when slash command detected (starts with /) */
  readonly onSlashCommand?: (input: string) => void;
}

const MAX_HISTORY = 50;

export function InputEditor({
  onSubmit,
  disabled = false,
  prompt = '>',
  onSlashCommand,
}: InputEditorProps): React.JSX.Element {
  const [value, setValue] = useState('');
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  const addToHistory = useCallback((entry: string) => {
    const history = historyRef.current;
    if (history[0] !== entry) {
      history.unshift(entry);
      if (history.length > MAX_HISTORY) history.pop();
    }
    historyIndexRef.current = -1;
  }, []);

  useInput((input, key) => {
    if (disabled) return;

    // Enter → submit (unless Shift held for newline)
    if (key.return && !key.shift) {
      const trimmed = value.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('/') && onSlashCommand) {
        onSlashCommand(trimmed);
        setValue('');
        return;
      }

      addToHistory(trimmed);
      onSubmit(trimmed);
      setValue('');
      return;
    }

    // Shift+Enter or Ctrl+J → newline
    if ((key.return && key.shift) || (input === 'j' && key.ctrl)) {
      setValue((prev) => prev + '\n');
      return;
    }

    // Up arrow → previous history entry
    if (key.upArrow) {
      const history = historyRef.current;
      if (history.length === 0) return;
      const idx = Math.min(historyIndexRef.current + 1, history.length - 1);
      historyIndexRef.current = idx;
      const entry = history[idx];
      if (entry !== undefined) setValue(entry);
      return;
    }

    // Down arrow → next history entry
    if (key.downArrow) {
      if (historyIndexRef.current <= 0) {
        historyIndexRef.current = -1;
        setValue('');
        return;
      }
      historyIndexRef.current -= 1;
      const entry = historyRef.current[historyIndexRef.current];
      if (entry !== undefined) setValue(entry);
      return;
    }

    // Backspace
    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    // Ignore other control keys
    if (key.ctrl || key.meta) return;

    // Regular character input
    if (input) {
      setValue((prev) => prev + input);
      historyIndexRef.current = -1;
    }
  });

  const lines = value.split('\n');
  const isMultiLine = lines.length > 1;
  const isEmpty = value === '';

  return (
    <Box flexDirection="column">
      {isMultiLine ? (
        <Text dimColor>  [multi-line: Shift+Enter for newline]</Text>
      ) : null}

      {isEmpty && !disabled ? (
        <Box>
          <Text color={tokens.input.prompt} bold>{prompt} </Text>
          <Text color={tokens.input.placeholder}>Type a message or /help</Text>
          <Text color={tokens.info}>▋</Text>
        </Box>
      ) : (
        lines.map((line, idx) => (
          <Box key={idx}>
            <Text color={disabled ? tokens.muted : tokens.input.prompt} bold>
              {idx === 0 ? `${prompt} ` : '  '}
            </Text>
            <Text>
              {line}
              {idx === lines.length - 1 && !disabled ? (
                <Text color={tokens.info}>▋</Text>
              ) : null}
            </Text>
          </Box>
        ))
      )}
    </Box>
  );
}
