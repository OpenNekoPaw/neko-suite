/**
 * useSlashCommands - Slash command routing
 *
 * Handles both builtin commands (/clear, /new, /help, etc.)
 * and skill-based commands (delegated to extension host).
 */

import { useCallback } from 'react';
import type { Message } from '@/components/types';
import type { SlashCommand, SkillSummary } from '@/components/ChatView/InputArea/types';
import { VSCodeMessages } from '@/components/hooks/useVSCode';

export interface UseSlashCommandsProps {
  skills: SkillSummary[];
  inputValue: string;
  setInputValue: (value: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  clearInput: () => void;
  clearMessages: () => void;
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
  onNewChat: () => void;
  conversations: Array<{ title: string; messageCount: number }>;
}

export interface UseSlashCommandsReturn {
  handleSlashCommand: (command: SlashCommand) => void;
}

export function useSlashCommands({
  skills,
  inputValue,
  setInputValue,
  setMessages,
  clearInput,
  clearMessages,
  setShowOnboarding,
  onNewChat,
  conversations,
}: UseSlashCommandsProps): UseSlashCommandsReturn {
  const handleSlashCommand = useCallback(
    (command: SlashCommand) => {
      // Handle skill commands
      if (command.source === 'skill' && command.skillId) {
        clearInput();
        VSCodeMessages.executeSkill(command.skillId, { userInput: inputValue });
        return;
      }

      // Handle builtin commands
      switch (command.id) {
        case 'clear':
          VSCodeMessages.clearHistory();
          clearMessages();
          clearInput();
          break;
        case 'new':
          onNewChat();
          clearInput();
          break;
        case 'help': {
          clearInput();
          // Build help text including skill commands
          const skillCommands = skills
            .filter((s) => s.slashCommand && s.enabled)
            .map((s) => `- \`/${s.slashCommand}\` - ${s.description}`)
            .join('\n');

          const helpContent = `**Available Commands:**
- \`/clear\` - Clear conversation history
- \`/new\` - Start a new conversation
- \`/resume\` - Show recent conversations to resume
- \`/help\` - Show this help message
- \`/image\` - Generate an image
- \`/video\` - Generate a video
- \`/script\` - Write a script
- \`/storyboard\` - Create a storyboard
- \`/configure\` - Configure AI service
${skillCommands ? `\n**Skill Commands:**\n${skillCommands}` : ''}

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
          break;
        }
        case 'resume': {
          clearInput();
          // Show recent conversations that can be resumed
          const recentConversations = conversations
            .slice(0, 5)
            .map((c, i) => `${i + 1}. **${c.title}** (${c.messageCount} messages)`)
            .join('\n');

          const resumeContent = recentConversations
            ? `**Recent Conversations:**\n${recentConversations}\n\nUse the History button (📋) in the header to open a conversation.`
            : `No conversations yet. Start a new chat!`;

          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: resumeContent,
              timestamp: Date.now(),
            },
          ]);
          break;
        }
        case 'image':
          setInputValue('/image ');
          break;
        case 'video':
          setInputValue('/video ');
          break;
        case 'script':
          setInputValue('/script ');
          break;
        case 'storyboard':
          setInputValue('/storyboard ');
          break;
        case 'configure':
          clearInput();
          setShowOnboarding(true);
          break;
        default:
          // For unhandled builtin commands, delegate to extension host
          clearInput();
          VSCodeMessages.invokeSlashCommand(command.id);
          break;
      }
    },
    [
      skills,
      inputValue,
      setInputValue,
      setMessages,
      clearInput,
      clearMessages,
      setShowOnboarding,
      onNewChat,
      conversations,
    ],
  );

  return { handleSlashCommand };
}
