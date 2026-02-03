import { useState, useEffect, useCallback, useMemo } from 'react';
import { ConfiguredProvider, ProviderTemplateInfo } from '@/components/types';
import {
  getProviderUIMetadata,
  getProviderAuthFields,
  isNoKeyProvider,
  type AuthField,
} from '@/config/ui-metadata';
import { useTranslation } from '@/i18n/I18nContext';
import { VSCodeMessages } from '@/components/hooks/useVSCode';
import type { ModelConfig, ProviderModelInfo, ProviderType } from '@neko/shared';

/**
 * Combined provider info from Platform data + UI metadata
 */
interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  defaultUrl?: string;
  icon: string;
  category: 'chat' | 'media';
  noKey: boolean;
  authFields?: AuthField[];
}

// Group type for display
type ProviderGroupType = 'builtin' | 'custom';

/**
 * Group providers by builtin vs custom
 */
function groupByType(providers: ConfiguredProvider[]): Record<ProviderGroupType, ConfiguredProvider[]> {
  const groups: Record<ProviderGroupType, ConfiguredProvider[]> = {
    builtin: [],
    custom: [],
  };

  for (const provider of providers) {
    if (provider.builtin) {
      groups.builtin.push(provider);
    } else {
      groups.custom.push(provider);
    }
  }

  return groups;
}

/**
 * Group section header with count
 */
function GroupHeader({ groupType, count, t }: { groupType: ProviderGroupType; count: number; t: (key: string) => string }) {
  const labels: Record<ProviderGroupType, string> = {
    builtin: t('settings.skills.groupBuiltin'),
    custom: t('settings.skills.groupCustom'),
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-[var(--vscode-descriptionForeground)]">
        {labels[groupType]}
      </span>
      <span className="text-[9px] px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
        {count}
      </span>
    </div>
  );
}

interface ProviderSettingsProps {
  configuredProviders: ConfiguredProvider[];
  providerTemplates: ProviderTemplateInfo[];
  configuredModels: ModelConfig[];
  onAddProvider: (provider: {
    id?: string;
    type: string;
    name?: string;
    apiKey?: string;
    baseUrl?: string;
    authOptions?: Record<string, string>;
  }) => void;
  onRemoveProvider: (providerId: string) => void;
  onToggleProvider: (providerId: string, enabled: boolean) => void;
  onUpdateProviders?: (providers: ConfiguredProvider[]) => void;
  onDeleteProvider?: (providerId: string) => void;
  onAddModel?: (model: Omit<ModelConfig, 'id'>) => void;
  onUpdateModel?: (model: ModelConfig) => void;
  onDeleteModel?: (modelId: string) => void;
}

