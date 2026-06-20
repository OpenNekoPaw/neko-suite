/**
 * VSCode Message Builders
 *
 * Type-safe communication between the Assistant UI webview
 * and the VS Code extension host via postMessage.
 *
 * Core VSCode API is imported from @neko/shared.
 * Each method constructs and sends a properly typed message.
 */

import { getVSCodeAPI, postMessage as postRawMessage, type VSCodeAPI } from '@neko/shared/vscode';
import type {
  PluginTransferPayload,
  SendMessageWebviewMessage,
  WebviewToExtensionMessage,
} from '@neko-agent/types';
import type { DocumentLocator, DocumentSourceRef } from '@neko/shared';
import type { AgentContextType } from '@neko/shared';

export { postRawMessage as postMessage, type VSCodeAPI };

/**
 * VSCode API instance, or null if running outside VS Code
 */
export const vscode = getVSCodeAPI();

function postWebviewMessage(message: WebviewToExtensionMessage): void {
  postRawMessage(message);
}

/**
 * Type-safe message builders for Extension ↔ Webview communication.
 * Each method constructs and sends a properly typed message.
 */
export const VSCodeMessages = {
  /**
   * Send a chat message to the AI assistant.
   * conversationId and model refs are explicit to avoid multi-tab leakage.
   */
  sendMessage: (payload: Omit<SendMessageWebviewMessage, 'type'>) => {
    postWebviewMessage({ type: 'sendMessage', ...payload });
  },

  /** Create a new conversation */
  newConversation: () => {
    postWebviewMessage({ type: 'newConversation' });
  },

  /**
   * Switch to a different conversation
   * @param conversationId - The conversation ID to switch to
   */
  switchConversation: (conversationId: string) => {
    postWebviewMessage({ type: 'switchConversation', conversationId });
  },

  /**
   * Delete a conversation
   * @param conversationId - The conversation ID to delete
   */
  deleteConversation: (conversationId: string, options?: { activateNext?: boolean }) => {
    postWebviewMessage({
      type: 'deleteConversation',
      conversationId,
      ...(options?.activateNext !== undefined ? { activateNext: options.activateNext } : {}),
    });
  },

  /** Clear all conversations */
  clearAllConversations: () => {
    postWebviewMessage({ type: 'clearAllConversations' });
  },

  /** Request the list of all conversations */
  getConversations: () => {
    postWebviewMessage({ type: 'getConversations' });
  },

  /** Request the active conversation data */
  getActiveConversation: () => {
    postWebviewMessage({ type: 'getActiveConversation' });
  },

  /** Request current settings */
  getSettings: () => {
    postWebviewMessage({ type: 'getSettings' });
  },

  /** Request a lifecycle-scoped config/settings snapshot */
  refreshConfigSnapshot: () => {
    postWebviewMessage({ type: 'refreshConfigSnapshot' });
  },

  /** Clear all conversation history */
  clearHistory: (conversationId: string) => {
    postWebviewMessage({ type: 'clearHistory', conversationId });
  },

  /**
   * Search for files in the project
   * @param filter - Search filter string
   */
  searchProjectFiles: (filter: string, conversationId: string) => {
    postWebviewMessage({ type: 'searchProjectFiles', filter, conversationId });
  },

  /**
   * Update settings
   * @param settings - Settings object to update
   */
  updateSettings: (settings: Record<string, unknown>) => {
    postWebviewMessage({ type: 'updateSettings', settings });
  },

  /**
   * Confirm or reject a tool execution
   * @param toolCallId - The tool call ID
   * @param approved - Whether the tool is approved
   * @param conversationId - Conversation ID for multi-tab safety
   */
  confirmTool: (toolCallId: string, approved: boolean, conversationId: string) => {
    postWebviewMessage({ type: 'confirmTool', toolCallId, approved, conversationId });
  },

  /**
   * Cancel the current AI message generation
   * Stops the agent execution and streaming response
   * @param conversationId - Conversation ID for multi-tab safety
   */
  cancelMessage: (conversationId: string) => {
    postWebviewMessage({ type: 'cancelMessage', conversationId });
  },

  /** Exit an active Embody Character feedback session */
  exitEmbodyCharacterSession: (sessionId: string) => {
    postWebviewMessage({ type: 'exitEmbodyCharacterSession', sessionId });
  },

  /** Request the list of background tasks */
  getTasks: (conversationId: string) => {
    postWebviewMessage({ type: 'getTasks', conversationId });
  },

  /** Request current agent states snapshot */
  getAgentStates: () => {
    postWebviewMessage({ type: 'getAgentStates' });
  },

  /**
   * Cancel a running task
   * @param taskId - The task ID to cancel
   */
  cancelTask: (taskId: string, conversationId: string) => {
    postWebviewMessage({ type: 'cancelTask', taskId, conversationId });
  },

  /**
   * View a task's result
   * @param taskId - The task ID
   */
  viewTaskResult: (taskId: string, conversationId: string) => {
    postWebviewMessage({ type: 'viewTaskResult', taskId, conversationId });
  },

  /** Request full configuration from extension */
  getConfig: () => {
    postWebviewMessage({ type: 'getConfig' });
  },

  /** Request skills used by the input slash-command catalog */
  getSkills: () => {
    postWebviewMessage({ type: 'getSkills' });
  },

  /** Open raw user config in VSCode */
  openUserConfigFile: () => {
    postWebviewMessage({ type: 'openUserConfigFile' });
  },

  /** Open agent config file in VSCode */
  openConfigFile: () => {
    postWebviewMessage({ type: 'openConfigFile' });
  },

  // ==========================================================================
  // Skill Operations
  // ==========================================================================

  /** Clear active skill for the current conversation */
  clearActiveSkill: (conversationId: string) => {
    postWebviewMessage({ type: 'clearActiveSkill', conversationId });
  },

  // ==========================================================================
  // Context Management
  // ==========================================================================

  /**
   * Get context token count for a conversation
   * @param conversationId - The conversation ID
   */
  getContextTokenCount: (conversationId: string) => {
    postWebviewMessage({ type: 'getContextTokenCount', conversationId });
  },

  /**
   * Trigger context compression for a conversation
   * @param conversationId - The conversation ID
   */
  compressContext: (conversationId: string) => {
    postWebviewMessage({ type: 'compressContext', conversationId });
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
  approvePlanStep: (planId: string, stepId: string, conversationId: string) => {
    postWebviewMessage({ type: 'planStepApprove', planId, stepId, conversationId });
  },

  /**
   * Reject a single step in a plan
   * @param planId - The plan ID
   * @param stepId - The step ID to reject
   * @param conversationId - The conversation ID
   */
  rejectPlanStep: (planId: string, stepId: string, conversationId: string) => {
    postWebviewMessage({ type: 'planStepReject', planId, stepId, conversationId });
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
    conversationId: string,
  ) => {
    postWebviewMessage({ type: 'planStepModify', planId, stepId, newDescription, conversationId });
  },

  /**
   * Approve all pending steps in a plan (approve entire plan)
   * @param planId - The plan ID
   * @param conversationId - The conversation ID
   */
  approveAllPlanSteps: (planId: string, conversationId: string) => {
    postWebviewMessage({ type: 'planApprove', planId, conversationId });
  },

  /**
   * Reject all pending steps in a plan (reject entire plan)
   * @param planId - The plan ID
   * @param conversationId - The conversation ID
   */
  rejectAllPlanSteps: (planId: string, conversationId: string) => {
    postWebviewMessage({ type: 'planReject', planId, conversationId });
  },

  // ==========================================================================
  // Tab State Operations
  // ==========================================================================

  /** Request the current tab state */
  getTabState: () => {
    postWebviewMessage({ type: 'getTabState' });
  },

  /**
   * Update tab state (persist to extension)
   * @param openTabs - Array of open tabs
   * @param activeTabId - Currently active tab ID
   */
  updateTabState: (
    openTabs: Array<import('@neko-agent/types').OpenTab>,
    activeTabId: string | null,
  ) => {
    postWebviewMessage({ type: 'updateTabState', openTabs, activeTabId });
  },

  exitCharacterDialogueSession: (sessionId: string) => {
    postWebviewMessage({ type: 'exitCharacterDialogueSession', sessionId });
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
    postWebviewMessage({ type: 'openFile', filePath, options });
  },

  /** Open a document preview and jump to a semantic locator when supported. */
  revealDocumentLocator: (input: {
    filePath: string;
    locator: DocumentLocator;
    source?: DocumentSourceRef;
  }) => {
    postWebviewMessage({
      type: 'revealDocumentLocator',
      filePath: input.filePath,
      locator: input.locator,
      ...(input.source ? { source: input.source } : {}),
    });
  },

  /** Reveal an asset entity in the asset library view. */
  revealAsset: (assetId: string) => {
    postWebviewMessage({ type: 'revealAsset', assetId });
  },

  // ==========================================================================
  // Prompt Mode
  // ==========================================================================

  /**
   * Set prompt mode (default or plan)
   * @param mode - The mode to set
   */
  setPromptMode: (mode: 'default' | 'plan', conversationId: string) => {
    postWebviewMessage({ type: 'setPromptMode', mode, conversationId });
  },

  getPromptMode: (conversationId: string) => {
    postWebviewMessage({ type: 'getPromptMode', conversationId });
  },

  /**
   * Invoke a skill via slash command
   * @param command - Slash command (without /)
   * @param args - Optional arguments
   */
  invokeSlashCommand: (command: string, args: string | undefined, conversationId: string) => {
    postWebviewMessage({ type: 'invokeSlashCommand', command, args, conversationId });
  },

  /**
   * Invoke a plugin slash command registered by an external extension.
   * Extension host routes it to the registering extension via VSCode command API.
   * @param extensionId - The extension that registered the command
   * @param commandId   - The command id (without /)
   * @param args        - Optional arguments string
   */
  invokePluginSlashCommand: (
    extensionId: string,
    commandId: string,
    conversationId: string,
    args?: string,
  ) => {
    postWebviewMessage({
      type: 'invokePluginSlashCommand',
      extensionId,
      commandId,
      conversationId,
      args,
    });
  },

  // -------------------------------------------------------------------------
  // Outbound actions previously sent via direct vscode.postMessage
  // -------------------------------------------------------------------------

  /** Open an external URL in the default browser */
  openUrl: (url: string) => {
    postWebviewMessage({ type: 'openUrl', url });
  },

  /** Send generated content to another extension (canvas, cut, explorer). */
  sendToPlugin: (
    target: string,
    assetPathOrPayload: string | PluginTransferPayload,
    mediaType?: string,
  ) => {
    if (typeof assetPathOrPayload === 'string') {
      postWebviewMessage({
        type: 'sendToPlugin',
        target,
        assetPath: assetPathOrPayload,
        ...(mediaType !== undefined ? { mediaType } : {}),
      });
      return;
    }
    postWebviewMessage({ type: 'sendToPlugin', target, payload: assetPathOrPayload });
  },

  /** Retry a failed background task */
  retryTask: (taskId: string, conversationId: string) => {
    postWebviewMessage({ type: 'retryTask', taskId, conversationId });
  },

  /** Download a Mermaid diagram as SVG file */
  downloadSvg: (svg: string, filename: string) => {
    postWebviewMessage({ type: 'downloadSvg', svg, filename });
  },

  /** Report a Mermaid rendering error — sends feedback as user message to AI */
  mermaidError: (error: string, code: string, feedbackMessage: string, conversationId: string) => {
    postWebviewMessage({ type: 'mermaidError', error, code, feedbackMessage, conversationId });
  },

  /** Reveal a file in the OS file manager */
  revealFile: (filePath: string) => {
    postWebviewMessage({ type: 'revealFile', filePath });
  },

  /** Navigate to the source of a context reference (canvas node, file, etc.) */
  revealContextSource: (
    contextType: AgentContextType,
    contextId: string,
    navigationData?: Record<string, string>,
  ) => {
    postWebviewMessage({
      type: 'revealContextSource',
      contextType,
      contextId,
      ...(navigationData ? { navigationData } : {}),
    });
  },

  /** Notify Extension Host that a drag operation started (DnD) */
  dndStart: (asset: { path: string; mediaType: 'image' | 'video' | 'audio'; name: string }) => {
    postWebviewMessage({ type: 'dnd:start', asset });
  },

  /** Start SSO login through extension bridge */
  ssoLogin: (force?: boolean) => {
    postWebviewMessage({ type: 'ssoLogin', ...(force !== undefined ? { force } : {}) });
  },

  /** Logout current SSO session */
  ssoLogout: () => {
    postWebviewMessage({ type: 'ssoLogout' });
  },
};
