/**
 * QuickActions - Batch operation buttons for task management
 *
 * Features:
 * - Pause/Resume all tasks
 * - Cancel all active tasks
 * - Clear completed tasks
 * - Contextual button visibility
 */

import { useState } from 'react';
import { useTranslation } from '@/i18n/I18nContext';
import type { QuickActionsProps } from './types';

export function QuickActions({
  hasActiveTasks,
  hasQueuedTasks,
  hasPausedTasks,
  onPauseAll,
  onResumeAll,
  onCancelAll,
  onClearCompleted,
}: QuickActionsProps) {
  const { t } = useTranslation();
  const [showConfirm, setShowConfirm] = useState<'cancel' | 'clear' | null>(null);

  // Don't render if no actions available
  const hasAnyAction = onPauseAll || onResumeAll || onCancelAll || onClearCompleted;
  if (!hasAnyAction) return null;

  const handleCancelAll = () => {
    if (showConfirm === 'cancel') {
      onCancelAll?.();
      setShowConfirm(null);
    } else {
      setShowConfirm('cancel');
      // Auto-dismiss after 3 seconds
      setTimeout(() => setShowConfirm(null), 3000);
    }
  };

  const handleClearCompleted = () => {
    if (showConfirm === 'clear') {
      onClearCompleted?.();
      setShowConfirm(null);
    } else {
      setShowConfirm('clear');
      setTimeout(() => setShowConfirm(null), 3000);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {/* Pause All */}
      {onPauseAll && hasActiveTasks && !hasPausedTasks && (
        <ActionButton
          onClick={onPauseAll}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          label={t('agents.actions.pauseAll')}
        />
      )}

      {/* Resume All */}
      {onResumeAll && hasPausedTasks && (
        <ActionButton
          onClick={onResumeAll}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          label={t('agents.actions.resumeAll')}
          variant="primary"
        />
      )}

      {/* Cancel All */}
      {onCancelAll && (hasActiveTasks || hasQueuedTasks) && (
        <ActionButton
          onClick={handleCancelAll}
          icon={
            showConfirm === 'cancel' ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )
          }
          label={showConfirm === 'cancel' ? t('agents.actions.confirmCancel') : t('agents.actions.cancelAll')}
          variant={showConfirm === 'cancel' ? 'danger' : 'default'}
        />
      )}

      {/* Clear Completed */}
      {onClearCompleted && (
        <ActionButton
          onClick={handleClearCompleted}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          }
          label={showConfirm === 'clear' ? t('agents.actions.confirmClear') : t('agents.actions.clearCompleted')}
          variant={showConfirm === 'clear' ? 'danger' : 'default'}
        />
      )}
    </div>
  );
}

/**
 * ActionButton - Small action button with icon and optional label
 */
interface ActionButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
}

function ActionButton({
  onClick,
  icon,
  label,
  variant = 'default',
  disabled = false,
}: ActionButtonProps) {
  const variantClasses: Record<string, string> = {
    default: 'hover:bg-[var(--vscode-toolbar-hoverBackground)]',
    primary: 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]',
    danger: 'bg-[var(--vscode-inputValidation-errorBackground)] text-[var(--vscode-errorForeground)] hover:opacity-80',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
        variantClasses[variant]
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default QuickActions;
