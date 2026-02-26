/**
 * PromptTemplates Component
 * 提供预定义的提示词模板，支持变量替换
 */

import { useState, useMemo } from 'react';
import { useTranslation } from '@/i18n/I18nContext';

// Template variable definition
interface TemplateVariable {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select';
  default?: string;
  options?: string[];
}

// Prompt template definition
export interface IPromptTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'editing' | 'generation' | 'analysis' | 'custom';
  prompt: string;
  variables?: TemplateVariable[];
}

// Template definitions (static structure, translations loaded dynamically)
interface TemplateDefinition {
  id: string;
  translationKey: string;
  icon: string;
  category: 'editing' | 'generation' | 'analysis' | 'custom';
  variables?: {
    name: string;
    labelKey: string;
    type: 'text' | 'number' | 'select';
    default?: string;
    optionsKey?: string; // Translation key for options object
  }[];
}

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  // Editing templates
  {
    id: 'trim-silence',
    translationKey: 'promptTemplates.templates.trimSilence',
    icon: '✂️',
    category: 'editing',
    variables: [
      { name: 'threshold', labelKey: 'promptTemplates.templates.trimSilence.threshold', type: 'number', default: '1' },
    ],
  },
  {
    id: 'auto-subtitles',
    translationKey: 'promptTemplates.templates.autoSubtitles',
    icon: '💬',
    category: 'editing',
    variables: [
      { name: 'language', labelKey: 'promptTemplates.templates.autoSubtitles.language', type: 'select', optionsKey: 'promptTemplates.templates.autoSubtitles.languages', default: 'chinese' },
      { name: 'style', labelKey: 'promptTemplates.templates.autoSubtitles.style', type: 'select', optionsKey: 'promptTemplates.templates.autoSubtitles.styles', default: 'formal' },
    ],
  },
  {
    id: 'match-cut',
    translationKey: 'promptTemplates.templates.matchCut',
    icon: '🎵',
    category: 'editing',
  },
  {
    id: 'color-correction',
    translationKey: 'promptTemplates.templates.colorCorrection',
    icon: '🎨',
    category: 'editing',
    variables: [
      { name: 'style', labelKey: 'promptTemplates.templates.colorCorrection.targetStyle', type: 'select', optionsKey: 'promptTemplates.templates.colorCorrection.styleOptions', default: 'cinematic' },
    ],
  },
  // Generation templates
  {
    id: 'generate-b-roll',
    translationKey: 'promptTemplates.templates.generateBRoll',
    icon: '🎬',
    category: 'generation',
    variables: [
      { name: 'timeRange', labelKey: 'promptTemplates.templates.generateBRoll.timeRange', type: 'text', default: '0:00-0:30' },
      { name: 'style', labelKey: 'promptTemplates.templates.generateBRoll.style', type: 'text', default: 'modern, clean' },
    ],
  },
  {
    id: 'generate-thumbnail',
    translationKey: 'promptTemplates.templates.generateThumbnail',
    icon: '🖼️',
    category: 'generation',
    variables: [
      { name: 'requirements', labelKey: 'promptTemplates.templates.generateThumbnail.requirements', type: 'text', default: 'highlight theme, vivid colors' },
    ],
  },
  {
    id: 'generate-transition',
    translationKey: 'promptTemplates.templates.generateTransition',
    icon: '🔄',
    category: 'generation',
    variables: [
      { name: 'count', labelKey: 'promptTemplates.templates.generateTransition.clipCount', type: 'number', default: '2' },
      { name: 'transitionType', labelKey: 'promptTemplates.templates.generateTransition.transitionType', type: 'select', optionsKey: 'promptTemplates.templates.generateTransition.transitionTypes', default: 'auto' },
    ],
  },
  // Analysis templates
  {
    id: 'analyze-pacing',
    translationKey: 'promptTemplates.templates.analyzePacing',
    icon: '📊',
    category: 'analysis',
  },
  {
    id: 'check-continuity',
    translationKey: 'promptTemplates.templates.checkContinuity',
    icon: '🔗',
    category: 'analysis',
  },
  {
    id: 'analyze-audio',
    translationKey: 'promptTemplates.templates.analyzeAudio',
    icon: '🔊',
    category: 'analysis',
  },
  {
    id: 'content-summary',
    translationKey: 'promptTemplates.templates.contentSummary',
    icon: '📝',
    category: 'analysis',
  },
];