export function ProviderSettings({
  configuredProviders,
  providerTemplates,
  configuredModels,
  onAddProvider,
  onRemoveProvider,
  onToggleProvider,
  onUpdateProviders,
  onDeleteProvider,
  onAddModel,
  onUpdateModel,
  onDeleteModel,
}: ProviderSettingsProps) {
  const { t } = useTranslation();
  // Form state
  const [showAddProviderForm, setShowAddProviderForm] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [newProviderType, setNewProviderType] = useState('');
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderUrl, setNewProviderUrl] = useState('');
  // Dynamic auth fields state
  const [authFieldValues, setAuthFieldValues] = useState<Record<string, string>>({});

  // URL validation state
  const urlNeedsV1 = useMemo(() => {
    if (!newProviderUrl) return false;
    // Check if this provider type typically needs /v1
    const typesNeedingV1 = ['openai', 'generic', 'newapi', 'azure'];
    if (!typesNeedingV1.includes(newProviderType)) return false;
    // Check if URL already has /v1
    const url = newProviderUrl.toLowerCase();
    return !url.endsWith('/v1') && !url.includes('/v1/');
  }, [newProviderUrl, newProviderType]);

  // Model form state
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [modelDialogProviderId, setModelDialogProviderId] = useState<string | null>(null);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [newModelName, setNewModelName] = useState('');
  const [newModelCapabilities, setNewModelCapabilities] = useState<string[]>(['chat']);
  const [newModelContextWindow, setNewModelContextWindow] = useState<number | undefined>(undefined);
  const [newModelProtocol, setNewModelProtocol] = useState<ProviderType | 'auto'>('auto');

  // API model list state - now with detailed model info
  const [apiModels, setApiModels] = useState<ProviderModelInfo[]>([]);
  const [isLoadingApiModels, setIsLoadingApiModels] = useState(false);
  const [apiModelsError, setApiModelsError] = useState<string | null>(null);
  const [apiModelFilter, setApiModelFilter] = useState<'all' | 'chat' | 'image' | 'video' | 'audio' | 'embedding'>('all');

  // API Key validation state - keyed by modelId
  const [validatingModelId, setValidatingModelId] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<Record<string, { valid: boolean; error?: string } | null>>({});

  // Group expansion state
  const [expandedGroups, setExpandedGroups] = useState<Record<ProviderGroupType, boolean>>({
    builtin: true,
    custom: true,
  });

  // Group providers by builtin vs custom
  const groupedProviders = useMemo(() => groupByType(configuredProviders), [configuredProviders]);

  // Toggle group expansion
  const toggleGroup = (groupType: ProviderGroupType) => {
    setExpandedGroups(prev => ({ ...prev, [groupType]: !prev[groupType] }));
  };

  // Protocol types for dropdown (like Cherry Studio)
  const PROTOCOL_TYPES = [
    { id: 'openai', name: 'OpenAI', category: 'chat' },
    { id: 'anthropic', name: 'Anthropic', category: 'chat' },
    { id: 'google', name: 'Google AI (Gemini)', category: 'chat' },
    { id: 'azure', name: 'Azure OpenAI', category: 'chat' },
    { id: 'ollama', name: 'Ollama', category: 'chat' },
    { id: 'newapi', name: 'NewAPI', category: 'chat' },
    { id: 'generic', name: t('settings.providers.genericOpenAI'), category: 'chat' },
    { id: 'midjourney', name: 'Midjourney', category: 'media' },
    { id: 'liblib', name: 'LiblibAI', category: 'media' },
    { id: 'kling', name: 'Kling', category: 'media' },
    { id: 'vidu', name: 'Vidu', category: 'media' },
    { id: 'runway', name: 'Runway', category: 'media' },
    { id: 'luma', name: 'Luma AI', category: 'media' },
    { id: 'minimax', name: 'MiniMax', category: 'media' },
    { id: 'suno', name: 'Suno', category: 'media' },
  ];

  // Helper: Get provider info by type (for auth fields and noKey check)
  const getProviderInfoByType = useCallback((typeId: string): ProviderInfo | undefined => {
    const protocolType = PROTOCOL_TYPES.find(p => p.id === typeId);
    if (!protocolType) return undefined;

    const uiMetadata = getProviderUIMetadata(typeId);
    // Find template for default URL
    const template = providerTemplates.find(t => t.type === typeId || t.id === typeId);

    return {
      id: typeId,
      name: protocolType.name,
      type: typeId,
      defaultUrl: template?.apiUrl || '',
      icon: uiMetadata.icon,
      category: uiMetadata.category,
      noKey: isNoKeyProvider(typeId),
      authFields: getProviderAuthFields(typeId),
    };
  }, [providerTemplates, t]);

  // Group protocol types by category for dropdown
  const chatProtocols = PROTOCOL_TYPES.filter(p => p.category === 'chat');
  const mediaProtocols = PROTOCOL_TYPES.filter(p => p.category === 'media');

  const selectedProviderType = getProviderInfoByType(newProviderType);

  // Group models by capability type
  const groupedApiModels = useMemo(() => {
    const groups: Record<string, ProviderModelInfo[]> = {
      chat: [],
      'image-generation': [],
      'video-generation': [],
      'audio-generation': [],
      embedding: [],
      other: [],
    };

    for (const model of apiModels) {
      const caps = model.capabilities || [];
      if (caps.includes('chat')) {
        groups.chat.push(model);
      } else if (caps.includes('image-generation')) {
        groups['image-generation'].push(model);
      } else if (caps.includes('video-generation')) {
        groups['video-generation'].push(model);
      } else if (caps.includes('audio-generation')) {
        groups['audio-generation'].push(model);
      } else if (caps.includes('embedding')) {
        groups.embedding.push(model);
      } else {
        groups.other.push(model);
      }
    }

    return groups;
  }, [apiModels]);

  // Filter models based on selected filter
  const filteredApiModels = useMemo(() => {
    switch (apiModelFilter) {
      case 'chat':
        return groupedApiModels.chat;
      case 'image':
        return groupedApiModels['image-generation'];
      case 'video':
        return groupedApiModels['video-generation'];
      case 'audio':
        return groupedApiModels['audio-generation'];
      case 'embedding':
        return groupedApiModels.embedding;
      default:
        return apiModels;
    }
  }, [apiModelFilter, apiModels, groupedApiModels]);

  // Listen for provider models result
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'providerModelsResult') {
        if (message.providerId === modelDialogProviderId) {
          setIsLoadingApiModels(false);
          if (message.success) {
            setApiModels(message.models || []);
            setApiModelsError(null);
          } else {
            setApiModels([]);
            // Check for "not supported" error and show friendly message
            const errorMsg = message.error || '';
            if (errorMsg.includes('LIST_MODELS_NOT_SUPPORTED') || errorMsg.includes('not support') || errorMsg.includes('not found')) {
              setApiModelsError(t('settings.providers.fetchModelsNotSupported'));
            } else {
              setApiModelsError(message.error || t('settings.providers.fetchModelsFailed'));
            }
          }
        }
      } else if (message.type === 'validateApiKeyResult') {
        // Handle API key validation result - keyed by modelId
        const { modelId, valid, error } = message;
        setValidatingModelId(null);
        setValidationResults(prev => ({
          ...prev,
          [modelId]: { valid, error },
        }));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [modelDialogProviderId, t]);

  // Fetch models from provider API
  const handleFetchApiModels = useCallback(() => {
    if (!modelDialogProviderId) return;
    setIsLoadingApiModels(true);
    setApiModelsError(null);
    setApiModels([]);
    setApiModelFilter('all');
    const requestId = `fetch-models-${Date.now()}`;
    VSCodeMessages.listProviderModels(modelDialogProviderId, requestId);
  }, [modelDialogProviderId]);

  // Validate provider API key with specific model
  const handleValidateApiKey = useCallback((modelId: string, providerId: string) => {
    setValidatingModelId(modelId);
    // Clear previous result for this model
    setValidationResults(prev => ({ ...prev, [modelId]: null }));
    const requestId = `validate-key-${Date.now()}`;
    VSCodeMessages.validateApiKey(providerId, modelId, requestId);
  }, []);

  // Handle selecting a model from API list
  const handleSelectApiModel = useCallback((model: ProviderModelInfo) => {
    setNewModelName(model.id);
    // Auto-set capabilities based on model info - copy all capabilities directly
    const caps = model.capabilities || [];
    if (caps.length > 0) {
      setNewModelCapabilities([...caps]);
    }
  }, []);

  // Get auth fields for the selected provider type
  const getAuthFields = (): AuthField[] => {
    if (!selectedProviderType) return [];
    // If provider has custom auth fields, use them
    if (selectedProviderType.authFields && selectedProviderType.authFields.length > 0) {
      return selectedProviderType.authFields;
    }
    // Default: single API key field
    if (!selectedProviderType.noKey) {
      return [{ key: 'apiKey', label: t('settings.providers.apiKey'), placeholder: 'sk-xxx...', required: true }];
    }
    return [];
  };

  const handleProviderTypeSelect = (type: string) => {
    setNewProviderType(type);
    const providerType = getProviderInfoByType(type);
    if (providerType) {
      setNewProviderUrl(providerType.defaultUrl || '');
      // Don't auto-set name, let user customize it
      setNewProviderName('');
    }
    // Reset auth field values
    setAuthFieldValues({});
  };

  // Auto-append /v1 to URL
  const handleAppendV1 = () => {
    if (newProviderUrl) {
      const cleanUrl = newProviderUrl.replace(/\/+$/, '');
      setNewProviderUrl(cleanUrl + '/v1');
    }
  };

  const handleEditProvider = (provider: ConfiguredProvider) => {
    setEditingProviderId(provider.id);
    setNewProviderType(provider.type);
    setNewProviderName(provider.name || '');
    setNewProviderUrl(provider.baseUrl || '');
    // Load existing auth options (include apiKey if present)
    const existingAuth: Record<string, string> = { ...(provider.authOptions || {}) };
    if (provider.apiKey) {
      existingAuth.apiKey = provider.apiKey;
    }
    setAuthFieldValues(existingAuth);
    setShowAddProviderForm(true);
  };

  const handleSubmitProvider = () => {
    if (!newProviderType) return;

    // Build auth options from all auth fields
    const authFields = getAuthFields();
    const authOptions: Record<string, string> = {};
    let apiKeyValue: string | undefined;

    for (const field of authFields) {
      const value = authFieldValues[field.key];
      if (value) {
        if (field.key === 'apiKey') {
          apiKeyValue = value;
        } else {
          authOptions[field.key] = value;
        }
      }
    }

    onAddProvider({
      id: editingProviderId || undefined,
      type: newProviderType,
      name: newProviderName || undefined,
      apiKey: apiKeyValue,
      baseUrl: newProviderUrl || undefined,
      authOptions: Object.keys(authOptions).length > 0 ? authOptions : undefined,
    });
    handleCancelEdit();
  };

  const handleCancelEdit = () => {
    setNewProviderType('');
    setNewProviderName('');
    setNewProviderUrl('');
    setAuthFieldValues({});
    setEditingProviderId(null);
    setShowAddProviderForm(false);
  };

  // Update auth field value
  const handleAuthFieldChange = (key: string, value: string) => {
    setAuthFieldValues(prev => ({ ...prev, [key]: value }));
  };

  // Handle provider removal
  const handleRemoveProvider = (providerId: string) => {
    if (onDeleteProvider) {
      onDeleteProvider(providerId);
    } else {
      onRemoveProvider(providerId);
    }
  };

  // Handle provider toggle
  const handleToggleProvider = (providerId: string, enabled: boolean) => {
    if (onUpdateProviders) {
      const updatedProviders = configuredProviders.map(p =>
        p.id === providerId ? { ...p, enabled } : p
      );
      onUpdateProviders(updatedProviders);
    } else {
      onToggleProvider(providerId, enabled);
    }
  };

  // Handle provider duplicate
  const handleDuplicateProvider = (provider: ConfiguredProvider) => {
    onAddProvider({
      type: provider.type,
      name: `${provider.name} (Copy)`,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
    });
  };

  // Model dialog handlers
  const handleOpenModelDialog = (providerId: string) => {
    setModelDialogProviderId(providerId);
    setEditingModelId(null);
    setNewModelName('');
    setNewModelCapabilities(['chat']);
    setNewModelContextWindow(undefined);
    setNewModelProtocol('auto');
    setShowModelDialog(true);
  };

  const handleEditModel = (model: ModelConfig) => {
    setModelDialogProviderId(model.providerId);
    setEditingModelId(model.id);
    setNewModelName(model.name);
    setNewModelCapabilities(model.capabilities as string[]);
    setNewModelContextWindow(model.contextWindow);
    setNewModelProtocol(model.protocol || 'auto');
    setShowModelDialog(true);
  };

  const handleCloseModelDialog = () => {
    setShowModelDialog(false);
    setModelDialogProviderId(null);
    setEditingModelId(null);
    setNewModelName('');
    setNewModelCapabilities(['chat']);
    setNewModelContextWindow(undefined);
    setNewModelProtocol('auto');
    // Clear API models state
    setApiModels([]);
    setApiModelsError(null);
    setIsLoadingApiModels(false);
    setApiModelFilter('all');
  };

  const handleSubmitModel = () => {
    if (!newModelName || !modelDialogProviderId) return;

    // Only include protocol if not 'auto'
    const protocolValue = newModelProtocol === 'auto' ? undefined : newModelProtocol;

    if (editingModelId && onUpdateModel) {
      onUpdateModel({
        id: editingModelId,
        name: newModelName,
        providerId: modelDialogProviderId,
        capabilities: newModelCapabilities,
        contextWindow: newModelContextWindow,
        protocol: protocolValue,
        enabled: true,
      });
    } else if (onAddModel) {
      onAddModel({
        name: newModelName,
        providerId: modelDialogProviderId,
        capabilities: newModelCapabilities,
        contextWindow: newModelContextWindow,
        protocol: protocolValue,
        enabled: true,
      });
    }
    handleCloseModelDialog();
  };

  const handleDeleteModel = (modelId: string) => {
    if (onDeleteModel) {
      onDeleteModel(modelId);
    }
  };

  const handleToggleCapability = (cap: string) => {
    if (newModelCapabilities.includes(cap)) {
      setNewModelCapabilities(newModelCapabilities.filter(c => c !== cap));
    } else {
      setNewModelCapabilities([...newModelCapabilities, cap]);
    }
  };

  // Get models for a specific provider
  const getModelsForProvider = (providerId: string) => {
    return configuredModels.filter(m => m.providerId === providerId);
  };

  // Render a single provider item
  const renderProvider = (provider: ConfiguredProvider) => {
    const isEnabled = provider.enabled !== false;
    const providerInfo = getProviderInfoByType(provider.type);
    const isBuiltin = provider.builtin ?? false;
    const providerModels = getModelsForProvider(provider.id);

    return (
      <div
        key={provider.id}
        className={`border rounded transition-colors ${
          isEnabled
            ? 'border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
            : 'border-[var(--vscode-panel-border)] opacity-60'
        }`}
      >
        <div className="flex items-center gap-2 p-2">
          {/* Toggle Switch */}
          <button
            onClick={() => handleToggleProvider(provider.id, !isEnabled)}
            className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
              isEnabled
                ? 'bg-[var(--vscode-button-background)]'
                : 'bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]'
            }`}
            title={isEnabled ? t('common.disable') : t('common.enable')}
          >
            <span
              className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all ${
                isEnabled
                  ? 'left-4 bg-[var(--vscode-button-foreground)]'
                  : 'left-0.5 bg-[var(--vscode-descriptionForeground)]'
              }`}
            />
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className={`text-[11px] font-medium ${!isEnabled ? 'opacity-50' : ''}`}>
              {provider.name || providerInfo?.name || provider.type}
            </div>
            <div className={`text-[9px] text-[var(--vscode-descriptionForeground)] ${!isEnabled ? 'opacity-50' : ''}`}>
              {provider.baseUrl || providerInfo?.defaultUrl || t('settings.providers.noUrl')}
            </div>
          </div>

          {/* Provider type badge */}
          <span className={`text-[9px] px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded ${!isEnabled ? 'opacity-50' : ''}`}>
            {providerInfo?.category === 'chat' ? t('settings.providers.chat') : providerInfo?.category === 'media' ? t('settings.providers.media') : t('settings.providers.provider')}
          </span>

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            {/* Models button - only for non-builtin providers */}
            {!isBuiltin && (
              <button
                onClick={() => handleOpenModelDialog(provider.id)}
                className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
                title={t('settings.providers.configureModels')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </button>
            )}
            <button
              onClick={() => handleDuplicateProvider(provider)}
              className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
              title={t('settings.agents.duplicate')}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            {/* Edit button - only for non-builtin providers */}
            {!isBuiltin && (
              <button
                onClick={() => handleEditProvider(provider)}
                className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
                title={t('common.edit')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            {/* Delete button - only for non-builtin providers */}
            {!isBuiltin && (
              <button
                onClick={() => handleRemoveProvider(provider.id)}
                className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100 text-[var(--vscode-errorForeground)]"
                title={t('common.remove')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Models list */}
        {providerModels.length > 0 && (
          <div className="px-2 pb-2 pt-1 border-t border-[var(--vscode-panel-border)]">
            <div className="flex flex-wrap gap-1">
              {providerModels.map(model => (
                <span
                  key={model.id}
                  className={`text-[9px] px-1.5 py-0.5 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded ${!isBuiltin ? 'cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)]' : ''}`}
                  onClick={!isBuiltin ? () => handleEditModel(model) : undefined}
                  title={!isBuiltin ? `${model.name} - ${t('common.edit')}` : model.name}
                >
                  {model.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render a group (builtin or custom)
  const renderGroup = (groupType: ProviderGroupType, providers: ConfiguredProvider[]) => {
    if (providers.length === 0) return null;

    const isExpanded = expandedGroups[groupType];

    return (
      <div key={groupType} className="mb-4">
        {/* Group Header */}
        <button
          onClick={() => toggleGroup(groupType)}
          className="w-full flex items-center gap-2 mb-2 hover:bg-[var(--vscode-list-hoverBackground)] rounded p-1 -ml-1"
        >
          <svg
            className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <GroupHeader groupType={groupType} count={providers.length} t={t} />
        </button>

        {/* Group Content */}
        {isExpanded && (
          <div className="space-y-1.5 ml-4">
            {providers.map(provider => renderProvider(provider))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Configured Providers */}
      <div className="border border-[var(--vscode-panel-border)] rounded p-3">
        <h3 className="text-[12px] font-medium mb-2">{t('settings.providers.title')}</h3>
        <p className="text-[10px] text-[var(--vscode-descriptionForeground)] mb-3">
          {t('settings.providers.description')}
        </p>

        {/* Grouped providers */}
        <div className="space-y-2">
          {renderGroup('builtin', groupedProviders.builtin)}
          {renderGroup('custom', groupedProviders.custom)}
        </div>

        {/* Add/Edit Provider Form */}
        {!showAddProviderForm ? (
          <button
            onClick={() => { setEditingProviderId(null); setShowAddProviderForm(true); }}
            className="w-full py-1.5 text-[11px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors"
          >
            {t('settings.providers.addProvider')}
          </button>
        ) : (
          <div className="border-t border-[var(--vscode-panel-border)] pt-3 mt-3 space-y-3">
            <div className="text-[11px] font-medium mb-2">
              {editingProviderId ? `${t('settings.providers.editProvider')}: ${newProviderName || newProviderType}` : t('settings.providers.addNew')}
            </div>
            <div>
              <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">{t('settings.providers.providerType')} *</label>
              <select
                className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded disabled:opacity-60"
                value={newProviderType}
                onChange={(e) => handleProviderTypeSelect(e.target.value)}
                disabled={!!editingProviderId}
              >
                <option value="">{t('settings.providers.selectProvider')}</option>
                <optgroup label={t('settings.providers.chatModels')}>
                  {chatProtocols.map(protocol => (
                    <option key={protocol.id} value={protocol.id}>{protocol.name}</option>
                  ))}
                </optgroup>
                <optgroup label={t('settings.providers.mediaModels')}>
                  {mediaProtocols.map(protocol => (
                    <option key={protocol.id} value={protocol.id}>{protocol.name}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">{t('settings.providers.displayName')}</label>
              <input
                type="text"
                className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
                placeholder={t('settings.providers.displayNamePlaceholder')}
                value={newProviderName}
                onChange={(e) => setNewProviderName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">{t('settings.providers.apiUrl')}</label>
              <input
                type="text"
                className={`w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border rounded ${
                  urlNeedsV1 ? 'border-[var(--vscode-inputValidation-warningBorder)]' : 'border-[var(--vscode-input-border)]'
                }`}
                placeholder={selectedProviderType?.defaultUrl || 'https://api.example.com/v1'}
                value={newProviderUrl}
                onChange={(e) => setNewProviderUrl(e.target.value)}
              />
              {urlNeedsV1 && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] text-[var(--vscode-inputValidation-warningForeground)]">
                    ⚠️ {t('settings.providers.urlMissingV1')}
                  </span>
                  <button
                    type="button"
                    onClick={handleAppendV1}
                    className="text-[9px] px-1.5 py-0.5 bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] rounded transition-colors"
                  >
                    {t('settings.providers.appendV1')}
                  </button>
                </div>
              )}
            </div>

            {/* Dynamic Auth Fields */}
            {getAuthFields().map((field) => (
              <div key={field.key}>
                <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">
                  {field.label} {field.required ? '*' : ''}
                  {editingProviderId && <span className="ml-1 text-[9px]">({t('settings.providers.apiKeyKeepCurrent')})</span>}
                </label>
                <input
                  type={field.type || 'password'}
                  className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
                  placeholder={editingProviderId ? '••••••••' : field.placeholder}
                  value={authFieldValues[field.key] || ''}
                  onChange={(e) => handleAuthFieldChange(field.key, e.target.value)}
                />
                {field.helpText && (
                  <p className="text-[9px] text-[var(--vscode-descriptionForeground)] mt-0.5">{field.helpText}</p>
                )}
              </div>
            ))}

            <div className="flex gap-2">
              <button onClick={handleCancelEdit} className="flex-1 py-1.5 text-[11px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors">{t('common.cancel')}</button>
              <button
                onClick={handleSubmitProvider}
                disabled={!newProviderType}
                className="flex-1 py-1.5 text-[11px] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingProviderId ? t('settings.providers.update') : t('common.add')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Model Configuration Dialog */}
      {showModelDialog && modelDialogProviderId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg p-4 w-[320px] max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[12px] font-medium">
                {editingModelId ? t('settings.providers.editModel') : t('settings.providers.addModel')}
              </h3>
              <button
                onClick={handleCloseModelDialog}
                className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Provider info */}
            <div className="text-[10px] text-[var(--vscode-descriptionForeground)] mb-3 pb-2 border-b border-[var(--vscode-panel-border)]">
              {t('settings.providers.provider')}: {configuredProviders.find(p => p.id === modelDialogProviderId)?.name || modelDialogProviderId}
            </div>

            {/* Fetch models from API */}
            {!editingModelId && (
              <div className="mb-3 pb-3 border-b border-[var(--vscode-panel-border)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                    {t('settings.providers.availableModels')}
                  </span>
                  <button
                    onClick={handleFetchApiModels}
                    disabled={isLoadingApiModels}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] rounded transition-colors disabled:opacity-50"
                  >
                    {isLoadingApiModels ? (
                      <>
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        {t('common.loading')}
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {t('settings.providers.fetchModels')}
                      </>
                    )}
                  </button>
                </div>

                {apiModelsError && (
                  <div className="text-[10px] text-[var(--vscode-errorForeground)] mb-2">
                    {apiModelsError}
                  </div>
                )}

                {apiModels.length > 0 && (
                  <>
                    {/* Filter tabs */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {(['all', 'chat', 'image', 'video', 'audio', 'embedding'] as const).map((filter) => {
                        const count = filter === 'all' ? apiModels.length
                          : filter === 'chat' ? groupedApiModels.chat.length
                          : filter === 'image' ? groupedApiModels['image-generation'].length
                          : filter === 'video' ? groupedApiModels['video-generation'].length
                          : filter === 'audio' ? groupedApiModels['audio-generation'].length
                          : groupedApiModels.embedding.length;
                        if (filter !== 'all' && count === 0) return null;
                        const label = filter === 'all' ? t('common.all')
                          : filter === 'chat' ? t('settings.providers.chat')
                          : filter === 'image' ? t('settings.providers.imageGen')
                          : filter === 'video' ? t('settings.providers.videoGen')
                          : filter === 'audio' ? t('settings.providers.audioGen')
                          : t('settings.providers.embedding');
                        return (
                          <button
                            key={filter}
                            onClick={() => setApiModelFilter(filter)}
                            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                              apiModelFilter === filter
                                ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                                : 'bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
                            }`}
                          >
                            {label} ({count})
                          </button>
                        );
                      })}
                    </div>

                    {/* Model list - grouped when showing all, flat otherwise */}
                    <div className="max-h-[180px] overflow-y-auto space-y-2">
                      {apiModelFilter === 'all' ? (
                        // Grouped display
                        <>
                          {groupedApiModels.chat.length > 0 && (
                            <div>
                              <div className="text-[9px] text-[var(--vscode-descriptionForeground)] mb-1">💬 {t('settings.providers.chat')} ({groupedApiModels.chat.length})</div>
                              <div className="flex flex-wrap gap-1">
                                {groupedApiModels.chat.map(model => (
                                  <button
                                    key={model.id}
                                    onClick={() => handleSelectApiModel(model)}
                                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                                      newModelName === model.id
                                        ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent'
                                        : 'bg-[var(--vscode-input-background)] border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
                                    }`}
                                    title={`${model.id}\n${t('settings.providers.capabilities')}: ${model.capabilities?.join(', ') || 'unknown'}`}
                                  >
                                    {model.id}
                                    {model.capabilities?.includes('vision') && <span className="ml-0.5 opacity-60">👁</span>}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {groupedApiModels['image-generation'].length > 0 && (
                            <div>
                              <div className="text-[9px] text-[var(--vscode-descriptionForeground)] mb-1">🖼 {t('settings.providers.imageGen')} ({groupedApiModels['image-generation'].length})</div>
                              <div className="flex flex-wrap gap-1">
                                {groupedApiModels['image-generation'].map(model => (
                                  <button
                                    key={model.id}
                                    onClick={() => handleSelectApiModel(model)}
                                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                                      newModelName === model.id
                                        ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent'
                                        : 'bg-[var(--vscode-input-background)] border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
                                    }`}
                                    title={`${model.id}\n${t('settings.providers.capabilities')}: ${model.capabilities?.join(', ') || 'unknown'}`}
                                  >
                                    {model.id}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {groupedApiModels['video-generation'].length > 0 && (
                            <div>
                              <div className="text-[9px] text-[var(--vscode-descriptionForeground)] mb-1">🎬 {t('settings.providers.videoGen')} ({groupedApiModels['video-generation'].length})</div>
                              <div className="flex flex-wrap gap-1">
                                {groupedApiModels['video-generation'].map(model => (
                                  <button
                                    key={model.id}
                                    onClick={() => handleSelectApiModel(model)}
                                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                                      newModelName === model.id
                                        ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent'
                                        : 'bg-[var(--vscode-input-background)] border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
                                    }`}
                                    title={`${model.id}\n${t('settings.providers.capabilities')}: ${model.capabilities?.join(', ') || 'unknown'}`}
                                  >
                                    {model.id}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {groupedApiModels['audio-generation'].length > 0 && (
                            <div>
                              <div className="text-[9px] text-[var(--vscode-descriptionForeground)] mb-1">🔊 {t('settings.providers.audioGen')} ({groupedApiModels['audio-generation'].length})</div>
                              <div className="flex flex-wrap gap-1">
                                {groupedApiModels['audio-generation'].map(model => (
                                  <button
                                    key={model.id}
                                    onClick={() => handleSelectApiModel(model)}
                                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                                      newModelName === model.id
                                        ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent'
                                        : 'bg-[var(--vscode-input-background)] border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
                                    }`}
                                    title={`${model.id}\n${t('settings.providers.capabilities')}: ${model.capabilities?.join(', ') || 'unknown'}`}
                                  >
                                    {model.id}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {groupedApiModels.embedding.length > 0 && (
                            <div>
                              <div className="text-[9px] text-[var(--vscode-descriptionForeground)] mb-1">📊 {t('settings.providers.embedding')} ({groupedApiModels.embedding.length})</div>
                              <div className="flex flex-wrap gap-1">
                                {groupedApiModels.embedding.map(model => (
                                  <button
                                    key={model.id}
                                    onClick={() => handleSelectApiModel(model)}
                                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                                      newModelName === model.id
                                        ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent'
                                        : 'bg-[var(--vscode-input-background)] border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
                                    }`}
                                    title={`${model.id}\n${t('settings.providers.capabilities')}: ${model.capabilities?.join(', ') || 'unknown'}`}
                                  >
                                    {model.id}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {groupedApiModels.other.length > 0 && (
                            <div>
                              <div className="text-[9px] text-[var(--vscode-descriptionForeground)] mb-1">🔧 {t('chat.categoryOther')} ({groupedApiModels.other.length})</div>
                              <div className="flex flex-wrap gap-1">
                                {groupedApiModels.other.map(model => (
                                  <button
                                    key={model.id}
                                    onClick={() => handleSelectApiModel(model)}
                                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                                      newModelName === model.id
                                        ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent'
                                        : 'bg-[var(--vscode-input-background)] border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
                                    }`}
                                    title={`${model.id}\n${t('settings.providers.capabilities')}: ${model.capabilities?.join(', ') || 'unknown'}`}
                                  >
                                    {model.id}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        // Flat display for filtered results
                        <div className="flex flex-wrap gap-1">
                          {filteredApiModels.map(model => (
                            <button
                              key={model.id}
                              onClick={() => handleSelectApiModel(model)}
                              className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                                newModelName === model.id
                                  ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent'
                                  : 'bg-[var(--vscode-input-background)] border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
                              }`}
                              title={`${model.id}\n${t('settings.providers.capabilities')}: ${model.capabilities?.join(', ') || 'unknown'}`}
                            >
                              {model.id}
                              {model.capabilities?.includes('vision') && <span className="ml-0.5 opacity-60">👁</span>}
                              {model.capabilities?.includes('image-generation') && <span className="ml-0.5 opacity-60">🖼</span>}
                              {model.capabilities?.includes('video-generation') && <span className="ml-0.5 opacity-60">🎬</span>}
                              {model.capabilities?.includes('audio-generation') && <span className="ml-0.5 opacity-60">🔊</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Existing models for this provider */}
            {getModelsForProvider(modelDialogProviderId).length > 0 && !editingModelId && (
              <div className="mb-3 pb-3 border-b border-[var(--vscode-panel-border)]">
                <div className="text-[10px] text-[var(--vscode-descriptionForeground)] mb-2">{t('settings.providers.existingModels')}</div>
                <div className="space-y-1">
                  {getModelsForProvider(modelDialogProviderId).map(model => (
                    <div key={model.id} className="flex items-center justify-between p-1.5 bg-[var(--vscode-input-background)] rounded text-[10px]">
                      <span>{model.name}</span>
                      <div className="flex items-center gap-1">
                        {/* Validate API Key button */}
                        <button
                          onClick={() => handleValidateApiKey(model.id, model.providerId)}
                          disabled={validatingModelId === model.id}
                          className={`p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-colors ${
                            validationResults[model.id]?.valid === true
                              ? 'text-[var(--vscode-charts-green)]'
                              : validationResults[model.id]?.valid === false
                              ? 'text-[var(--vscode-errorForeground)]'
                              : 'opacity-60 hover:opacity-100'
                          }`}
                          title={
                            validatingModelId === model.id
                              ? t('settings.providers.validating')
                              : validationResults[model.id]?.valid === true
                              ? t('settings.providers.apiKeyValid')
                              : validationResults[model.id]?.valid === false
                              ? `${t('settings.providers.apiKeyInvalid')}: ${validationResults[model.id]?.error || ''}`
                              : t('settings.providers.validateApiKey')
                          }
                        >
                          {validatingModelId === model.id ? (
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : validationResults[model.id]?.valid === true ? (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : validationResults[model.id]?.valid === false ? (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => handleEditModel(model)}
                          className="p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
                          title={t('common.edit')}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteModel(model.id)}
                          className="p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100 text-[var(--vscode-errorForeground)]"
                          title={t('common.remove')}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Model form */}
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">
                  {t('settings.providers.modelName')} *
                </label>
                <input
                  type="text"
                  className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
                  placeholder="gpt-4, claude-3-opus, ..."
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">
                  {t('settings.providers.capabilities')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'chat', label: t('settings.providers.chat'), icon: '💬' },
                    { id: 'vision', label: 'vision', icon: '👁' },
                    { id: 'function_call', label: 'function_call', icon: '🔧' },
                    { id: 'stream', label: 'stream', icon: '📡' },
                    { id: 'image-generation', label: t('settings.providers.imageGen'), icon: '🖼' },
                    { id: 'video-generation', label: t('settings.providers.videoGen'), icon: '🎬' },
                    { id: 'audio-generation', label: t('settings.providers.audioGen'), icon: '🔊' },
                    { id: 'embedding', label: t('settings.providers.embedding'), icon: '📊' },
                  ].map(cap => (
                    <button
                      key={cap.id}
                      onClick={() => handleToggleCapability(cap.id)}
                      className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                        newModelCapabilities.includes(cap.id)
                          ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent'
                          : 'bg-[var(--vscode-input-background)] border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
                      }`}
                    >
                      {cap.icon} {cap.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">
                  {t('settings.providers.contextWindow')}
                </label>
                <input
                  type="number"
                  className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
                  placeholder="128000"
                  value={newModelContextWindow || ''}
                  onChange={(e) => setNewModelContextWindow(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                />
              </div>

              <div>
                <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">
                  {t('settings.providers.protocol')}
                </label>
                <select
                  className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
                  value={newModelProtocol}
                  onChange={(e) => setNewModelProtocol(e.target.value as ProviderType | 'auto')}
                >
                  <option value="auto">{t('settings.providers.protocolAuto')}</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="azure">Azure OpenAI</option>
                  <option value="ollama">Ollama</option>
                </select>
                <p className="text-[9px] text-[var(--vscode-descriptionForeground)] mt-0.5">
                  {t('settings.providers.protocolHint')}
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCloseModelDialog}
                  className="flex-1 py-1.5 text-[11px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSubmitModel}
                  disabled={!newModelName}
                  className="flex-1 py-1.5 text-[11px] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingModelId ? t('settings.providers.update') : t('common.add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
