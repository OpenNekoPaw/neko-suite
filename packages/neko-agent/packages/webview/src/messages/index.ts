/**
 * VSCode Message Builders
 *
 * Type-safe communication between the Assistant UI webview
 * and the VS Code extension host via postMessage.
 *
 * Core VSCode API is imported from @neko/shared.
 * Each method constructs and sends a properly typed message.
 */

import { getVSCodeAPI, postMessage, type VSCodeAPI } from '@neko/shared/vscode';

// Re-export for backward compatibility
export { postMessage, type VSCodeAPI };

/**
 * VSCode API instance, or null if running outside VS Code
 */
export const vscode = getVSCodeAPI();

/**
 * Type-safe message builders for Extension ↔ Webview communication.
 * Each method constructs and sends a properly typed message.
 */
export const VSCodeMessages = {
  /**
   * Send a chat message to the AI assistant
   * @param message - The user's message text
   * @param providerId - Optional provider ID to use
   * @param modelId - Optional model ID to use
   * @param attachments - Optional file attachments
   * @param promptId - Optional prompt preset ID
   * @param conversationId - Optional conversation ID (for session binding)
   * @param messageTrackingId - Optional unique message ID for end-to-end tracking
   */
  sendMessage: (
    message: string,
    providerId?: string,
    modelId?: string,
    attachments?: Array<{
      id: string;
      name: string;
      type: 'file' | 'image' | 'video' | 'audio';
      path?: string;
      size?: number;
      preview?: string;
    }>,
    promptId?: string,
    conversationId?: string,
    messageTrackingId?: string,
    sessionMode?: string,
    mediaProviderId?: string,
    mediaModelId?: string,
    /** Per-category media model selection for agent mode */
    agentMediaModels?: {
      image?: { providerId?: string; modelId: string };
      video?: { providerId?: string; modelId: string };
      audio?: { providerId?: string; modelId: string };
    },
  ) => {
    postMessage({
      type: 'sendMessage',
      message,
      providerId,
      modelId,
      attachments,
      promptId,
      conversationId,
      messageTrackingId,
      sessionMode,
      mediaProviderId,
      mediaModelId,
      agentMediaModels,
    });
  },

  /** Create a new conversation */
  newConversation: () => {
    postMessage({ type: 'newConversation' });
  },

  /**
   * Switch to a different conversation
   * @param conversationId - The conversation ID to switch to
   */
  switchConversation: (conversationId: string) => {
    postMessage({ type: 'switchConversation', conversationId });
  },

  /**
   * Delete a conversation
   * @param conversationId - The conversation ID to delete
   */
  deleteConversation: (conversationId: string) => {
    postMessage({ type: 'deleteConversation', conversationId });
  },

  /** Clear all conversations */
  clearAllConversations: () => {
    postMessage({ type: 'clearAllConversations' });
  },

  /** Request the list of all conversations */
  getConversations: () => {
    postMessage({ type: 'getConversations' });
  },

  /** Request the active conversation data */
  getActiveConversation: () => {
    postMessage({ type: 'getActiveConversation' });
  },

  /** Request current settings */
  getSettings: () => {
    postMessage({ type: 'getSettings' });
  },

  /** Clear all conversation history */
  clearHistory: () => {
    postMessage({ type: 'clearHistory' });
  },

  /**
   * Search for files in the project
   * @param filter - Search filter string
   */
  searchProjectFiles: (filter: string) => {
    postMessage({ type: 'searchProjectFiles', filter });
  },

  /**
   * Update settings
   * @param settings - Settings object to update
   */
  updateSettings: (settings: Record<string, unknown>) => {
    postMessage({ type: 'updateSettings', settings });
  },

  /**
   * Confirm or reject a tool execution
   * @param toolCallId - The tool call ID
   * @param approved - Whether the tool is approved
   * @param conversationId - Optional conversation ID for multi-tab safety
   */
  confirmTool: (toolCallId: string, approved: boolean, conversationId?: string) => {
    postMessage({ type: 'confirmTool', toolCallId, approved, conversationId });
  },

  /**
   * Cancel the current AI message generation
   * Stops the agent execution and streaming response
   */
  cancelMessage: () => {
    postMessage({ type: 'cancelMessage' });
  },

  /** Request the list of background tasks */
  getTasks: () => {
    postMessage({ type: 'getTasks' });
  },

  /** Request current agent states snapshot */
  getAgentStates: () => {
    postMessage({ type: 'getAgentStates' });
  },

  /**
   * Cancel a running task
   * @param taskId - The task ID to cancel
   */
  cancelTask: (taskId: string) => {
    postMessage({ type: 'cancelTask', taskId });
  },

  /**
   * Remove a task from the list
   * @param taskId - The task ID to remove
   */
  removeTask: (taskId: string) => {
    postMessage({ type: 'removeTask', taskId });
  },

  /**
   * View a task's result
   * @param taskId - The task ID
   */
  viewTaskResult: (taskId: string) => {
    postMessage({ type: 'viewTaskResult', taskId });
  },

  /** Clear all completed tasks */
  clearCompletedTasks: () => {
    postMessage({ type: 'clearCompletedTasks' });
  },

  /** Request full configuration from extension */
  getConfig: () => {
    postMessage({ type: 'getConfig' });
  },

  // ==========================================================================
  // Skill Operations
  // ==========================================================================

  /**
   * Execute a skill by ID
   * @param skillId - The skill ID to execute
   * @param input - Input parameters for the skill
   */
  executeSkill: (skillId: string, input: Record<string, unknown> = {}) => {
    postMessage({ type: 'executeSkill', skillId, input });
  },

  /**
   * Respond to a skill confirmation request
   * @param skillName - The skill name
   * @param confirmed - Whether the user confirmed
   * @param conversationId - The conversation this confirmation belongs to
   */
  confirmSkill: (skillName: string, confirmed: boolean, conversationId?: string) => {
    postMessage({ type: 'skillConfirmResponse', skillName, confirmed, conversationId });
  },

  // ==========================================================================
  // Context Management
  // ==========================================================================

  /**
   * Get context token count for a conversation
   * @param conversationId - The conversation ID
   */
  getContextTokenCount: (conversationId?: string) => {
    postMessage({ type: 'getContextTokenCount', conversationId });
  },

  /**
   * Trigger context compression for a conversation
   * @param conversationId - The conversation ID
   */
  compressContext: (conversationId?: string) => {
    postMessage({ type: 'compressContext', conversationId });
  },

  // ==========================================================================
  // Plan Review Operations
  // ==========================================================================

  /**
   * Approve a single step in a plan
   * @param planId - The plan ID
   * @param stepId - The step ID to approve
   * @param conversationId - The conversation ID
   */
  approvePlanStep: (planId: string, stepId: string, conversationId?: string) => {
    postMessage({ type: 'planStepApprove', planId, stepId, conversationId });
  },

  /**
   * Reject a single step in a plan
   * @param planId - The plan ID
   * @param stepId - The step ID to reject
   * @param conversationId - The conversation ID
   */
  rejectPlanStep: (planId: string, stepId: string, conversationId?: string) => {
    postMessage({ type: 'planStepReject', planId, stepId, conversationId });
  },

  /**
   * Modify a step's description in a plan
   * @param planId - The plan ID
   * @param stepId - The step ID to modify
   * @param newDescription - The new description for the step
   * @param conversationId - The conversation ID
   */
  modifyPlanStep: (
    planId: string,
    stepId: string,
    newDescription: string,
    conversationId?: string,
  ) => {
    postMessage({ type: 'planStepModify', planId, stepId, newDescription, conversationId });
  },

  /**
   * Approve all pending steps in a plan (approve entire plan)
   * @param planId - The plan ID
   * @param conversationId - The conversation ID
   */
  approveAllPlanSteps: (planId: string, conversationId?: string) => {
    postMessage({ type: 'planApprove', planId, conversationId });
  },

  /**
   * Reject all pending steps in a plan (reject entire plan)
   * @param planId - The plan ID
   * @param conversationId - The conversation ID
   */
  rejectAllPlanSteps: (planId: string, conversationId?: string) => {
    postMessage({ type: 'planReject', planId, conversationId });
  },

  // ==========================================================================
  // Tab State Operations
  // ==========================================================================

  /** Request the current tab state */
  getTabState: () => {
    postMessage({ type: 'getTabState' });
  },

  /**
   * Update tab state (persist to extension)
   * @param openTabs - Array of open tabs
   * @param activeTabId - Currently active tab ID
   */
  updateTabState: (
    openTabs: Array<{ id: string; title: string; conversationId: string }>,
    activeTabId: string | null,
  ) => {
    postMessage({ type: 'updateTabState', openTabs, activeTabId });
  },

  // ==========================================================================
  // File Operations
  // ==========================================================================

  /**
   * Open a file in VSCode editor
   * @param filePath - The file path to open
   * @param options - Optional options (preview, line number, etc.)
   */
  openFile: (filePath: string, options?: { preview?: boolean; line?: number; column?: number }) => {
    postMessage({ type: 'openFile', filePath, options });
  },

  // ==========================================================================
  // Prompt Mode
  // ==========================================================================

  /**
   * Set prompt mode (default or plan)
   * @param mode - The mode to set
   */
  setPromptMode: (mode: 'default' | 'plan') => {
    postMessage({ type: 'setPromptMode', mode });
  },

  /**
   * Invoke a skill via slash command
   * @param command - Slash command (without /)
   * @param args - Optional arguments
   */
  invokeSlashCommand: (command: string, args?: string) => {
    postMessage({ type: 'invokeSlashCommand', command, args });
  },

  /**
   * Invoke a plugin slash command registered by an external extension.
   * Extension host routes it to the registering extension via VSCode command API.
   * @param extensionId - The extension that registered the command
   * @param commandId   - The command id (without /)
   * @param args        - Optional arguments string
   */
  invokePluginSlashCommand: (extensionId: string, commandId: string, args?: string) => {
    postMessage({ type: 'invokePluginSlashCommand', extensionId, commandId, args });
  },

  // ===========================================================================
  // Skill Marketplace
  // ===========================================================================

  /** Search marketplace skills */
  marketSearch: (query: { text?: string; tags?: string[]; page?: number }) => {
    postMessage({ type: 'market:search', query: { ...query, types: ['skill'] } });
  },

  /** Install a skill from marketplace */
  marketInstall: (packageId: string, version: string) => {
    postMessage({ type: 'market:install', packageId, version });
  },

  /** Uninstall a marketplace skill */
  marketUninstall: (packageId: string) => {
    postMessage({ type: 'market:uninstall', packageId });
  },

  /** Get list of installed marketplace skills */
  marketListInstalled: () => {
    postMessage({ type: 'market:listInstalled' });
  },

  /** Check for updates */
  marketCheckUpdates: () => {
    postMessage({ type: 'market:checkUpdates' });
  },

  /** Get featured skills */
  marketGetFeatured: () => {
    postMessage({ type: 'market:getFeatured' });
  },

  /** Open the full Neko Marketplace panel (neko-market extension) */
  openMarketplace: () => {
    postMessage({ type: 'openMarketplace' });
  },

  // -------------------------------------------------------------------------
  // Outbound actions previously sent via direct vscode.postMessage
  // -------------------------------------------------------------------------

  /** Open an external URL in the default browser */
  openUrl: (url: string) => {
    postMessage({ type: 'openUrl', url });
  },

  /** Send an asset to another extension (canvas, cut, sketch) */
  sendToPlugin: (target: string, assetPath: string, mediaType: string) => {
    postMessage({ type: 'sendToPlugin', target, assetPath, mediaType });
  },

  /** Retry a failed background task */
  retryTask: (taskId: string) => {
    postMessage({ type: 'retryTask', taskId });
  },

  /** Download a Mermaid diagram as SVG file */
  downloadSvg: (svg: string, filename: string) => {
    postMessage({ type: 'downloadSvg', svg, filename });
  },

  /** Report a Mermaid rendering error — sends feedback as user message to AI */
  mermaidError: (error: string, code: string, feedbackMessage: string) => {
    postMessage({ type: 'mermaidError', error, code, feedbackMessage });
  },

  /** Reveal a file in the OS file manager */
  revealFile: (filePath: string) => {
    postMessage({ type: 'revealFile', filePath });
  },

  /** Notify Extension Host that a drag operation started (DnD) */
  dndStart: (asset: { path: string; mediaType: string; name: string }) => {
    postMessage({ type: 'dnd:start', asset });
  },
};
