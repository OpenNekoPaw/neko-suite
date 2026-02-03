/**
 * PromptModeToggle Component
 * Toggle between default and plan mode for system prompts
 */

import { useTranslation } from '@/i18n/I18nContext';
import type { PromptMode } from '@/components/types';

interface PromptModeToggleProps {
  mode: PromptMode;
  onChange: (mode: PromptMode) => void;
}

export function PromptModeToggle({ mode, onChange }: PromptModeToggleProps) {
  const { t } = useTranslation();
  const isPlanMode = mode === 'plan';

  const handleToggle = () => {
    onChange(isPlanMode ? 'default' : 'plan');
  };

  return (
    <button
      onClick={handleToggle}
      className={`flex items-center gap-1.5 px-2 py-1 text-[11px] rounded transition-colors ${
        isPlanMode
          ? 'bg-[var(--vscode-inputValidation-warningBackground)] text-[var(--vscode-inputValidation-warningForeground)] border border-[var(--vscode-inputValidation-warningBorder)]'
          : 'text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]'
      }`}
      title={isPlanMode ? t('chat.promptMode.planActive') : t('chat.promptMode.switchToPlan')}
    >
      {/* Plan icon */}
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
      <span>{isPlanMode ? t('chat.promptMode.plan') : t('chat.promptMode.default')}</span>
    </button>
  );
}
