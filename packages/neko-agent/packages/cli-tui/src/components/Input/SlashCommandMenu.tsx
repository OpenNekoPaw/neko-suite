/**
 * SlashCommandMenu Component
 *
 * Dropdown menu for slash command autocomplete.
 * Shows matching commands as the user types /.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { tokens } from '../../theme/tokens';

export interface SlashCommandOption {
  readonly name: string;
  readonly description: string;
}

interface SlashCommandMenuProps {
  /** Available commands */
  readonly commands: SlashCommandOption[];
  /** Current filter text (e.g., "/mod" filters to "/model") */
  readonly filter: string;
  /** Called when a command is selected */
  readonly onSelect: (command: string) => void;
  /** Called when menu is dismissed */
  readonly onDismiss: () => void;
}

export function SlashCommandMenu({
  commands,
  filter,
  onSelect,
  onDismiss,
}: SlashCommandMenuProps): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter commands based on input
  const filterText = filter.startsWith('/') ? filter.slice(1).toLowerCase() : filter.toLowerCase();
  const filtered = commands.filter((cmd) => cmd.name.toLowerCase().includes(filterText));

  useInput((_input, key) => {
    if (key.escape) {
      onDismiss();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(filtered.length - 1, prev + 1));
      return;
    }

    if (key.return || key.tab) {
      const selected = filtered[selectedIndex];
      if (selected) {
        onSelect(`/${selected.name}`);
      }
      return;
    }
  });

  if (filtered.length === 0) {
    return (
      <Box marginLeft={2}>
        <Text dimColor>No matching commands</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginLeft={2}>
      {filtered.slice(0, 8).map((cmd, idx) => (
        <Box key={cmd.name}>
          <Text
            color={idx === selectedIndex ? tokens.info : undefined}
            bold={idx === selectedIndex}
          >
            {idx === selectedIndex ? '▸ ' : '  '}/{cmd.name}
          </Text>
          <Text dimColor> {cmd.description}</Text>
        </Box>
      ))}
      {filtered.length > 8 ? <Text dimColor> ... {filtered.length - 8} more</Text> : null}
    </Box>
  );
}

/**
 * Built-in slash commands available in TUI mode.
 */
export const TUI_COMMANDS: SlashCommandOption[] = [
  { name: 'help', description: 'Show available commands' },
  { name: 'clear', description: 'Clear conversation history' },
  { name: 'compact', description: 'Compress context tokens' },
  { name: 'model', description: 'Switch or list models' },
  { name: 'config', description: 'Show/set configuration' },
  { name: 'status', description: 'Show current status' },
  { name: 'exit', description: 'Quit the TUI' },
];
