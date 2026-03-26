/**
 * AI Assistant Types
 *
 * UI layer type definitions (WebView communication, settings, attachments, etc.)
 * Shared types are re-exported from @neko-agent/types.
 */

// Re-export from shared
export type { MessageAttachment, AttachmentType } from '@neko/shared';

// Re-export from @neko-agent/types (Single Source of Truth)
export type { AIAssistantSettings, ConfiguredProvider } from '@neko-agent/types';
export { DEFAULT_SETTINGS } from '@neko-agent/types';

// =============================================================================
// Extension-only types (NOT shared with webview)
// =============================================================================

/**
 * Message types for communication between extension and webview
 */
export interface WebviewMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * File reference parsed from @ mentions
 */
export interface FileReference {
  path: string;
  content: string;
}

// =============================================================================
// Provider Types (extension-only, for UI display)
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
 * Provider storage config
 */
export interface ProviderConfig {
  type: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  models?: Array<{ id: string; enabled: boolean }>;
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
