import type { AgentContextPayload, ChatModelOption } from '@neko/shared';
import type { SettingsState } from './ui';
import type {
  AgentMediaModelCategory,
  AgentMediaModelSelections,
  MediaModelCategory,
  ModelRef,
  ProjectFileMentionInfo,
  ProjectMentionMediaType,
  ProjectMentionSource,
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

export type ProjectMentionItemKind =
  | 'file'
  | 'canvas-node'
  | 'character'
  | 'scene'
  | 'asset'
  | 'media'
  | 'entity';

export interface ProjectMentionItem {
  id: string;
  kind: ProjectMentionItemKind;
  label: string;
  description?: string;
  filePath?: string;
  icon?: string;
  source?: ProjectMentionSource;
  mediaType?: ProjectMentionMediaType;
  entityType?: string;
  navigationData?: Record<string, string>;
  searchText?: string;
  thumbnailUri?: string;
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
