import { useState } from 'react';
import { useTranslation } from '@/i18n/I18nContext';

interface PromptTemplate {
  id: string;
  labelKey: string;
  icon: string;
  promptKey: string;
  category: 'editing' | 'generation' | 'analysis' | 'help';
}

const PROMPT_TEMPLATES: PromptTemplate[] = [
  // Help templates
  {
    id: 'subtitles',
    labelKey: 'chat.quickActions.addSubtitles',
    icon: '💬',
    promptKey: 'chat.quickActions.prompts.subtitles',
    category: 'help',
  },
  {
    id: 'shortcuts',
    labelKey: 'chat.quickActions.shortcuts',
    icon: '⌨️',
    promptKey: 'chat.quickActions.prompts.shortcuts',
    category: 'help',
  },
  {
    id: 'export',
    labelKey: 'chat.quickActions.exportVideo',
    icon: '📤',
    promptKey: 'chat.quickActions.prompts.export',
    category: 'help',
  },

  // Editing templates
  {
    id: 'trim',
    labelKey: 'chat.quickActions.trimClip',
    icon: '✂️',
    promptKey: 'chat.quickActions.prompts.trim',
    category: 'editing',
  },
  {
    id: 'transition',
    labelKey: 'chat.quickActions.addTransition',
    icon: '🔄',
    promptKey: 'chat.quickActions.prompts.transition',
    category: 'editing',
  },
  {
    id: 'speed',
    labelKey: 'chat.quickActions.changeSpeed',
    icon: '⏱️',
    promptKey: 'chat.quickActions.prompts.speed',
    category: 'editing',
  },

  // Generation templates
  {
    id: 'thumbnail',
    labelKey: 'chat.quickActions.generateThumbnail',
    icon: '🖼️',
    promptKey: 'chat.quickActions.prompts.thumbnail',
    category: 'generation',
  },
  {
    id: 'title',
    labelKey: 'chat.quickActions.suggestTitle',
    icon: '📝',
    promptKey: 'chat.quickActions.prompts.title',
    category: 'generation',
  },
  {
    id: 'description',
    labelKey: 'chat.quickActions.writeDescription',
    icon: '📄',
    promptKey: 'chat.quickActions.prompts.description',
    category: 'generation',
  },

  // Analysis templates
  {
    id: 'analyze',
    labelKey: 'chat.quickActions.analyzePacing',
    icon: '📊',
    promptKey: 'chat.quickActions.prompts.analyze',
    category: 'analysis',
  },
  {
    id: 'review',
    labelKey: 'chat.quickActions.reviewQuality',
    icon: '🔍',
    promptKey: 'chat.quickActions.prompts.review',
    category: 'analysis',
  },
];

interface Category {
  id: string;
  labelKey: string;
  icon: string;
}

const CATEGORIES: Category[] = [
  { id: 'all', labelKey: 'chat.quickActions.categories.all', icon: '✨' },
  { id: 'help', labelKey: 'chat.quickActions.categories.help', icon: '❓' },
  { id: 'editing', labelKey: 'chat.quickActions.categories.edit', icon: '✂️' },
  { id: 'generation', labelKey: 'chat.quickActions.categories.create', icon: '🎨' },
  { id: 'analysis', labelKey: 'chat.quickActions.categories.analyze', icon: '📊' },
];

interface QuickActionsProps {
  onActionSelect: (action: string) => void;
}

export function QuickActions({ onActionSelect }: QuickActionsProps) {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showAll, setShowAll] = useState(false);

  const filteredTemplates =
    selectedCategory === 'all'
      ? PROMPT_TEMPLATES
      : PROMPT_TEMPLATES.filter((t) => t.category === selectedCategory);

  const displayedTemplates = showAll ? filteredTemplates : filteredTemplates.slice(0, 6);

  return (
    <div className="px-3 pb-2 flex-shrink-0">
      {/* Category tabs */}
      <div className="flex items-center gap-1 mb-2 overflow-x-auto">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setSelectedCategory(cat.id);
              setShowAll(false);
            }}
            className={`px-2 py-0.5 text-[10px] rounded whitespace-nowrap transition-colors ${
              selectedCategory === cat.id
                ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                : 'text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)]'
            }`}
          >
            <span className="mr-1">{cat.icon}</span>
            {t(cat.labelKey)}
          </button>
        ))}
      </div>

      {/* Template buttons */}
      <div className="flex flex-wrap gap-1.5">
        {displayedTemplates.map((template) => (
          <button
            key={template.id}
            onClick={() => onActionSelect(t(template.promptKey))}
            className="px-2.5 py-1 text-[11px] border border-[var(--vscode-input-border)] rounded hover:bg-[var(--vscode-list-hoverBackground)] transition-colors flex items-center gap-1"
            title={t(template.promptKey)}
          >
            <span>{template.icon}</span>
            <span>{t(template.labelKey)}</span>
          </button>
        ))}

        {/* Show more/less button */}
        {filteredTemplates.length > 6 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-2.5 py-1 text-[11px] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] transition-colors"
          >
            {showAll
              ? t('chat.quickActions.less')
              : t('chat.quickActions.more', { count: filteredTemplates.length - 6 })}
          </button>
        )}
      </div>
    </div>
  );
}
