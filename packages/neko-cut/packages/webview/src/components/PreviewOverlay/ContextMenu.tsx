/**
 * ContextMenu - 右键菜单组件
 * Shows context menu for selected elements
 */

import { memo, useCallback, useEffect, useRef } from 'react';
import type { TimelineElement } from '@uniedit/shared';
import { getActionsForElementType, type AIQuickAction } from '@uniedit/shared';
import { useTranslation } from '../../i18n/I18nContext';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  divider?: boolean;
  submenu?: ContextMenuItem[];
  onClick?: () => void;
}

export interface ContextMenuProps {
  /** Position of the menu */
  position: { x: number; y: number };
  /** Selected elements */
  selectedElements: Array<{ element: TimelineElement; trackId: string }>;
  /** Callback to close menu */
  onClose: () => void;
  /** Callback for edit operations */
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  /** Callback for AI actions */
  onExecuteAIAction?: (actionId: string, elementIds: string[]) => void;
  /** Callback for alignment */
  onAlign?: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
}

/**
 * Context menu component
 */
export const ContextMenu = memo(function ContextMenu({
  position,
  selectedElements,
  onClose,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onDuplicate,
  onExecuteAIAction,
  onAlign,
}: ContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Get AI actions for selected elements
  const getAIActions = useCallback((): AIQuickAction[] => {
    if (selectedElements.length === 0) return [];

    const types = new Set(selectedElements.map((e) => e.element.type));
    const firstType = types.values().next().value;
    if (!firstType) return [];

    const typeMap: Record<string, string> = {
      media: 'video',
      text: 'text',
      audio: 'audio',
      shape: 'video',
    };

    const actionType = typeMap[firstType];
    if (!actionType) return [];

    return getActionsForElementType(actionType as 'video' | 'image' | 'text' | 'audio');
  }, [selectedElements]);

  const handleAIAction = useCallback(
    (actionId: string) => {
      if (onExecuteAIAction) {
        const elementIds = selectedElements.map((e) => e.element.id);
        onExecuteAIAction(actionId, elementIds);
      }
      onClose();
    },
    [selectedElements, onExecuteAIAction, onClose]
  );

  const handleAlign = useCallback(
    (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
      if (onAlign) {
        onAlign(alignment);
      }
      onClose();
    },
    [onAlign, onClose]
  );

  const aiActions = getAIActions();
  const hasSelection = selectedElements.length > 0;

  // Adjust position to keep menu in viewport
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 200),
    y: Math.min(position.y, window.innerHeight - 400),
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-48 py-1 bg-vscode-dropdown-bg border border-vscode-dropdown-border rounded-md shadow-xl"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {/* Edit operations */}
      <MenuItem
        label={t('contextMenu.cut')}
        shortcut="⌘X"
        disabled={!hasSelection}
        onClick={() => {
          onCut?.();
          onClose();
        }}
      />
      <MenuItem
        label={t('contextMenu.copy')}
        shortcut="⌘C"
        disabled={!hasSelection}
        onClick={() => {
          onCopy?.();
          onClose();
        }}
      />
      <MenuItem
        label={t('contextMenu.paste')}
        shortcut="⌘V"
        onClick={() => {
          onPaste?.();
          onClose();
        }}
      />
      <MenuItem
        label={t('contextMenu.duplicate')}
        shortcut="⌘D"
        disabled={!hasSelection}
        onClick={() => {
          onDuplicate?.();
          onClose();
        }}
      />
      <MenuItem
        label={t('contextMenu.delete')}
        shortcut="⌫"
        disabled={!hasSelection}
        onClick={() => {
          onDelete?.();
          onClose();
        }}
      />

      <MenuDivider />

      {/* Alignment submenu */}
      {hasSelection && (
        <>
          <SubMenu label={t('contextMenu.align')}>
            <MenuItem
              label={t('contextMenu.alignLeft')}
              icon="⬅"
              onClick={() => handleAlign('left')}
            />
            <MenuItem
              label={t('contextMenu.alignCenter')}
              icon="↔"
              onClick={() => handleAlign('center')}
            />
            <MenuItem
              label={t('contextMenu.alignRight')}
              icon="➡"
              onClick={() => handleAlign('right')}
            />
            <MenuDivider />
            <MenuItem
              label={t('contextMenu.alignTop')}
              icon="⬆"
              onClick={() => handleAlign('top')}
            />
            <MenuItem
              label={t('contextMenu.alignMiddle')}
              icon="↕"
              onClick={() => handleAlign('middle')}
            />
            <MenuItem
              label={t('contextMenu.alignBottom')}
              icon="⬇"
              onClick={() => handleAlign('bottom')}
            />
          </SubMenu>

          <MenuDivider />
        </>
      )}

      {/* AI Actions */}
      {hasSelection && aiActions.length > 0 && (
        <SubMenu label={t('contextMenu.aiOperations')} icon="✨">
          {aiActions.map((action) => (
            <MenuItem
              key={action.id}
              label={t(action.label)}
              onClick={() => handleAIAction(action.id)}
            />
          ))}
        </SubMenu>
      )}
    </div>
  );
});

/**
 * Menu item component
 */
const MenuItem = memo(function MenuItem({
  label,
  icon,
  shortcut,
  disabled,
  onClick,
}: {
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`
        w-full px-3 py-1.5 text-left text-sm
        flex items-center justify-between gap-4
        ${
          disabled
            ? 'text-vscode-description cursor-not-allowed'
            : 'text-vscode-fg hover:bg-vscode-list-hover cursor-pointer'
        }
      `}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="flex items-center gap-2">
        {icon && <span className="w-4 text-center">{icon}</span>}
        <span>{label}</span>
      </span>
      {shortcut && (
        <span className="text-xs text-vscode-description">{shortcut}</span>
      )}
    </button>
  );
});

/**
 * Submenu component
 */
const SubMenu = memo(function SubMenu({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative group">
      <button
        className="
          w-full px-3 py-1.5 text-left text-sm
          flex items-center justify-between gap-4
          text-vscode-fg hover:bg-vscode-list-hover cursor-pointer
        "
      >
        <span className="flex items-center gap-2">
          {icon && <span className="w-4 text-center">{icon}</span>}
          <span>{label}</span>
        </span>
        <span className="text-xs">▶</span>
      </button>
      <div
        className="
          absolute left-full top-0 ml-0.5
          hidden group-hover:block
          min-w-40 py-1
          bg-vscode-dropdown-bg border border-vscode-dropdown-border
          rounded-md shadow-xl
        "
      >
        {children}
      </div>
    </div>
  );
});

/**
 * Menu divider component
 */
const MenuDivider = memo(function MenuDivider() {
  return <div className="my-1 border-t border-vscode-panel-border" />;
});
