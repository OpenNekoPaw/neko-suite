/**
 * Model Settings Component
 *
 * Displays and manages AI model configurations from the generic config system.
 * Groups models by category (video, image, audio, etc.)
 */

import { useState, useMemo } from 'react';
import { useTranslation } from '@/i18n/I18nContext';

// Model configuration types (simplified for UI)
export interface UIModelConfig {
  id: string;
  name: string;
  description?: string;
  category: 'chat' | 'image' | 'video' | 'audio' | 'enhance' | 'subtitle';
  icon?: string;
  capabilities: string[];
  isConfigured: boolean;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  website?: string;
}

interface ModelSettingsProps {
  models?: UIModelConfig[];
  onConfigureModel?: (modelId: string, apiKey: string, baseUrl?: string) => void;
  onToggleModel?: (modelId: string, enabled: boolean) => void;
  onRemoveModelConfig?: (modelId: string) => void;
  onExportConfig?: (includeSecrets: boolean) => void;
  onImportConfig?: (jsonString: string, options: { overwrite?: boolean; includeSecrets?: boolean }) => Promise<{ success: boolean; message: string }>;
  onAddCustomModel?: (configJson: string, apiKey?: string) => Promise<{ success: boolean; message: string }>;
}

// Category icons and labels
const CATEGORY_INFO: Record<string, { icon: string; labelKey: string }> = {
  video: { icon: '🎬', labelKey: 'settings.models.categories.video' },
  image: { icon: '🎨', labelKey: 'settings.models.categories.image' },
  audio: { icon: '🔊', labelKey: 'settings.models.categories.audio' },
  subtitle: { icon: '📝', labelKey: 'settings.models.categories.subtitle' },
  enhance: { icon: '✨', labelKey: 'settings.models.categories.enhance' },
  chat: { icon: '💬', labelKey: 'settings.models.categories.chat' },
};

// Capability display names
const CAPABILITY_LABELS: Record<string, string> = {
  // Chat/LLM capabilities
  'chat': 'Chat',
  'chat-with-tools': 'Tool Use',
  'chat-with-vision': 'Vision',
  // Video capabilities
  'text-to-video': 'Text to Video',
  'image-to-video': 'Image to Video',
  'video-extend': 'Video Extend',
  'lip-sync': 'Lip Sync',
  // Image capabilities
  'text-to-image': 'Text to Image',
  'image-to-image': 'Image to Image',
  'inpaint': 'Inpaint',
  // Audio capabilities
  'text-to-speech': 'TTS',
  'voice-clone': 'Voice Clone',
  'speech-to-text': 'STT',
  'music-generation': 'Music',
  // Enhance capabilities
  'upscale': 'Upscale',
  'interpolate': 'Interpolate',
  'style-transfer': 'Style Transfer',
  'denoise': 'Denoise',
  'remove-background': 'Remove BG',
};

