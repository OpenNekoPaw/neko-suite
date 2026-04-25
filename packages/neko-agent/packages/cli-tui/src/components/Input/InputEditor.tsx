/**
 * InputEditor Component
 *
 * Multi-line text input with command history and slash command menu.
 * - Enter: submit input (or select menu item when menu is open)
 * - Shift+Enter / Ctrl+J: add newline (multi-line mode)
 * - Up/Down: navigate command history (or menu items)
 * - /: prefix triggers inline slash command menu
 * - Esc: dismiss menu
 * - Tab: select menu item
 */

import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { tokens } from '../../theme/tokens';
import { TUI_COMMANDS, type SlashCommandOption } from './SlashCommandMenu';

interface InputEditorProps {
  /** Called when user submits a prompt */
  readonly onSubmit: (text: string) => void;
  /** Whether input is disabled (agent running) */
  readonly disabled?: boolean;
  /** Prompt prefix character */
  readonly prompt?: string;
  /** Called when slash command detected (starts with /) */
  readonly onSlashCommand?: (input: string) => void;
  /** Available slash commands for menu/autocomplete */
  readonly commands?: readonly SlashCommandOption[];
}

const MAX_HISTORY = 50;

export function InputEditor({
  onSubmit,
  disabled = false,
  prompt = '>',
  onSlashCommand,
  commands = TUI_COMMANDS,
}: InputEditorProps): React.JSX.Element {
  const [value, setValue] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  // Filter commands based on current input
  const filterText = value.startsWith('/') ? value.slice(1).toLowerCase() : '';
  const filtered: SlashCommandOption[] = menuOpen
    ? commands.filter((cmd) => cmd.name.toLowerCase().startsWith(filterText))
    : [];

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

    // --- Menu open: intercept navigation keys ---
    if (menuOpen) {
      if (key.escape) {
        setMenuOpen(false);
        return;
      }

      if (key.upArrow) {
        setMenuIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        setMenuIndex((prev) => Math.min(filtered.length - 1, prev + 1));
        return;
      }

      // Tab or Enter on menu → select command and fill input
      if (key.tab || (key.return && !key.shift)) {
        const selected = filtered[menuIndex];
        if (selected) {
          const cmd = `/${selected.name} `;
          setValue(cmd);
          setMenuOpen(false);
          setMenuIndex(0);
        }
        return;
      }

      // Backspace in menu
      if (key.backspace || key.delete) {
        const next = value.slice(0, -1);
        if (!next.startsWith('/')) {
          setMenuOpen(false);
        }
        setValue(next);
        setMenuIndex(0);
        return;
      }

      // Regular typing while menu open — update filter
      if (input && !key.ctrl && !key.meta) {
        const next = value + input;
        // If it has a space, it's a full command — close menu and keep typing
        if (next.includes(' ')) {
          setMenuOpen(false);
          setValue(next);
        } else {
          setValue(next);
          setMenuIndex(0);
        }
        return;
      }

      return;
    }

    // --- Normal mode ---

    // Enter → submit
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
      const next = value + input;
      setValue(next);
      historyIndexRef.current = -1;

      // Open menu when typing `/` at the start
      if (next === '/' || (next.startsWith('/') && !next.includes(' '))) {
        setMenuOpen(true);
        setMenuIndex(0);
      }
    }
  });

  const lines = value.split('\n');
  const isMultiLine = lines.length > 1;
  const isEmpty = value === '';

  return (
    <Box flexDirection="column">
      {/* Slash command menu — above the input box */}
      {menuOpen && filtered.length > 0 ? (
        <SlashMenu items={filtered} selectedIndex={menuIndex} maxVisible={8} />
      ) : null}

      {/* Input box */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={disabled ? tokens.muted : 'white'}
        paddingLeft={1}
        paddingRight={1}
      >
        {isMultiLine ? <Text dimColor> [multi-line: Shift+Enter for newline]</Text> : null}

        {isEmpty && !disabled ? (
          <Box>
            <Text bold>{prompt} </Text>
            <Text color={tokens.muted}>▋</Text>
          </Box>
        ) : (
          lines.map((line, idx) => (
            <Box key={idx}>
              <Text color={disabled ? tokens.muted : undefined} bold>
                {idx === 0 ? `${prompt} ` : '  '}
              </Text>
              <Text color={disabled ? tokens.muted : undefined}>
                {line}
                {idx === lines.length - 1 && !disabled ? <Text color={tokens.muted}>▋</Text> : null}
              </Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

// =============================================================================
// SlashMenu — bordered, scrollable command menu
// =============================================================================

interface SlashMenuProps {
  readonly items: SlashCommandOption[];
  readonly selectedIndex: number;
  /** Max visible rows before scrolling */
  readonly maxVisible?: number;
}

function SlashMenu({ items, selectedIndex, maxVisible = 8 }: SlashMenuProps): React.JSX.Element {
  const total = items.length;
  const visibleCount = Math.min(total, maxVisible);

  // Compute scroll window that keeps selectedIndex visible
  let scrollTop = 0;
  if (total > visibleCount) {
    // Keep selected item roughly centered, clamped to bounds
    scrollTop = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(visibleCount / 2), total - visibleCount),
    );
  }

  const visible = items.slice(scrollTop, scrollTop + visibleCount);
  const hasScrollUp = scrollTop > 0;
  const hasScrollDown = scrollTop + visibleCount < total;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={tokens.muted}
      paddingLeft={1}
      paddingRight={1}
      marginLeft={2}
    >
      {/* Scroll-up indicator */}
      {hasScrollUp ? <Text dimColor> ↑ {scrollTop} more</Text> : null}

      {visible.map((cmd, visIdx) => {
        const realIdx = scrollTop + visIdx;
        const isSelected = realIdx === selectedIndex;
        return (
          <Box key={cmd.name}>
            <Text color={isSelected ? tokens.info : undefined} bold={isSelected}>
              {isSelected ? '▸ ' : '  '}/{cmd.name}
            </Text>
            <Text dimColor> {cmd.description}</Text>
          </Box>
        );
      })}

      {/* Scroll-down indicator */}
      {hasScrollDown ? <Text dimColor> ↓ {total - scrollTop - visibleCount} more</Text> : null}
    </Box>
  );
}
