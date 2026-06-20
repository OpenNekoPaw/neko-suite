/**
 * useSlashCommands - Slash command routing
 *
 * Uses a single slash command catalog for menu/help/routing.
 */

import { useCallback } from 'react';
import type { Message } from '@neko-agent/types';
import type {
  SlashCommand,
  SkillInvocation,
  SkillSummary,
  PluginSlashCommandDef,
} from '@/components/ChatView/InputArea/types';
import {
  createSkillInvocationCatalog,
  createSlashCommandCatalog,
  extractSkillInvocationArgs,
  extractSlashCommandArgs,
  formatSkillInvocationHelpCatalog,
  formatSlashCommandHelpCatalog,
} from '@/components/ChatView/InputArea/slash-command-catalog';
import { useTranslation } from '@/i18n/I18nContext';
import { VSCodeMessages } from '@/messages';

export interface UseSlashCommandsProps {
  skills: SkillSummary[];
  pluginCommands: PluginSlashCommandDef[];
  inputValue: string;
  activeConversationId: string | null;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  clearInput: () => void;
}

export interface UseSlashCommandsReturn {
  handleSlashCommand: (command: SlashCommand) => void;
  handleSkillInvocation: (skill: SkillInvocation) => void;
}

export function useSlashCommands({
  skills,
  pluginCommands,
  inputValue,
  activeConversationId,
  setMessages,
  clearInput,
}: UseSlashCommandsProps): UseSlashCommandsReturn {
  const { t } = useTranslation();

  const handleSlashCommand = useCallback(
    (command: SlashCommand) => {
      const args = extractSlashCommandArgs(inputValue, command);

      // Handle plugin commands (registered by external extensions)
      if (command.source === 'plugin' && command.extensionId) {
        if (!activeConversationId) {
          return;
        }
        clearInput();
        VSCodeMessages.invokePluginSlashCommand(
          command.extensionId,
          command.commandId ?? command.id,
          activeConversationId,
          args,
        );
        return;
      }

      if (command.commandId === 'help' || command.id === 'help') {
        clearInput();

        const catalog = createSlashCommandCatalog(skills, pluginCommands);
        const skillCatalog = createSkillInvocationCatalog(skills);
        const sections = [
          formatSlashCommandHelpCatalog(catalog, t),
          formatSkillInvocationHelpCatalog(skillCatalog, t),
        ]
          .filter(Boolean)
          .join('\n\n');

        const helpContent = `${sections}

**Tips:**
- Use \`$\` to invoke Skills
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

      if (!activeConversationId) {
        return;
      }

      clearInput();
      VSCodeMessages.invokeSlashCommand(
        command.commandId ?? command.id,
        args,
        activeConversationId,
      );
    },
    [activeConversationId, clearInput, inputValue, pluginCommands, setMessages, skills, t],
  );

  const handleSkillInvocation = useCallback(
    (skill: SkillInvocation) => {
      if (!activeConversationId) {
        return;
      }
      const args = extractSkillInvocationArgs(inputValue, skill);
      clearInput();
      VSCodeMessages.invokeSkill(skill.skillName, args, activeConversationId);
    },
    [activeConversationId, clearInput, inputValue],
  );

  return { handleSlashCommand, handleSkillInvocation };
}
