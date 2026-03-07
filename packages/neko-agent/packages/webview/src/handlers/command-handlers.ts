/**
 * Command Message Handlers
 *
 * Handles: slashCommandResult, historyCleared
 */

import type { MessageHandler, HandlerRegistration, MessageHandlerContext } from './types';

/**
 * Handle 'slashCommandResult' message - Result from slash command execution
 */
const handleSlashCommandResult: MessageHandler = (message, context) => {
  if (message.success) {
    // Handle specific actions that require UI state updates
    switch (message.action) {
      case 'exit':
        // Close current conversation tab
        closeCurrentTab(context);
        // Show goodbye message (optional, tab might be closed)
        if (message.message) {
          context.setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: message.message,
              timestamp: Date.now(),
            },
          ]);
        }
        break;

      case 'togglePlanMode':
        // Update plan mode in settings
        if (message.data && typeof message.data.planMode === 'boolean') {
          context.setSettings(prev => ({
            ...prev,
            promptMode: message.data.planMode ? 'plan' : 'default',
          }));
        }
        // Show confirmation message
        if (message.message) {
          context.setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: message.message,
              timestamp: Date.now(),
            },
          ]);
        }
        break;

      case 'showStatus':
        // Display status information
        if (message.data) {
          const statusContent = `**Status:**
- Provider: ${message.data.provider || 'Not set'}
- Model: ${message.data.model || 'Not set'}
- Conversations: ${message.data.conversationCount || 0}
- Messages in current: ${message.data.messageCount || 0}
- Context tokens: ${message.data.tokenCount || 0}
- Active skill: ${message.data.activeSkill || 'None'}
- Plan mode: ${message.data.planMode ? 'Enabled' : 'Disabled'}
- Execution mode: ${message.data.executionMode || 'normal'}`;
          context.setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: statusContent,
              timestamp: Date.now(),
            },
          ]);
        }
        break;

      case 'showSettings':
        // Settings tab removed; stay on chat tab
        context.setActiveTab('chat');
        break;

      case 'showTasks':
        context.setActiveTab('tasks');
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
        // Show project initialization message
        context.setMessages(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: `**Project Initialization**

To initialize your project, you can:
1. Create a \`.neko/\` directory in your project root
2. Add skills in \`.neko/skills/\` directory
3. Add commands in \`.neko/commands/\` directory
4. Configure hooks in \`.neko/hooks/\` directory

Or use the Settings panel to configure providers and models.`,
            timestamp: Date.now(),
          },
        ]);
        break;

      case 'resumeConversation':
        // Show conversation list for resuming
        if (message.data?.conversations && Array.isArray(message.data.conversations)) {
          const conversationList = message.data.conversations
            .slice(0, 5)
            .map((c: { title: string; messageCount: number }, i: number) =>
              `${i + 1}. **${c.title}** (${c.messageCount} messages)`)
            .join('\n');

          context.setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: conversationList
                ? `**Recent Conversations:**\n${conversationList}\n\nClick on a conversation in the sidebar to resume it.`
                : 'No conversations to resume. Start a new chat!',
              timestamp: Date.now(),
            },
          ]);
        } else {
          // Fallback: show generic message
          context.setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: 'Use the conversation list in the sidebar to resume a previous conversation.',
              timestamp: Date.now(),
            },
          ]);
        }
        break;

      default:
        // Show success message if provided
        if (message.message) {
          context.setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: message.message,
              timestamp: Date.now(),
            },
          ]);
        }
    }
  } else {
    // Show error message
    context.setMessages(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error: ${message.error || 'Command failed'}`,
        timestamp: Date.now(),
      },
    ]);
  }
};

/**
 * Close the current conversation tab
 */
function closeCurrentTab(context: MessageHandlerContext): void {
  const { openTabs, activeConversationId, setOpenTabs, setActiveTabId, setActiveConversationId } = context;

  if (!activeConversationId) return;

  // Find the current tab
  const currentTab = openTabs.find(t => t.conversationId === activeConversationId);
  if (!currentTab) return;

  // Remove the tab
  const tabIndex = openTabs.findIndex(t => t.id === currentTab.id);
  const newTabs = openTabs.filter(t => t.id !== currentTab.id);
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
const handleHistoryCleared: MessageHandler = (_message, context) => {
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
