/**
 * AIQuickMenu - AI 快捷操作菜单
 * Floating AI button that shows quick actions for selected elements
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import type { TimelineElement } from '@uniedit/shared';
import { getActionsForElementType, type AIQuickAction } from '@uniedit/shared';
import { useTranslation } from '../../i18n/I18nContext';

export interface AIQuickMenuProps {
  /** Selected elements */
  selectedElements: Array<{ element: TimelineElement; trackId: string }>;
  /** Position for the menu button (canvas coordinates) */
  position: { x: number; y: number };
  /** Callback when an AI action is selected */
  onExecuteAction: (actionId: string, elementIds: string[]) => void;
}

/**
 * AI Quick Menu component
 */
export const AIQuickMenu = memo(function AIQuickMenu({
  selectedElements,
  position,
  onExecuteAction,
}: AIQuickMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Get available actions based on selected element types
  const availableActions = useCallback((): AIQuickAction[] => {
    if (selectedElements.length === 0) return [];

    // Get unique element types
    const types = new Set(selectedElements.map((e) => e.element.type));

    // For now, get actions for the first type
    // TODO: Get intersection of actions for all types
    const firstType = types.values().next().value;
    if (!firstType) return [];

    // Map element type to AI action type
    const typeMap: Record<string, string> = {
      media: 'video', // or 'image' based on mediaType
      text: 'text',
      audio: 'audio',
      shape: 'video', // shapes don't have specific AI actions yet
    };

    const actionType = typeMap[firstType];
    if (!actionType) return [];

    return getActionsForElementType(actionType as 'video' | 'image' | 'text' | 'audio');
  }, [selectedElements]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle action click
  const handleActionClick = useCallback(
    (actionId: string) => {
      const elementIds = selectedElements.map((e) => e.element.id);
      onExecuteAction(actionId, elementIds);
      setIsOpen(false);
    },
    [selectedElements, onExecuteAction]
  );

  const actions = availableActions();

  if (selectedElements.length === 0 || actions.length === 0) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="absolute pointer-events-auto"
      style={{
        left: position.x + 8,
        top: position.y - 16,
      }}
    >
      {/* AI Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center justify-center
          w-8 h-8 rounded-full
          bg-gradient-to-r from-purple-500 to-blue-500
          text-white text-sm font-bold
          shadow-lg hover:shadow-xl
          transition-all duration-200
          hover:scale-110
          ${isOpen ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent' : ''}
        `}
        title={t('preview.aiQuickActions')}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="
            absolute left-0 top-full mt-2
            min-w-48 py-1
            bg-vscode-dropdown-bg border border-vscode-dropdown-border
            rounded-md shadow-xl
            z-50
          "
        >
          <div className="px-3 py-2 text-xs text-vscode-description border-b border-vscode-panel-border">
            {t('preview.aiOperations')}
          </div>

          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleActionClick(action.id)}
              className="
                w-full px-3 py-2
                text-left text-sm text-vscode-fg
                hover:bg-vscode-list-hover
                flex items-center gap-2
                transition-colors
              "
            >
              <span className="text-base">{getActionIcon(action.id)}</span>
              <span>{t(action.label)}</span>
            </button>
          ))}

          <div className="border-t border-vscode-panel-border mt-1 pt-1">
            <button
              onClick={() => setIsOpen(false)}
              className="
                w-full px-3 py-2
                text-left text-sm text-vscode-description
                hover:bg-vscode-list-hover
                flex items-center gap-2
              "
            >
              <span>⋯</span>
              <span>{t('preview.moreActions')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Get icon for action type
 */
function getActionIcon(actionId: string): string {
  const icons: Record<string, string> = {
    'ai-color-correct': '🎨',
    'ai-enhance': '✨',
    'ai-crop': '✂️',
    'ai-subtitle': '📝',
    'ai-audio-enhance': '🔊',
    'ai-denoise': '🔇',
    'ai-background-remove': '🖼️',
    'ai-upscale': '📐',
  };

  return icons[actionId] || '✨';
}
