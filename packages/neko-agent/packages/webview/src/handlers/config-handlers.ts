/**
 * Config Message Handlers
 *
 * Handles: settingsData, projectFiles, configState, configChanged,
 *          modelPresetsData, modelPresetConfigured, modelPresetToggled, modelPresetConfigRemoved
 */

import type { MessageHandler, HandlerRegistration } from './types';
import { VSCodeMessages } from '@/components/hooks/useVSCode';

/**
 * Handle 'settingsData' message - Settings from extension
 */
const handleSettingsData: MessageHandler = (message, context) => {
  // NOTE: Do NOT set configuredProviders here.
  // The complete providers list comes from 'configState' message via handleConfigState.
  // settingsData.configuredProviders only contains providers with apiKey configured,
  // which would overwrite the complete list if this message arrives after configState.
  context.setSettings(prev => ({
    ...prev,
    providers: message.providers || [],
    // configuredProviders: intentionally NOT set here - see handleConfigState
    providerTemplates: message.providerTemplates || [],
    selectedProviderId: message.selectedProviderId || null,
    selectedModelId: message.selectedModelId || null,
    systemPrompt: message.systemPrompt || '',
    autoExecuteTools: message.autoExecuteTools ?? true,
    streamResponses: message.streamResponses ?? true,
    showToolCalls: message.showToolCalls ?? true,
    temperature: message.temperature ?? 0.7,
    maxTokens: message.maxTokens ?? 4096,
    executionMode: message.executionMode ?? 'ask',
    // Chat model options from Platform ConfigManager
    chatModelOptions: message.chatModelOptions || [],
  }));
  if (message.selectedProviderId && message.selectedModelId) {
    // Use the correct format: 'providerId:modelId' to match chatModelOptions
    context.setSelectedModel(`${message.selectedProviderId}:${message.selectedModelId}`);
  }
};

/**
 * Handle 'projectFiles' message - Project file list
 */
const handleProjectFiles: MessageHandler = (message, context) => {
  context.setProjectFiles(message.files || []);
};

/**
 * Handle 'configState' message - Configuration from Platform
 */
const handleConfigState: MessageHandler = (message, context) => {
  if (message.config) {
    // Map providers from ConfigState to ConfiguredProvider format
    const mappedProviders = (message.config.providers || []).map((p: import('@neko/shared').ProviderConfig) => ({
      id: p.id,
      type: p.type,
      name: p.displayName || p.name, // Use displayName for UI, fallback to name
      apiKey: p.apiKey,
      baseUrl: p.apiUrl, // Map apiUrl to baseUrl for local type compatibility
      enabled: p.enabled,
      builtin: p.builtin,
    }));

    // Get enabled prompts and validate selectedPromptId
    const newPrompts = message.config.prompts || [];
    const enabledPrompts = newPrompts.filter((p: { enabled?: boolean }) => p.enabled !== false);

    context.setSettings(prev => {
      // If current selectedPromptId is not in enabled prompts, update to first enabled one
      const currentPromptValid = enabledPrompts.some((p: { id: string }) => p.id === prev.selectedPromptId);
      const newSelectedPromptId = currentPromptValid ? prev.selectedPromptId : (enabledPrompts[0]?.id || prev.selectedPromptId);

      return {
        ...prev,
        // Providers
        configuredProviders: mappedProviders,
        // Models (independent from providers)
        configuredModels: message.config.models || [],
        // MCP servers
        configuredMCPServers: message.config.mcpServers || [],
        // Prompts (agents)
        configuredPrompts: newPrompts,
        configuredAgents: newPrompts,
        // Skills and Commands
        configuredSkills: message.config.skills || [],
        configuredCommands: message.config.commands || [],
        // Update selectedPromptId if current one is disabled
        selectedPromptId: newSelectedPromptId,
      };
    });
  }
};

/**
 * Handle 'configChanged' message - Configuration changed
 */
const handleConfigChanged: MessageHandler = (_message, _context) => {
  // Refresh both config AND settings when configuration changes
  // getConfig() updates configuredProviders, models, etc.
  // getSettings() updates chatModelOptions (model selector dropdown)
  VSCodeMessages.getConfig();
  VSCodeMessages.getSettings();
};

/**
 * Handle 'modelPresetsData' message - Model presets list
 */
const handleModelPresetsData: MessageHandler = (message, context) => {
  context.setModelPresets(message.models || []);
};

/**
 * Handle 'modelPresetConfigured' message - Model preset configured
 */
const handleModelPresetConfigured: MessageHandler = (message, _context) => {
  // Refresh presets after configuration
  if (message.success) {
    VSCodeMessages.getModelPresets();
  }
};

/**
 * Handle 'modelPresetToggled' message - Model preset toggled
 */
const handleModelPresetToggled: MessageHandler = (message, _context) => {
  // Refresh presets after toggle
  if (message.success) {
    VSCodeMessages.getModelPresets();
  }
};

/**
 * Handle 'modelPresetConfigRemoved' message - Model preset config removed
 */
const handleModelPresetConfigRemoved: MessageHandler = (message, _context) => {
  // Refresh presets after removal
  if (message.success) {
    VSCodeMessages.getModelPresets();
  }
};

/**
 * Handle 'mcpServerTestResult' message - MCP server test result
 * Note: Actual handling is done via addEventListener in index.tsx
 * This handler just marks the message as handled for the registry
 */
const handleMCPServerTestResult: MessageHandler = (_message, _context) => {
  // Handled by dedicated listener in index.tsx
};

/**
 * Handle 'skillsData' message - Skills and commands from extension
 */
const handleSkillsData: MessageHandler = (message, context) => {
  context.setSettings(prev => ({
    ...prev,
    configuredSkills: message.skills || [],
    configuredCommands: message.commands || [],
  }));
};

/**
 * Handle 'skillsChanged' message - Skills/commands changed event
 */
const handleSkillsChanged: MessageHandler = (message, context) => {
  context.setSettings(prev => ({
    ...prev,
    configuredSkills: message.skills || [],
    configuredCommands: message.commands || [],
  }));
};

/**
 * Handle 'hooksData' message - Hooks from extension
 */
const handleHooksData: MessageHandler = (message, context) => {
  context.setSettings(prev => ({
    ...prev,
    configuredHooks: message.hooks || [],
  }));
};

/**
 * Handle 'hooksChanged' message - Hooks changed event
 */
const handleHooksChanged: MessageHandler = (message, context) => {
  context.setSettings(prev => ({
    ...prev,
    configuredHooks: message.hooks || [],
  }));
};

/**
 * All config handler registrations
 */
export const configHandlers: HandlerRegistration[] = [
  { type: 'settingsData', handler: handleSettingsData },
  { type: 'projectFiles', handler: handleProjectFiles },
  { type: 'configState', handler: handleConfigState },
  { type: 'configChanged', handler: handleConfigChanged },
  { type: 'modelPresetsData', handler: handleModelPresetsData },
  { type: 'modelPresetConfigured', handler: handleModelPresetConfigured },
  { type: 'modelPresetToggled', handler: handleModelPresetToggled },
  { type: 'modelPresetConfigRemoved', handler: handleModelPresetConfigRemoved },
  { type: 'mcpServerTestResult', handler: handleMCPServerTestResult },
  { type: 'skillsData', handler: handleSkillsData },
  { type: 'skillsChanged', handler: handleSkillsChanged },
  { type: 'hooksData', handler: handleHooksData },
  { type: 'hooksChanged', handler: handleHooksChanged },
];
