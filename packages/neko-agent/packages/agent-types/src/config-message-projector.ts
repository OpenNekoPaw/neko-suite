import type { AgentContextPayload, ChatModelOption } from '@neko/shared';
import type { SettingsState } from './ui';
import type {
  AgentMediaModelCategory,
  AgentMediaModelSelections,
  MediaModelCategory,
  ModelRef,
  MarketInstallWebviewMessage,
  MarketErrorMessage,
  MarketFeaturedMessage,
  MarketInstalledListMessage,
  MarketInstallProgressMessage,
  MarketInstallResultMessage,
  MarketSearchWebviewMessage,
  MarketSearchResultMessage,
  MarketUninstallWebviewMessage,
  MarketUninstallResultMessage,
  MarketUpdatesMessage,
  ProjectFileMentionInfo,
  SsoSessionChangedMessage,
} from './webview-protocol';

export type MediaModelDefaults = Partial<Record<'image' | 'video' | 'audio', string>>;
export type MediaModelSelectionState = Record<'image' | 'video' | 'audio', string>;
export type AgentSessionMode = 'agent' | AgentMediaModelCategory;

export interface SettingsDataProjection {
  settingsPatch: Partial<SettingsState>;
  selectedModel: string | null;
  defaultMediaModels: MediaModelDefaults;
}

export interface MediaModelSelectionDefaultsProjection {
  selection: MediaModelSelectionState;
  updated: boolean;
}

export interface MessageModelProjectionInput {
  selectedModel: string;
  sessionMode: AgentSessionMode;
  mediaProviderId?: string;
  mediaModelId?: string;
  agentMediaModels?: AgentMediaModelSelections;
}

export interface MessageModelProjection {
  chatModel?: ModelRef<'llm'>;
  mediaModel?: ModelRef<MediaModelCategory>;
  mediaModels?: AgentMediaModelSelections;
}

export interface ChatWorkspaceModelStateInput {
  chatModelOptions: readonly ChatModelOption[];
  sessionMode: AgentSessionMode;
  mediaModelSelection: Readonly<MediaModelSelectionState>;
}

export interface ChatWorkspaceModelStateProjection {
  allModels: ChatModelOption[];
  availableModels: ChatModelOption[];
  availableMediaModels: ChatModelOption[];
  activeMediaModel?: ChatModelOption;
  agentMediaModels?: AgentMediaModelSelections;
}

export interface SessionModeMediaSelectionProjection {
  sessionMode: AgentSessionMode;
  mediaModelSelection: MediaModelSelectionState;
  updated: boolean;
}

export interface SsoSessionProjection {
  settingsPatch: Pick<Partial<SettingsState>, 'ssoSession'>;
  showOnboarding?: boolean;
}

export interface SsoErrorProjection {
  globalError: string;
  showOnboarding: boolean;
}

export type SsoSessionMessagePayload = SsoSessionChangedMessage['session'];

export type ProjectMentionItemKind = 'file' | 'canvas-node' | 'character' | 'scene';

export interface ProjectMentionItem {
  id: string;
  kind: ProjectMentionItemKind;
  label: string;
  description?: string;
  filePath?: string;
  contextPayload?: AgentContextPayload;
}

export interface ProjectFilesProjection {
  projectFiles: ProjectFileMentionInfo[];
  mentionItems: ProjectMentionItem[];
}

export interface PluginSlashCommandProjection {
  id: string;
  name: string;
  description: string;
  icon?: string;
  extensionId: string;
}

export type MarketplaceProjectionMessage =
  | MarketSearchResultMessage
  | MarketInstallProgressMessage
  | MarketInstallResultMessage
  | MarketUninstallResultMessage
  | MarketInstalledListMessage
  | MarketUpdatesMessage
  | MarketFeaturedMessage
  | MarketErrorMessage;

export type MarketplaceRequestProjection =
  | { readonly kind: 'search'; readonly query: MarketSearchWebviewMessage['query'] }
  | {
      readonly kind: 'install';
      readonly packageId: MarketInstallWebviewMessage['packageId'];
      readonly version: MarketInstallWebviewMessage['version'];
    }
  | { readonly kind: 'uninstall'; readonly packageId: MarketUninstallWebviewMessage['packageId'] }
  | { readonly kind: 'listInstalled' }
  | { readonly kind: 'checkUpdates' }
  | { readonly kind: 'getFeatured' };

export type MarketplaceExecutionEventProjection =
  | { readonly kind: 'searchResult'; readonly data: NonNullable<MarketSearchResultMessage['data']> }
  | {
      readonly kind: 'installProgress';
      readonly data: NonNullable<MarketInstallProgressMessage['data']>;
    }
  | {
      readonly kind: 'installResult';
      readonly data: NonNullable<MarketInstallResultMessage['data']>;
    }
  | {
      readonly kind: 'uninstallResult';
      readonly data: NonNullable<MarketUninstallResultMessage['data']>;
    }
  | {
      readonly kind: 'installedList';
      readonly data: readonly NonNullable<MarketInstalledListMessage['data']>[number][];
    }
  | {
      readonly kind: 'updates';
      readonly data: readonly NonNullable<MarketUpdatesMessage['data']>[number][];
    }
  | { readonly kind: 'featured'; readonly data: NonNullable<MarketFeaturedMessage['data']> }
  | { readonly kind: 'error'; readonly error: MarketErrorMessage['error'] };
