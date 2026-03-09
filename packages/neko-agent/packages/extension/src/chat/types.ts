/**
 * AI Assistant Types
 *
 * UI 层类型定义（WebView 通信、设置、附件等）
 */

// Re-export MessageAttachment from shared (Single Source of Truth)
export type { MessageAttachment, AttachmentType } from '@neko/shared';

// =============================================================================
// UI 层类型（WebView 通信）
// =============================================================================

/**
 * Message types for communication between extension and webview
 */
export interface WebviewMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Settings state interface
 */
export interface AIAssistantSettings {
  selectedProviderId: string | null;
  selectedModelId: string | null;
  customSystemPrompt: string;
  autoExecuteTools: boolean;
  streamResponses: boolean;
  showToolCalls: boolean;
  temperature: number;
  maxTokens: number;
  executionMode: 'plan' | 'ask' | 'auto';
}

/**
 * File reference parsed from @ mentions
 */
export interface FileReference {
  path: string;
  content: string;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: AIAssistantSettings = {
  selectedProviderId: null,
  selectedModelId: null,
  customSystemPrompt: '',
  autoExecuteTools: true,
  streamResponses: true,
  showToolCalls: true,
  temperature: 0.7,
  maxTokens: 8192, // Increased for better tool result handling
  executionMode: 'ask',
};

// =============================================================================
// Provider Types (for UI)
// =============================================================================

/**
 * Provider info for UI display
 */
export interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  models: Array<{
    id: string;
    name: string;
    enabled: boolean;
  }>;
  enabled: boolean;
}

/**
 * Configured provider info
 */
export interface ConfiguredProvider {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  models: Array<{
    id: string;
    name: string;
    enabled: boolean;
  }>;
}

/**
 * Provider storage config
 */
export interface ProviderConfig {
  type: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  models?: Array<{ id: string; enabled: boolean }>;
}

/**
 * Provider template info for dropdown selection
 */
export interface ProviderTemplateInfo {
  id: string;
  name: string;
  displayName: string;
  type: string;
  apiUrl: string;
}

// =============================================================================
// Tab State Types (for session persistence)
// =============================================================================

/**
 * Open tab state for persistence
 */
export interface OpenTab {
  id: string;
  title: string;
  conversationId: string;
}

/**
 * Tab state for persistence across panel close/reopen
 */
export interface TabState {
  openTabs: OpenTab[];
  activeTabId: string | null;
}
