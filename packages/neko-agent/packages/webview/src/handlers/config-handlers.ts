/**
 * Config Message Handlers
 *
 * Handles: settingsData, projectFiles, configState, configChanged, mcpServerTestResult
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
  context.setSettings((prev) => ({
    ...prev,
    providers: message.providers || [],
    // configuredProviders: intentionally NOT set here - see handleConfigState
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
  // Apply defaultMediaModels from config for categories still set to 'none'
  const defaults = message.defaultMediaModels as Record<string, string> | undefined;
  if (defaults) {
    context.setMediaModelSelection((prev) => {
      const next = { ...prev };
      for (const cat of ['image', 'video', 'audio'] as const) {
        if (next[cat] === 'none' && defaults[cat]) next[cat] = defaults[cat]!;
      }
      return next;
    });
  }
};

/**
 * Handle 'projectFiles' message - Project file list + optional canvas/story mention extras
 */
const handleProjectFiles: MessageHandler = (message, context) => {
  const files: Array<{ path: string; name: string; type: 'file' | 'folder'; icon?: string }> =
    message.files || [];
  context.setProjectFiles(files);

  // Build unified MentionItem list: files first, then canvas nodes / characters
  const fileMentions = files.map((f) => ({
    id: `file:${f.path}`,
    kind: 'file' as const,
    label: f.name,
    description: f.path,
    filePath: f.path,
  }));

  const extras: Array<{
    type: 'canvas-node' | 'character' | 'scene';
    id: string;
    label: string;
    summary: string;
  }> = message.mentionExtras || [];

  const extraMentions = extras.map((e) => ({
    id: `${e.type}:${e.id}`,
    kind: e.type as import('@/components/ChatView/InputArea/types').MentionItemKind,
    label: e.label,
    description: e.type === 'canvas-node' ? 'Canvas node' : e.type,
    contextPayload: {
      type: e.type,
      id: e.id,
      label: e.label,
      summary: e.summary,
    } as import('@neko/shared').AgentContextPayload,
  }));

  context.setMentionItems([...fileMentions, ...extraMentions]);
};

/**
 * Handle 'configState' message - Configuration from Platform
 * Only extracts providers (used by AccountBar for isAiConfigured check)
 */
const handleConfigState: MessageHandler = (message, context) => {
  if (message.config) {
    const mappedProviders = (message.config.providers || []).map(
      (p: import('@neko/shared').ProviderConfig) => ({
        id: p.id,
        type: p.type,
        name: p.displayName || p.name,
        apiKey: p.apiKey,
        baseUrl: p.apiUrl,
        enabled: p.enabled,
        builtin: p.builtin,
      }),
    );

    context.setSettings((prev) => ({
      ...prev,
      configuredProviders: mappedProviders,
    }));
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
 * Handle 'mcpServerTestResult' message - MCP server test result
 * Note: Actual handling is done via addEventListener in index.tsx
 * This handler just marks the message as handled for the registry
 */
const handleMCPServerTestResult: MessageHandler = (_message, _context) => {
  // Handled by dedicated listener in index.tsx
};

/**
 * Handle 'pluginCommands' message - Plugin slash commands from external extensions
 */
const handlePluginCommands: MessageHandler = (message, context) => {
  const commands: Array<{
    id: string;
    name: string;
    description: string;
    icon?: string;
    extensionId: string;
  }> = message.commands || [];
  context.setPluginCommands(commands);
};

/**
 * Skills/hooks data handlers removed — webview does not consume this data.
 * Skills and hooks are managed internally by Extension (ConfigBridge accessors).
 */

/**
 * All config handler registrations
 */
export const configHandlers: HandlerRegistration[] = [
  { type: 'settingsData', handler: handleSettingsData },
  { type: 'projectFiles', handler: handleProjectFiles },
  { type: 'configState', handler: handleConfigState },
  { type: 'configChanged', handler: handleConfigChanged },
  { type: 'mcpServerTestResult', handler: handleMCPServerTestResult },
  { type: 'pluginCommands', handler: handlePluginCommands },
];