// Built-in model presets
const BUILTIN_MODEL_PRESETS: UIModelConfig[] = [
  // Video Models
  {
    id: 'kling-v1',
    name: 'Kling v1',
    description: 'High-quality video generation by Kuaishou',
    category: 'video',
    capabilities: ['text-to-video', 'image-to-video'],
    isConfigured: false,
    enabled: false,
    website: 'https://klingai.kuaishou.com',
  },
  {
    id: 'kling-v1.5',
    name: 'Kling v1.5',
    description: 'Latest Kling model with improved quality',
    category: 'video',
    capabilities: ['text-to-video', 'image-to-video', 'video-extend'],
    isConfigured: false,
    enabled: false,
    website: 'https://klingai.kuaishou.com',
  },
  {
    id: 'runway-gen3',
    name: 'Runway Gen-3',
    description: 'Professional video generation by Runway',
    category: 'video',
    capabilities: ['text-to-video', 'image-to-video'],
    isConfigured: false,
    enabled: false,
    website: 'https://runwayml.com',
  },
  {
    id: 'pika-v1',
    name: 'Pika 1.0',
    description: 'Creative video generation',
    category: 'video',
    capabilities: ['text-to-video', 'image-to-video'],
    isConfigured: false,
    enabled: false,
    website: 'https://pika.art',
  },
  {
    id: 'luma-dream-machine',
    name: 'Luma Dream Machine',
    description: 'Fast video generation',
    category: 'video',
    capabilities: ['text-to-video', 'image-to-video'],
    isConfigured: false,
    enabled: false,
    website: 'https://lumalabs.ai',
  },
  {
    id: 'minimax-video',
    name: 'MiniMax Video',
    description: 'High-quality video by MiniMax',
    category: 'video',
    capabilities: ['text-to-video', 'image-to-video'],
    isConfigured: false,
    enabled: false,
    website: 'https://hailuoai.com',
  },
  // Image Models
  {
    id: 'midjourney',
    name: 'Midjourney',
    description: 'High-quality artistic image generation',
    category: 'image',
    capabilities: ['text-to-image'],
    isConfigured: false,
    enabled: false,
    website: 'https://midjourney.com',
  },
  {
    id: 'dall-e-3',
    name: 'DALL·E 3',
    description: 'OpenAI image generation',
    category: 'image',
    capabilities: ['text-to-image'],
    isConfigured: false,
    enabled: false,
    website: 'https://openai.com',
  },
  {
    id: 'stable-diffusion-xl',
    name: 'Stable Diffusion XL',
    description: 'Open-source image generation',
    category: 'image',
    capabilities: ['text-to-image', 'image-to-image'],
    isConfigured: false,
    enabled: false,
    website: 'https://stability.ai',
  },
  {
    id: 'flux-pro',
    name: 'Flux Pro',
    description: 'High-quality image generation by Black Forest Labs',
    category: 'image',
    capabilities: ['text-to-image'],
    isConfigured: false,
    enabled: false,
    website: 'https://blackforestlabs.ai',
  },
  // Audio Models
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'Natural voice synthesis and cloning',
    category: 'audio',
    capabilities: ['text-to-speech', 'voice-clone'],
    isConfigured: false,
    enabled: false,
    website: 'https://elevenlabs.io',
  },
  {
    id: 'openai-tts',
    name: 'OpenAI TTS',
    description: 'High-quality text-to-speech',
    category: 'audio',
    capabilities: ['text-to-speech'],
    isConfigured: false,
    enabled: false,
    website: 'https://openai.com',
  },
  {
    id: 'openai-whisper',
    name: 'OpenAI Whisper',
    description: 'Speech recognition and transcription',
    category: 'subtitle',
    capabilities: ['speech-to-text'],
    isConfigured: false,
    enabled: false,
    website: 'https://openai.com',
  },
  // Enhance Models
  {
    id: 'topaz-video-ai',
    name: 'Topaz Video AI',
    description: 'Video upscaling and enhancement',
    category: 'enhance',
    capabilities: ['upscale'],
    isConfigured: false,
    enabled: false,
    website: 'https://topazlabs.com',
  },
  {
    id: 'real-esrgan',
    name: 'Real-ESRGAN',
    description: 'Open-source image upscaling',
    category: 'enhance',
    capabilities: ['upscale'],
    isConfigured: false,
    enabled: false,
    website: 'https://github.com/xinntao/Real-ESRGAN',
  },
];

