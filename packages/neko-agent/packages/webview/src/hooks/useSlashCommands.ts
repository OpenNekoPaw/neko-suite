/**
 * useSlashCommands - Slash command routing
 *
 * Uses a single slash command catalog for menu/help/routing.
 */

import { useCallback } from 'react';
import type { Message } from '@/components/types';
import type {
  SlashCommand,
  SkillSummary,
  PluginSlashCommandDef,
} from '@/components/ChatView/InputArea/types';
import {
  createSlashCommandCatalog,
  extractSlashCommandArgs,
  formatSlashCommandHelpCatalog,
} from '@/components/ChatView/InputArea/slash-command-catalog';
import { useTranslation } from '@/i18n/I18nContext';
import { VSCodeMessages } from '@/components/hooks/useVSCode';

export interface UseSlashCommandsProps {
  skills: SkillSummary[];
  pluginCommands: PluginSlashCommandDef[];
  inputValue: string;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  clearInput: () => void;
}

export interface UseSlashCommandsReturn {
  handleSlashCommand: (command: SlashCommand) => void;
}

export function useSlashCommands({
  skills,
  pluginCommands,
  inputValue,
  setMessages,
  clearInput,
}: UseSlashCommandsProps): UseSlashCommandsReturn {
  const { t } = useTranslation();

  const handleSlashCommand = useCallback(
    (command: SlashCommand) => {
      const args = extractSlashCommandArgs(inputValue, command);

      // Handle plugin commands (registered by external extensions)
      if (command.source === 'plugin' && command.extensionId) {
        clearInput();
        VSCodeMessages.invokePluginSlashCommand(
          command.extensionId,
          command.commandId ?? command.id,
          args,
        );
        return;
      }

      if (command.commandId === 'help' || command.id === 'help') {
        clearInput();

        const catalog = createSlashCommandCatalog(skills, pluginCommands);
        const sections = formatSlashCommandHelpCatalog(catalog, t);

        const helpContent = `${sections}

**Tips:**
- Use \`@\` to reference files
- Attach files using the 📎 button
- Press Enter to send, Shift+Enter for new line`;

        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: helpContent,
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      clearInput();
      VSCodeMessages.invokeSlashCommand(command.commandId ?? command.id, args);
    },
    [clearInput, inputValue, pluginCommands, setMessages, skills, t],
  );

  return { handleSlashCommand };
}
