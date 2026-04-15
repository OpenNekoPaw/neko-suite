/**
 * Command Message Handlers
 *
 * Handles: slashCommandResult, historyCleared
 */

import type { MessageHandler, HandlerRegistration, MessageHandlerContext } from './types';
import type { SlashCommandResultMessage, HistoryClearedMessage } from './messages';

/**
 * Handle 'slashCommandResult' message - Result from slash command execution
 */
const handleSlashCommandResult: MessageHandler = (message: SlashCommandResultMessage, context) => {
  const msgText = message.message ?? '';
  const msgData = message.data;

  /** Append an assistant message to the chat. */
  function appendAssistantMessage(content: string, isError?: boolean) {
    context.setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'assistant' as const,
        content,
        timestamp: Date.now(),
        ...(isError ? { isError: true } : {}),
      },
    ]);
  }

  if (message.success) {
    // Handle specific actions that require UI state updates
    switch (message.action) {
      case 'exit':
        // Close current conversation tab
        closeCurrentTab(context);
        // Show goodbye message (optional, tab might be closed)
        if (msgText) {
          appendAssistantMessage(msgText);
        }
        break;

      case 'togglePlanMode':
        // Update plan mode in settings
        if (msgData && typeof msgData.planMode === 'boolean') {
          const planMode = msgData.planMode;
          context.setSettings((prev) => ({
            ...prev,
            promptMode: planMode ? 'plan' : 'default',
          }));
        }
        // Show confirmation message
        if (msgText) {
          appendAssistantMessage(msgText);
        }
        break;

      case 'showStatus':
        // Display status information
        if (msgData) {
          const statusContent = `**Status:**
- Provider: ${msgData.provider || 'Not set'}
- Model: ${msgData.model || 'Not set'}
- Conversations: ${msgData.conversationCount || 0}
- Messages in current: ${msgData.messageCount || 0}
- Context tokens: ${msgData.tokenCount || 0}
- Active skill: ${msgData.activeSkill || 'None'}
- Plan mode: ${msgData.planMode ? 'Enabled' : 'Disabled'}
- Execution mode: ${msgData.executionMode || 'normal'}`;
          appendAssistantMessage(statusContent);
        }
        break;

      case 'showSettings':
        // Settings tab removed; stay on chat tab
        context.setActiveTab('chat');
        break;

      case 'showTasks':
        // Tasks panel removed; stay on chat tab
        context.setActiveTab('chat');
        break;

      case 'showModelSelector':
        // Settings tab removed; model selector is in AccountBar
        context.setActiveTab('chat');
        break;

      case 'showMCPServers':
        // MCP config is now file-based; no dedicated UI tab
        context.setActiveTab('chat');
        break;

      case 'showPermissions':
        // Settings tab removed; stay on chat tab
        context.setActiveTab('chat');
        break;

      case 'showHelp':
        // Help is handled locally in handleSlashCommand (index.tsx)
        // This case is for when extension sends help action
        break;

      case 'initProject':
        appendAssistantMessage(`**Project Initialization**

To initialize your project, you can:
1. Create a \`.neko/\` directory in your project root
2. Add skills in \`.neko/skills/\` directory
3. Add commands in \`.neko/commands/\` directory
4. Configure hooks in \`.neko/hooks/\` directory

Or use the Settings panel to configure providers and models.`);
        break;

      case 'resumeConversation':
        // Show conversation list for resuming
        if (msgData?.conversations && Array.isArray(msgData.conversations)) {
          const conversationList = (
            msgData.conversations as Array<{ title: string; messageCount: number }>
          )
            .slice(0, 5)
            .map((c, i) => `${i + 1}. **${c.title}** (${c.messageCount} messages)`)
            .join('\n');

          appendAssistantMessage(
            conversationList
              ? `**Recent Conversations:**\n${conversationList}\n\nClick on a conversation in the sidebar to resume it.`
              : 'No conversations to resume. Start a new chat!',
          );
        } else {
          appendAssistantMessage(
            'Use the conversation list in the sidebar to resume a previous conversation.',
          );
        }
        break;

      default:
        // Show success message if provided
        if (msgText) {
          appendAssistantMessage(msgText);
        }
    }
  } else {
    appendAssistantMessage(message.error || 'Command failed', true);
  }
};

/**
 * Close the current conversation tab
 */
function closeCurrentTab(context: MessageHandlerContext): void {
  const { openTabs, activeConversationId, setOpenTabs, setActiveTabId, setActiveConversationId } =
    context;

  if (!activeConversationId) return;

  // Find the current tab
  const currentTab = openTabs.find((t) => t.conversationId === activeConversationId);
  if (!currentTab) return;

  // Remove the tab
  const tabIndex = openTabs.findIndex((t) => t.id === currentTab.id);
  const newTabs = openTabs.filter((t) => t.id !== currentTab.id);
  setOpenTabs(newTabs);

  // Switch to another tab if available
  if (newTabs.length > 0) {
    const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
    const newActiveTab = newTabs[newActiveIndex];
    if (newActiveTab) {
      setActiveTabId(newActiveTab.id);
      setActiveConversationId(newActiveTab.conversationId);
    }
  } else {
    setActiveTabId(null);
    setActiveConversationId(null);
  }
}

/**
 * Handle 'historyCleared' message - Conversation history cleared
 */
const handleHistoryCleared: MessageHandler = (_message: HistoryClearedMessage, context) => {
  // Clear messages in UI
  context.setMessages([]);
};

/**
 * All command handler registrations
 */
export const commandHandlers: HandlerRegistration[] = [
  { type: 'slashCommandResult', handler: handleSlashCommandResult },
  { type: 'historyCleared', handler: handleHistoryCleared },
];