export function ModelSettings({
  models: externalModels,
  onConfigureModel,
  onToggleModel,
  onRemoveModelConfig,
  onExportConfig,
  onImportConfig,
  onAddCustomModel,
}: ModelSettingsProps) {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Import/Export state
  const [showImportExport, setShowImportExport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importIncludeSecrets, setImportIncludeSecrets] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Custom model state
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customModelJson, setCustomModelJson] = useState('');
  const [customModelApiKey, setCustomModelApiKey] = useState('');
  const [customModelStatus, setCustomModelStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Use external models if provided, otherwise use built-in presets
  const models = externalModels && externalModels.length > 0 ? externalModels : BUILTIN_MODEL_PRESETS;

  // Group models by category
  const modelsByCategory = useMemo(() => {
    const grouped: Record<string, UIModelConfig[]> = {};
    for (const model of models) {
      if (!grouped[model.category]) {
        grouped[model.category] = [];
      }
      grouped[model.category].push(model);
    }
    return grouped;
  }, [models]);

  // Filter models
  const filteredModels = useMemo(() => {
    let filtered = selectedCategory === 'all'
      ? models
      : models.filter(m => m.category === selectedCategory);

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.name.toLowerCase().includes(query) ||
        m.description?.toLowerCase().includes(query) ||
        m.capabilities.some(c => c.toLowerCase().includes(query))
      );
    }

    // Sort: configured first, then by category, then by name
    return filtered.sort((a, b) => {
      if (a.isConfigured !== b.isConfigured) {
        return a.isConfigured ? -1 : 1;
      }
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });
  }, [models, selectedCategory, searchQuery]);

  // Available categories
  const categories = useMemo(() => {
    return ['all', ...Object.keys(modelsByCategory)];
  }, [modelsByCategory]);

  const handleStartEdit = (model: UIModelConfig) => {
    setEditingModelId(model.id);
    setApiKeyInput('');
    setBaseUrlInput(model.baseUrl || '');
  };

  const handleSaveConfig = () => {
    if (editingModelId && apiKeyInput && onConfigureModel) {
      onConfigureModel(editingModelId, apiKeyInput, baseUrlInput || undefined);
      setEditingModelId(null);
      setApiKeyInput('');
      setBaseUrlInput('');
    }
  };

  const handleCancelEdit = () => {
    setEditingModelId(null);
    setApiKeyInput('');
    setBaseUrlInput('');
  };

  // Import/Export handlers
  const handleImport = async () => {
    if (!importJson.trim() || !onImportConfig) return;
    setImportStatus(null);

    try {
      const result = await onImportConfig(importJson, {
        overwrite: importOverwrite,
        includeSecrets: importIncludeSecrets,
      });
      setImportStatus({ type: result.success ? 'success' : 'error', message: result.message });
      if (result.success) {
        setImportJson('');
        setImportOverwrite(false);
        setImportIncludeSecrets(false);
      }
    } catch (error) {
      setImportStatus({ type: 'error', message: error instanceof Error ? error.message : 'Import failed' });
    }
  };

  // Add custom model handler
  const handleAddCustomModel = async () => {
    if (!customModelJson.trim() || !onAddCustomModel) return;
    setCustomModelStatus(null);

    try {
      const result = await onAddCustomModel(customModelJson, customModelApiKey || undefined);
      setCustomModelStatus({ type: result.success ? 'success' : 'error', message: result.message });
      if (result.success) {
        setCustomModelJson('');
        setCustomModelApiKey('');
        setShowAddCustom(false);
      }
    } catch (error) {
      setCustomModelStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to add custom model' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border border-[var(--vscode-panel-border)] rounded p-3">
        <h3 className="text-[12px] font-medium mb-2">{t('settings.models.title')}</h3>
        <p className="text-[10px] text-[var(--vscode-descriptionForeground)] mb-3">
          {t('settings.models.description')}
        </p>

        {/* Search and Filter */}
        <div className="flex gap-2 mb-3">
          {/* Search */}
          <div className="flex-1 relative">
            <input
              type="text"
              className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
              placeholder={t('settings.models.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--vscode-descriptionForeground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Category Filter */}
          <select
            className="px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="all">{t('settings.models.allCategories')}</option>
            {categories.filter(c => c !== 'all').map(category => (
              <option key={category} value={category}>
                {CATEGORY_INFO[category]?.icon} {t(CATEGORY_INFO[category]?.labelKey || category)}
              </option>
            ))}
          </select>
        </div>

        {/* Model List */}
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {filteredModels.length === 0 ? (
            <div className="text-center py-4 text-[11px] text-[var(--vscode-descriptionForeground)]">
              {searchQuery ? t('settings.models.noSearchResults') : t('settings.models.noModels')}
            </div>
          ) : (
            filteredModels.map((model) => (
              <div key={model.id}>
                {/* Model Card */}
                <div
                  className={`border rounded transition-colors ${
                    model.isConfigured
                      ? 'border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
                      : 'border-dashed border-[var(--vscode-panel-border)] opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-2 p-2">
                    {/* Toggle Switch (only for configured models) */}
                    {model.isConfigured ? (
                      <button
                        onClick={() => onToggleModel?.(model.id, !model.enabled)}
                        className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
                          model.enabled
                            ? 'bg-[var(--vscode-button-background)]'
                            : 'bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]'
                        }`}
                        title={model.enabled ? t('common.disable') : t('common.enable')}
                      >
                        <span
                          className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all ${
                            model.enabled
                              ? 'left-4 bg-[var(--vscode-button-foreground)]'
                              : 'left-0.5 bg-[var(--vscode-descriptionForeground)]'
                          }`}
                        />
                      </button>
                    ) : (
                      <div className="w-8 flex-shrink-0" />
                    )}

                    {/* Icon */}
                    <span className="text-base flex-shrink-0">
                      {model.icon || CATEGORY_INFO[model.category]?.icon || '🤖'}
                    </span>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium truncate">
                        {model.name}
                      </div>
                      <div className="text-[9px] text-[var(--vscode-descriptionForeground)] truncate">
                        {model.description || model.capabilities.slice(0, 2).map(c => CAPABILITY_LABELS[c] || c).join(', ')}
                      </div>
                    </div>

                    {/* Category Badge */}
                    <span className="text-[9px] px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded flex-shrink-0">
                      {t(CATEGORY_INFO[model.category]?.labelKey || model.category)}
                    </span>

                    {/* Status Badge */}
                    {model.isConfigured ? (
                      <span className="text-[9px] px-1.5 py-0.5 bg-[var(--vscode-charts-green)]/20 text-[var(--vscode-charts-green)] rounded flex-shrink-0">
                        {t('settings.models.configured')}
                      </span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 bg-[var(--vscode-input-background)] text-[var(--vscode-descriptionForeground)] rounded flex-shrink-0">
                        {t('settings.models.notConfigured')}
                      </span>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => handleStartEdit(model)}
                        className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
                        title={model.isConfigured ? t('common.edit') : t('settings.models.configure')}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                      {model.isConfigured && (
                        <button
                          onClick={() => onRemoveModelConfig?.(model.id)}
                          className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100 text-[var(--vscode-errorForeground)]"
                          title={t('settings.models.removeConfig')}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                      {model.website && (
                        <a
                          href={model.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
                          title={t('settings.models.visitWebsite')}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Capabilities Tags */}
                  {model.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1 px-2 pb-2 pt-0">
                      {model.capabilities.map(cap => (
                        <span
                          key={cap}
                          className="text-[8px] px-1 py-0.5 bg-[var(--vscode-textBlockQuote-background)] rounded"
                        >
                          {CAPABILITY_LABELS[cap] || cap}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Edit Form (inline) */}
                {editingModelId === model.id && (
                  <div className="mt-1 p-3 border border-[var(--vscode-focusBorder)] rounded bg-[var(--vscode-input-background)]">
                    <div className="text-[11px] font-medium mb-2">
                      {model.isConfigured ? t('settings.models.editConfig') : t('settings.models.configureModel')}: {model.name}
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">
                          {t('settings.models.apiKey')} *
                          {model.isConfigured && <span className="ml-1">({t('settings.models.leaveEmptyToKeep')})</span>}
                        </label>
                        <input
                          type="password"
                          className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
                          placeholder={model.isConfigured ? '••••••••' : 'Enter API key'}
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">
                          {t('settings.models.baseUrl')} ({t('common.optional')})
                        </label>
                        <input
                          type="text"
                          className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
                          placeholder={model.baseUrl || 'Custom base URL'}
                          value={baseUrlInput}
                          onChange={(e) => setBaseUrlInput(e.target.value)}
                        />
                      </div>

                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={handleCancelEdit}
                          className="flex-1 py-1.5 text-[11px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          onClick={handleSaveConfig}
                          disabled={!apiKeyInput && !model.isConfigured}
                          className="flex-1 py-1.5 text-[11px] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t('common.save')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Summary */}
        <div className="mt-3 pt-2 border-t border-[var(--vscode-panel-border)] text-[10px] text-[var(--vscode-descriptionForeground)]">
          {t('settings.models.summary', {
            total: models.length,
            configured: models.filter(m => m.isConfigured).length,
            enabled: models.filter(m => m.enabled).length,
          })}
        </div>

        {/* Action Buttons */}
        <div className="mt-3 pt-2 border-t border-[var(--vscode-panel-border)] flex flex-wrap gap-2">
          <button
            onClick={() => setShowAddCustom(!showAddCustom)}
            className="px-2 py-1 text-[10px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors"
          >
            {showAddCustom ? t('common.cancel') : t('settings.models.addCustom')}
          </button>
          <button
            onClick={() => setShowImportExport(!showImportExport)}
            className="px-2 py-1 text-[10px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors"
          >
            {showImportExport ? t('common.cancel') : t('settings.models.importExport')}
          </button>
        </div>

        {/* Add Custom Model Form */}
        {showAddCustom && (
          <div className="mt-3 p-3 border border-[var(--vscode-focusBorder)] rounded bg-[var(--vscode-input-background)]">
            <div className="text-[11px] font-medium mb-2">{t('settings.models.addCustomModel')}</div>
            <p className="text-[9px] text-[var(--vscode-descriptionForeground)] mb-2">
              {t('settings.models.addCustomModelDesc')}
            </p>

            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">
                  {t('settings.models.modelConfig')} (JSON) *
                </label>
                <textarea
                  className="w-full px-2 py-1.5 text-[10px] font-mono bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded h-32 resize-y"
                  placeholder={`{
  "id": "my-model",
  "name": "My Custom Model",
  "category": "chat",
  "protocol": "openai-compatible",
  "baseUrl": "https://api.example.com/v1",
  ...
}`}
                  value={customModelJson}
                  onChange={(e) => setCustomModelJson(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">
                  API Key ({t('common.optional')})
                </label>
                <input
                  type="password"
                  className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
                  placeholder="Enter API key"
                  value={customModelApiKey}
                  onChange={(e) => setCustomModelApiKey(e.target.value)}
                />
              </div>

              {customModelStatus && (
                <div className={`text-[10px] p-2 rounded ${
                  customModelStatus.type === 'success'
                    ? 'bg-[var(--vscode-charts-green)]/20 text-[var(--vscode-charts-green)]'
                    : 'bg-[var(--vscode-charts-red)]/20 text-[var(--vscode-charts-red)]'
                }`}>
                  {customModelStatus.message}
                </div>
              )}

              <button
                onClick={handleAddCustomModel}
                disabled={!customModelJson.trim()}
                className="w-full py-1.5 text-[11px] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('settings.models.addModel')}
              </button>
            </div>
          </div>
        )}

        {/* Import/Export Panel */}
        {showImportExport && (
          <div className="mt-3 p-3 border border-[var(--vscode-focusBorder)] rounded bg-[var(--vscode-input-background)]">
            <div className="text-[11px] font-medium mb-2">{t('settings.models.importExportTitle')}</div>

            {/* Export Section */}
            <div className="mb-4">
              <div className="text-[10px] font-medium mb-1">{t('settings.models.export')}</div>
              <p className="text-[9px] text-[var(--vscode-descriptionForeground)] mb-2">
                {t('settings.models.exportDesc')}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => onExportConfig?.(false)}
                  className="flex-1 py-1.5 text-[10px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors"
                >
                  {t('settings.models.exportWithoutSecrets')}
                </button>
                <button
                  onClick={() => onExportConfig?.(true)}
                  className="flex-1 py-1.5 text-[10px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors text-[var(--vscode-errorForeground)]"
                >
                  {t('settings.models.exportWithSecrets')}
                </button>
              </div>
            </div>

            {/* Import Section */}
            <div>
              <div className="text-[10px] font-medium mb-1">{t('settings.models.import')}</div>
              <p className="text-[9px] text-[var(--vscode-descriptionForeground)] mb-2">
                {t('settings.models.importDesc')}
              </p>

              <textarea
                className="w-full px-2 py-1.5 text-[10px] font-mono bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded h-24 resize-y mb-2"
                placeholder={t('settings.models.importPlaceholder')}
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
              />

              <div className="flex gap-4 mb-2 text-[10px]">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={importOverwrite}
                    onChange={(e) => setImportOverwrite(e.target.checked)}
                  />
                  {t('settings.models.importOverwrite')}
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={importIncludeSecrets}
                    onChange={(e) => setImportIncludeSecrets(e.target.checked)}
                  />
                  {t('settings.models.importIncludeSecrets')}
                </label>
              </div>

              {importStatus && (
                <div className={`text-[10px] p-2 rounded mb-2 ${
                  importStatus.type === 'success'
                    ? 'bg-[var(--vscode-charts-green)]/20 text-[var(--vscode-charts-green)]'
                    : 'bg-[var(--vscode-charts-red)]/20 text-[var(--vscode-charts-red)]'
                }`}>
                  {importStatus.message}
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={!importJson.trim()}
                className="w-full py-1.5 text-[11px] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('settings.models.importConfig')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
