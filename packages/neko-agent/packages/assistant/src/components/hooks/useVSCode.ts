/**
 * VSCode API Bridge
 *
 * Provides type-safe communication between the Assistant UI webview
 * and the VS Code extension host via postMessage.
 *
 * Core VSCode API is imported from @uniedit/shared.
 * This file defines assistant-specific message builders.
 */

import {
  getVSCodeAPI,
  postMessage,
  type VSCodeAPI,
} from '@uniedit/shared';

// Re-export for backward compatibility
export { getVSCodeAPI, postMessage, type VSCodeAPI };

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
  sendMessage: (message: string, providerId?: string, modelId?: string, attachments?: Array<{
    id: string;
    name: string;
    type: 'file' | 'image' | 'video' | 'audio';
    path?: string;
    size?: number;
    preview?: string;
  }>, promptId?: string, conversationId?: string, messageTrackingId?: string) => {
    postMessage({ type: 'sendMessage', message, providerId, modelId, attachments, promptId, conversationId, messageTrackingId });
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

  /**
   * Add a new model configuration
   * @param model - Model configuration object
   */
  addModel: (model: {
    type: string;
    name?: string;
    apiKey?: string;
    baseUrl?: string;
    models: Array<{ id: string; enabled: boolean }>;
  }) => {
    postMessage({ type: 'addModel', model });
  },

  /**
   * Remove a model configuration
   * @param modelType - The model type to remove
   */
  removeModel: (modelType: string) => {
    postMessage({ type: 'removeModel', modelType });
  },

  /**
   * Toggle a provider's enabled state
   * @param providerType - The provider type
   * @param enabled - Whether to enable or disable
   */
  toggleProvider: (providerType: string, enabled: boolean) => {
    postMessage({ type: 'toggleProvider', providerType, enabled });
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
   */
  confirmTool: (toolCallId: string, approved: boolean) => {
    postMessage({ type: 'confirmTool', toolCallId, approved });
  },

  /**
   * Test an MCP server connection
   * @param server - MCP server configuration
   */
  testMCPServer: (server: { id: string; name: string; command: string; args?: string[]; env?: Record<string, string>; requestId?: string }) => {
    postMessage({ type: 'testMCPServer', server });
  },

  /**
   * Test a workflow connection
   * @param workflow - Workflow configuration
   */
  testWorkflow: (workflow: { id: string; name: string; engineType: string; url: string; apiKey?: string; requestId?: string }) => {
    postMessage({ type: 'testWorkflow', workflow });
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

  /** Request model presets from configuration */
  getModelPresets: () => {
    postMessage({ type: 'getModelPresets' });
  },

  /**
   * Configure a model preset with API credentials
   * @param modelId - The model ID
   * @param apiKey - API key for the model
   * @param baseUrl - Optional custom base URL
   */
  configureModelPreset: (modelId: string, apiKey: string, baseUrl?: string) => {
    postMessage({ type: 'configureModelPreset', modelId, apiKey, baseUrl });
  },

  /**
   * Toggle a model preset's enabled state
   * @param modelId - The model ID
   * @param enabled - Whether to enable or disable
   */
  toggleModelPreset: (modelId: string, enabled: boolean) => {
    postMessage({ type: 'toggleModelPreset', modelId, enabled });
  },

  /**
   * Remove configuration for a model preset
   * @param modelId - The model ID
   */
  removeModelPresetConfig: (modelId: string) => {
    postMessage({ type: 'removeModelPresetConfig', modelId });
  },

  /**
   * Export model configuration
   * @param includeSecrets - Whether to include API keys
   */
  exportModelConfig: (includeSecrets: boolean) => {
    postMessage({ type: 'exportModelConfig', includeSecrets });
  },

  /**
   * Import model configuration from JSON
   * @param jsonString - JSON configuration string
   * @param options - Import options
   */
  importModelConfig: (jsonString: string, options: { overwrite?: boolean; includeSecrets?: boolean }) => {
    postMessage({ type: 'importModelConfig', jsonString, options });
  },

  /**
   * Add a custom model configuration
   * @param configJson - Model configuration as JSON string
   * @param apiKey - Optional API key
   */
  addCustomModel: (configJson: string, apiKey?: string) => {
    postMessage({ type: 'addCustomModel', configJson, apiKey });
  },

  /** Request full configuration from extension */
  getConfig: () => {
    postMessage({ type: 'getConfig' });
  },

  /**
   * Update an MCP server configuration
   * @param server - MCP server configuration
   */
  updateMCPServer: (server: import('@uniedit/shared').MCPServerConfig) => {
    postMessage({ type: 'updateMCPServer', server });
  },

  /**
   * Delete an MCP server
   * @param serverId - The server ID to delete
   */
  deleteMCPServer: (serverId: string) => {
    postMessage({ type: 'deleteMCPServer', serverId });
  },

  /**
   * Update a workflow configuration
   * @param workflow - Workflow configuration
   */
  updateWorkflow: (workflow: import('@uniedit/shared').WorkflowConfig) => {
    postMessage({ type: 'updateWorkflow', workflow });
  },

  /**
   * Delete a workflow
   * @param workflowId - The workflow ID to delete
   */
  deleteWorkflow: (workflowId: string) => {
    postMessage({ type: 'deleteWorkflow', workflowId });
  },

  /**
   * Update a prompt preset
   * @param prompt - Prompt preset configuration
   */
  updatePrompt: (prompt: import('@uniedit/shared').PromptPresetConfig) => {
    postMessage({ type: 'updatePrompt', prompt });
  },

  /**
   * Delete a prompt preset
   * @param promptId - The prompt ID to delete
   */
  deletePrompt: (promptId: string) => {
    postMessage({ type: 'deletePrompt', promptId });
  },

  /**
   * Update a provider configuration
   * @param provider - Provider configuration
   */
  updateProvider: (provider: import('@uniedit/shared').ProviderConfig) => {
    postMessage({ type: 'updateProvider', provider });
  },

  /**
   * Delete a provider
   * @param providerId - The provider ID to delete
   */
  deleteProvider: (providerId: string) => {
    postMessage({ type: 'deleteProvider', providerId });
  },

  /**
   * Update a model configuration
   * @param model - Model configuration
   */
  updateModel: (model: import('@uniedit/shared').ModelConfig) => {
    postMessage({ type: 'updateModel', model });
  },

  /**
   * Delete a model
   * @param modelId - The model ID to delete
   */
  deleteModel: (modelId: string) => {
    postMessage({ type: 'deleteModel', modelId });
  },

  // Template operations

  /**
   * Request the list of available templates
   * @param category - Optional category filter
   */
  getTemplates: (category?: string) => {
    postMessage({ type: 'getTemplates', category });
  },

  /**
   * Execute a template
   * @param templateId - The template ID to execute
   * @param params - Template parameters
   */
  executeTemplate: (templateId: string, params: Record<string, unknown>) => {
    postMessage({ type: 'executeTemplate', templateId, params });
  },

  /**
   * Cancel a running template execution
   * @param templateId - The template ID to cancel
   */
  cancelTemplateExecution: (templateId: string) => {
    postMessage({ type: 'cancelTemplateExecution', templateId });
  },

  /**
   * Get template detail
   * @param templateId - The template ID
   */
  getTemplateDetail: (templateId: string) => {
    postMessage({ type: 'getTemplateDetail', templateId });
  },

  /**
   * Export a template as JSON
   * @param templateId - The template ID to export
   */
  exportTemplate: (templateId: string) => {
    postMessage({ type: 'exportTemplate', templateId });
  },

  /**
   * List available models from a provider's API
   * @param providerId - The provider ID to query
   * @param requestId - Unique request ID for correlation
   */
  listProviderModels: (providerId: string, requestId: string) => {
    postMessage({ type: 'listProviderModels', providerId, requestId });
  },

  /**
   * Validate a provider's API key
   * @param providerId - The provider ID to validate
   * @param modelId - Optional model ID - when specified, uses this model for validation test
   * @param requestId - Unique request ID for correlation
   */
  validateApiKey: (providerId: string, modelId: string | undefined, requestId: string) => {
    postMessage({ type: 'validateApiKey', providerId, modelId, requestId });
  },

  /**
   * Cancel the current AI message generation
   * Stops the agent execution and streaming response
   */
  cancelMessage: () => {
    postMessage({ type: 'cancelMessage' });
  },

  /**
   * Stop agent execution for a specific conversation
   * @param conversationId - The conversation ID to stop
   */
  stopAgent: (conversationId: string) => {
    postMessage({ type: 'stopAgent', conversationId });
  },

  // ==========================================================================
  // Skill Operations
  // ==========================================================================

  /**
   * Request the list of available skills
   */
  getSkills: () => {
    postMessage({ type: 'getSkills' });
  },

  /**
   * Execute a skill by ID
   * @param skillId - The skill ID to execute
   * @param input - Input parameters for the skill
   */
  executeSkill: (skillId: string, input: Record<string, unknown> = {}) => {
    postMessage({ type: 'executeSkill', skillId, input });
  },

  /**
   * Cancel a running skill execution
   * @param skillId - The skill ID to cancel
   */
  cancelSkill: (skillId: string) => {
    postMessage({ type: 'cancelSkill', skillId });
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

  /**
   * Invoke a skill via slash command
   * @param command - Slash command (without /)
   * @param args - Optional arguments
   */
  invokeSlashCommand: (command: string, args?: string) => {
    postMessage({ type: 'invokeSlashCommand', command, args });
  },

  /**
   * Update a skill configuration
   * @param skill - Skill configuration to update
   */
  updateSkill: (skill: import('@uniedit/shared').ConfiguredSkill) => {
    postMessage({ type: 'updateSkill', skill });
  },

  /**
   * Delete a skill
   * @param skillName - The skill name to delete
   */
  deleteSkill: (skillName: string) => {
    postMessage({ type: 'deleteSkill', skillName });
  },

  /**
   * Duplicate a skill (copies entire directory including references, scripts, etc.)
   * @param skill - The skill to duplicate
   * @param newName - The name for the duplicated skill
   * @param targetSource - Target source ('personal' or 'project')
   */
  duplicateSkill: (
    skill: import('@uniedit/shared').ConfiguredSkill,
    newName: string,
    targetSource: 'personal' | 'project'
  ) => {
    postMessage({ type: 'duplicateSkill', skill, newName, targetSource });
  },

  /**
   * Create a new skill
   * @param skillName - The name for the new skill
   * @param source - Target source ('personal' or 'project')
   */
  createSkill: (skillName: string, source: 'personal' | 'project') => {
    postMessage({ type: 'createSkill', skillName, source });
  },

  /**
   * Update a command configuration
   * @param command - Command configuration to update
   */
  updateCommand: (command: import('@uniedit/shared').ConfiguredSlashCommand) => {
    postMessage({ type: 'updateCommand', command });
  },

  /**
   * Delete a command
   * @param commandName - The command name to delete
   */
  deleteCommand: (commandName: string) => {
    postMessage({ type: 'deleteCommand', commandName });
  },

  /**
   * Request hooks from extension
   */
  getHooks: () => {
    postMessage({ type: 'getHooks' });
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
  modifyPlanStep: (planId: string, stepId: string, newDescription: string, conversationId?: string) => {
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
  updateTabState: (openTabs: Array<{ id: string; title: string; conversationId: string }>, activeTabId: string | null) => {
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

  /**
   * Open workspace config file for prompts
   * Creates the file if it doesn't exist
   */
  openPromptConfig: (source: 'personal' | 'project', promptId?: string) => {
    postMessage({ type: 'openPromptConfig', source, promptId });
  },

  /**
   * Open AGENTS.md file in VSCode editor
   * @param source - File source (personal or project)
   * Creates the file if it doesn't exist
   */
  openAgentsFile: (source: 'personal' | 'project') => {
    postMessage({ type: 'openAgentsFile', source });
  },

  /**
   * Open settings.json file in VSCode editor (for Hooks configuration)
   * @param source - File source (personal, project, or local)
   * Creates the file if it doesn't exist
   */
  openSettingsFile: (source: 'personal' | 'project' | 'local') => {
    postMessage({ type: 'openSettingsFile', source });
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
   * Toggle between default and plan mode
   */
  togglePlanMode: () => {
    postMessage({ type: 'togglePlanMode' });
  },

  /**
   * Get current prompt mode
   */
  getPromptMode: () => {
    postMessage({ type: 'getPromptMode' });
  },

  /**
   * Open a skill-related file in VSCode editor
   * @param skillName - The skill name
   * @param source - Skill source (personal or project)
   * @param fileType - Type of file to open: 'skill' for SKILL.md, 'reference' for reference doc, 'script' for script
   * @param filePath - Optional relative path for reference/script files
   */
  openSkillFile: (
    skillName: string,
    source: 'personal' | 'project',
    fileType: 'skill' | 'reference' | 'script',
    filePath?: string
  ) => {
    postMessage({ type: 'openSkillFile', skillName, source, fileType, filePath });
  },

  /**
   * Open a command file in VSCode editor
   * @param commandName - The command name (without leading /)
   * @param source - Command source (personal or project)
   */
  openCommandFile: (
    commandName: string,
    source: 'personal' | 'project'
  ) => {
    postMessage({ type: 'openCommandFile', commandName, source });
  },
};
