import { useState } from 'react';
import { SettingsState, SettingsSubTab, ConfiguredMCPServer, ConfiguredProvider } from '@/components/types';
import { ProviderSettings } from '@/components/SettingsView/ProviderSettings';
import { MCPSettings } from '@/components/SettingsView/MCPSettings';
import { ModelSettings, UIModelConfig } from '@/components/SettingsView/ModelSettings';
import { SkillSettings } from '@/components/SettingsView/SkillSettings';
import { useTranslation } from '@/i18n/I18nContext';
import type { ModelConfig, ConfiguredSkill, ConfiguredSlashCommand, ConfiguredToolSkill } from '@neko/shared';

interface SettingsViewProps {
  settings: SettingsState;
  onAddProvider: (provider: {
    id?: string;
    type: string;
    name?: string;
    apiKey?: string;
    baseUrl?: string;
  }) => void;
  onRemoveProvider: (providerId: string) => void;
  onToggleProvider: (providerId: string, enabled: boolean) => void;
  onUpdateProviders?: (providers: ConfiguredProvider[]) => void;
  onDeleteProvider?: (providerId: string) => void;
  // Model CRUD callbacks
  onAddModel?: (model: Omit<ModelConfig, 'id'>) => void;
  onUpdateModel?: (model: ModelConfig) => void;
  onDeleteModel?: (modelId: string) => void;
  onUpdateMCPServers: (servers: ConfiguredMCPServer[]) => void;
  onDeleteMCPServer: (serverId: string) => void;
  onTestMCPServer?: (server: ConfiguredMCPServer) => Promise<{ success: boolean; error?: string }>;
  // Model settings props
  models?: UIModelConfig[];
  onConfigureModel?: (modelId: string, apiKey: string, baseUrl?: string) => void;
  onToggleModel?: (modelId: string, enabled: boolean) => void;
  onRemoveModelConfig?: (modelId: string) => void;
  onExportConfig?: (includeSecrets: boolean) => void;
  onImportConfig?: (jsonString: string, options: { overwrite?: boolean; includeSecrets?: boolean }) => Promise<{ success: boolean; message: string }>;
  onAddCustomModel?: (configJson: string, apiKey?: string) => Promise<{ success: boolean; message: string }>;
  // Skill settings props
  skills?: ConfiguredSkill[];
  commands?: ConfiguredSlashCommand[];
  onUpdateSkill?: (skill: ConfiguredSkill) => void;
  onDeleteSkill?: (skillName: string) => void;
  onUpdateCommand?: (command: ConfiguredSlashCommand) => void;
  onDeleteCommand?: (commandName: string) => void;
  onDuplicateSkill?: (skill: ConfiguredSkill) => void;
  onDuplicateCommand?: (command: ConfiguredSlashCommand) => void;
  onCreateSkill?: (source: 'personal' | 'project') => void;
  // ToolSkill settings props
  toolSkills?: ConfiguredToolSkill[];
  onUpdateToolSkill?: (toolSkill: ConfiguredToolSkill) => void;
}

const SUB_TABS: { id: SettingsSubTab; labelKey: string }[] = [
  { id: 'provider', labelKey: 'settings.tabs.provider' },
  { id: 'skills', labelKey: 'settings.tabs.skills' },
  { id: 'mcp', labelKey: 'settings.tabs.mcp' },
];

export function SettingsView({
  settings,
  onAddProvider,
  onRemoveProvider,
  onToggleProvider,
  onUpdateProviders,
  onDeleteProvider,
  onAddModel,
  onUpdateModel,
  onDeleteModel,
  onUpdateMCPServers,
  onDeleteMCPServer,
  onTestMCPServer,
  models = [],
  onConfigureModel,
  onToggleModel,
  onRemoveModelConfig,
  onExportConfig,
  onImportConfig,
  onAddCustomModel,
  // Skill settings
  skills = [],
  commands = [],
  onUpdateSkill,
  onDeleteSkill,
  onUpdateCommand,
  onDeleteCommand,
  onDuplicateSkill,
  onDuplicateCommand,
  onCreateSkill,
  // ToolSkill settings
  toolSkills = [],
  onUpdateToolSkill,
}: SettingsViewProps) {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>('provider');

  // Use skills and commands from props (already includes builtin skills from ConfigBridge)
  const allSkills = skills.length > 0 ? skills : settings.configuredSkills;
  const allCommands = commands.length > 0 ? commands : settings.configuredCommands;
  const allToolSkills = toolSkills.length > 0 ? toolSkills : settings.configuredToolSkills;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Settings Sub-tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--vscode-panel-border)] flex-shrink-0">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center justify-center px-2.5 py-1 text-[11px] rounded transition-colors flex-1 ${
              activeSubTab === tab.id
                ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                : 'hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-descriptionForeground)]'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {activeSubTab === 'provider' && (
          <ProviderSettings
            configuredProviders={settings.configuredProviders}
            providerTemplates={settings.providerTemplates || []}
            configuredModels={settings.configuredModels}
            onAddProvider={onAddProvider}
            onRemoveProvider={onRemoveProvider}
            onToggleProvider={onToggleProvider}
            onUpdateProviders={onUpdateProviders}
            onDeleteProvider={onDeleteProvider}
            onAddModel={onAddModel}
            onUpdateModel={onUpdateModel}
            onDeleteModel={onDeleteModel}
          />
        )}
        {activeSubTab === 'models' && (
          <ModelSettings
            models={models}
            onConfigureModel={onConfigureModel}
            onToggleModel={onToggleModel}
            onRemoveModelConfig={onRemoveModelConfig}
            onExportConfig={onExportConfig}
            onImportConfig={onImportConfig}
            onAddCustomModel={onAddCustomModel}
          />
        )}
        {activeSubTab === 'mcp' && (
          <MCPSettings
            configuredMCPServers={settings.configuredMCPServers}
            onUpdateServers={onUpdateMCPServers}
            onDeleteServer={onDeleteMCPServer}
            onTestServer={onTestMCPServer}
          />
        )}
        {activeSubTab === 'skills' && (
          <SkillSettings
            skills={allSkills}
            commands={allCommands}
            toolSkills={allToolSkills}
            onUpdateSkill={onUpdateSkill}
            onDeleteSkill={onDeleteSkill}
            onUpdateCommand={onUpdateCommand}
            onDeleteCommand={onDeleteCommand}
            onDuplicateSkill={onDuplicateSkill}
            onDuplicateCommand={onDuplicateCommand}
            onUpdateToolSkill={onUpdateToolSkill}
            onCreateSkill={onCreateSkill}
          />
        )}
      </div>
    </div>
  );
}
