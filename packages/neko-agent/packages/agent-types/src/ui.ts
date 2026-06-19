/**
 * UI Types — Shared UI state types for webview and extension
 */

import type { ChatModelOption, ModelSourceGroup } from '@neko/shared';
import type { ConfiguredProvider } from './provider';
import type { ShellExecutionMode } from './settings';
import type { NpcProfileSource } from '@neko/shared';
import type { AgentConfigDiagnostic } from './config-diagnostic';

// ---------------------------------------------------------------------------
// Tabs & Conversations
// ---------------------------------------------------------------------------

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: number;
}

export interface OpenTab {
  id: string;
  title: string;
  conversationId: string;
  kind?: ConversationKind;
  characterDialogueSession?: CharacterDialogueSessionProjection;
  embodyCharacterSession?: EmbodyCharacterSessionProjection;
}

export interface TabState {
  openTabs: OpenTab[];
  activeTabId: string | null;
}

export type TabType = 'chat';
export type ConversationKind = 'chat' | 'character-dialogue' | 'embody-character';

export interface CharacterDialogueSessionProjection {
  readonly sessionId: string;
  readonly entityId: string;
  readonly displayName: string;
  readonly mode: 'roleplay' | 'consult';
  readonly profile: NpcProfileSource;
  readonly summary: string;
  readonly startedAt: string;
  readonly projectRoot?: string;
  readonly status: 'active' | 'exited';
}

export interface EmbodyCharacterSessionProjection {
  readonly sessionId: string;
  readonly entityId: string;
  readonly displayName: string;
  readonly profile: NpcProfileSource;
  readonly source?: string;
  readonly projectRoot?: string;
  readonly scopeSummary: readonly string[];
  readonly prompt?: string;
  readonly summary: string;
  readonly startedAt: string;
  readonly status: 'active' | 'exited';
}

// ---------------------------------------------------------------------------
// Session & Prompt Mode
// ---------------------------------------------------------------------------

/** Prompt mode for system prompt selection */
export type PromptMode = 'default' | 'plan';

/**
 * Session mode — controls the primary workflow / capability routing.
 * - agent:  LLM reasoning + tool calls (default)
 * - image:  image generation (routes to image media model)
 * - video:  video generation (routes to video media model)
 * - audio:  audio generation (routes to audio media model)
 */
export type SessionMode = 'agent' | 'image' | 'video' | 'audio';

// ---------------------------------------------------------------------------
// SSO
// ---------------------------------------------------------------------------

export interface SsoSession {
  /** Display name or email */
  user: string;
  /** Plan tier, e.g. 'Pro' */
  plan?: string;
  /** Token usage this period */
  usage?: number;
}

// ---------------------------------------------------------------------------
// Settings State (webview full state)
// ---------------------------------------------------------------------------

export interface SettingsState {
  providers: Array<{
    id: string;
    name: string;
    isConfigured: boolean;
    models: Array<{
      id: string;
      name: string;
      description: string;
    }>;
  }>;
  /** Provider list (from Platform ConfigManager, used by AccountBar) */
  configuredProviders: Array<ConfiguredProvider>;
  selectedProviderId: string | null;
  selectedModelId: string | null;
  systemPrompt: string;
  autoExecuteTools: boolean;
  streamResponses: boolean;
  showToolCalls: boolean;
  temperature: number;
  maxTokens: number;
  /** Shell execution mode: plan (dry-run), ask (confirm), auto (whitelist only) */
  executionMode: ShellExecutionMode;
  /** Prompt mode: default or plan (research/planning mode) */
  promptMode: PromptMode;
  /** Chat model options for UI model selector (from Platform ConfigManager) */
  chatModelOptions: Array<ChatModelOption>;
  /** Source/provider grouped model options for account gateway and explicit config providers. */
  modelGroups: Array<ModelSourceGroup>;
  /** SSO session info (null when using custom key or not logged in) */
  ssoSession: SsoSession | null;
  /** Safe config file diagnostic for the active snapshot, if loading failed. */
  configDiagnostic?: AgentConfigDiagnostic;
}