// Category definition
interface Category {
  id: string;
  nameKey: string;
}

const CATEGORIES: Category[] = [
  { id: 'editing', nameKey: 'promptTemplates.categories.editing' },
  { id: 'generation', nameKey: 'promptTemplates.categories.generation' },
  { id: 'analysis', nameKey: 'promptTemplates.categories.analysis' },
  { id: 'custom', nameKey: 'promptTemplates.categories.custom' },
];

// Translated template type (built from definitions + translations)
interface TranslatedTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  icon: string;
  category: 'editing' | 'generation' | 'analysis' | 'custom';
  variables?: {
    name: string;
    label: string;
    type: 'text' | 'number' | 'select';
    default?: string;
    options?: string[];
    optionKeys?: string[];
  }[];
  _def: TemplateDefinition;
}

interface PromptTemplatesProps {
  onSelect: (prompt: string) => void;
  onClose: () => void;
}

export function PromptTemplates({ onSelect, onClose }: PromptTemplatesProps) {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TranslatedTemplate | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});

  // Build translated templates from definitions
  const templates = useMemo(() => {
    return TEMPLATE_DEFINITIONS.map(def => ({
      id: def.id,
      name: t(`${def.translationKey}.name`),
      description: t(`${def.translationKey}.description`),
      prompt: t(`${def.translationKey}.prompt`),
      icon: def.icon,
      category: def.category,
      variables: def.variables?.map(v => {
        const optionsObj = v.optionsKey ? t(v.optionsKey) as unknown as Record<string, string> : null;
        return {
          name: v.name,
          label: t(v.labelKey),
          type: v.type,
          default: v.default,
          options: optionsObj ? Object.values(optionsObj) : undefined,
          optionKeys: optionsObj ? Object.keys(optionsObj) : undefined,
        };
      }),
      _def: def, // Keep reference to original definition
    }));
  }, [t]);

  // Filter templates by category
  const filteredTemplates = useMemo(() => {
    if (!selectedCategory) {
      return templates;
    }
    return templates.filter(t => t.category === selectedCategory);
  }, [selectedCategory, templates]);

  // Handle template selection
  const handleSelectTemplate = (template: TranslatedTemplate) => {
    setSelectedTemplate(template);
    // Initialize variable defaults
    const defaults: Record<string, string> = {};
    template.variables?.forEach(v => {
      defaults[v.name] = v.default || '';
    });
    setVariables(defaults);
  };

  // Handle apply
  const handleApply = () => {
    if (!selectedTemplate) return;

    let prompt = selectedTemplate.prompt;
    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    onSelect(prompt);
    onClose();
  };

  // Get preview prompt with variable substitution
  const getPreviewPrompt = () => {
    if (!selectedTemplate) return '';
    let prompt = selectedTemplate.prompt;
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value || `{{${key}}}`);
    }
    return prompt;
  };

  return (
    <div className="absolute inset-0 z-50 bg-[var(--vscode-editor-background)] flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)] flex items-center justify-between flex-shrink-0">
        <h3 className="text-[13px] font-medium">{t('promptTemplates.title')}</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Category sidebar */}
        <div className="w-20 border-r border-[var(--vscode-panel-border)] p-1.5 flex flex-col gap-0.5 flex-shrink-0">
          <button
            className={`w-full px-2 py-1.5 text-left text-[11px] rounded transition-colors ${
              !selectedCategory
                ? 'bg-[var(--vscode-button-background)]/20 text-[var(--vscode-list-activeSelectionForeground)]'
                : 'hover:bg-[var(--vscode-list-hoverBackground)]'
            }`}
            onClick={() => {
              setSelectedCategory(null);
              setSelectedTemplate(null);
            }}
          >
            {t('promptTemplates.all')}
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`w-full px-2 py-1.5 text-left text-[11px] rounded transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-[var(--vscode-button-background)]/20 text-[var(--vscode-list-activeSelectionForeground)]'
                  : 'hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
              onClick={() => {
                setSelectedCategory(cat.id);
                setSelectedTemplate(null);
              }}
            >
              {t(cat.nameKey)}
            </button>
          ))}
        </div>

        {/* Template list or detail */}
        <div className="flex-1 overflow-y-auto p-2">
          {!selectedTemplate ? (
            // Template grid
            <div className="grid grid-cols-2 gap-2">
              {filteredTemplates.map(template => (
                <div
                  key={template.id}
                  className="p-2.5 border border-[var(--vscode-panel-border)] rounded-md hover:border-[var(--vscode-focusBorder)] cursor-pointer transition-colors"
                  onClick={() => handleSelectTemplate(template)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{template.icon}</span>
                    <span className="text-[12px] font-medium truncate">{template.name}</span>
                  </div>
                  <p className="text-[10px] text-[var(--vscode-descriptionForeground)] line-clamp-2">
                    {template.description}
                  </p>
                </div>
              ))}
              {filteredTemplates.length === 0 && (
                <div className="col-span-2 py-8 text-center text-[11px] text-[var(--vscode-descriptionForeground)]">
                  {t('promptTemplates.noTemplates')}
                </div>
              )}
            </div>
          ) : (
            // Template detail with variable editing
            <div className="p-2">
              <button
                className="text-[11px] text-[var(--vscode-textLink-foreground)] mb-3 hover:underline flex items-center gap-1"
                onClick={() => setSelectedTemplate(null)}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {t('promptTemplates.backToList')}
              </button>

              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{selectedTemplate.icon}</span>
                <h3 className="text-[14px] font-medium">{selectedTemplate.name}</h3>
              </div>

              <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-4">
                {selectedTemplate.description}
              </p>

              {/* Variable inputs */}
              {selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                <div className="space-y-3 mb-4">
                  <h4 className="text-[11px] font-medium text-[var(--vscode-descriptionForeground)] uppercase tracking-wider">
                    {t('promptTemplates.parameters')}
                  </h4>
                  {selectedTemplate.variables.map(variable => (
                    <div key={variable.name}>
                      <label className="block text-[10px] text-[var(--vscode-descriptionForeground)] mb-1">
                        {variable.label}
                      </label>
                      {variable.type === 'select' ? (
                        <select
                          value={variables[variable.name] || ''}
                          onChange={e => setVariables({ ...variables, [variable.name]: e.target.value })}
                          className="w-full bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded px-2 py-1.5 text-[11px] outline-none focus:border-[var(--vscode-focusBorder)]"
                        >
                          {variable.options?.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={variable.type}
                          value={variables[variable.name] || ''}
                          onChange={e => setVariables({ ...variables, [variable.name]: e.target.value })}
                          className="w-full bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded px-2 py-1.5 text-[11px] outline-none focus:border-[var(--vscode-focusBorder)]"
                          placeholder={variable.default}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Preview */}
              <div className="mb-4">
                <h4 className="text-[11px] font-medium text-[var(--vscode-descriptionForeground)] uppercase tracking-wider mb-1">
                  {t('promptTemplates.preview')}
                </h4>
                <div className="p-2.5 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded text-[11px] text-[var(--vscode-foreground)] whitespace-pre-wrap">
                  {getPreviewPrompt()}
                </div>
              </div>

              <button
                className="w-full py-2 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded text-[12px] font-medium transition-colors"
                onClick={handleApply}
              >
                {t('promptTemplates.useTemplate')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
