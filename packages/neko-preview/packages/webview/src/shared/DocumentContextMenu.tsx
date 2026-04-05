/**
 * Shared right-click context menu for document preview webviews.
 *
 * Provides "Send selection to AI" and "Send page to AI" actions.
 * Used by all document viewers (PDF, CBZ, EPUB, DOCX).
 */

import { useState, useCallback, useEffect, type FC, type ReactNode } from 'react';
import { useTranslation } from '../i18n/I18nContext';

export interface ContextMenuAction {
  label: string;
  onClick: () => void;
  /** Only show when condition is true */
  when?: boolean;
}

interface DocumentContextMenuProps {
  /** Additional actions beyond the defaults */
  actions?: ContextMenuAction[];
  /** Wrap children — context menu attaches to this area */
  children: ReactNode;
}

interface MenuState {
  x: number;
  y: number;
}

export const DocumentContextMenu: FC<DocumentContextMenuProps> = ({ actions, children }) => {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 120);
    setMenu({ x, y });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  // Close on any click outside
  useEffect(() => {
    if (!menu) return;
    const handler = () => setMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [menu]);

  // Close on Escape
  useEffect(() => {
    if (!menu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [menu]);

  const visibleActions = actions?.filter((a) => a.when !== false) ?? [];

  return (
    <div onContextMenu={handleContextMenu} className="contents">
      {children}

      {menu && visibleActions.length > 0 && (
        <div
          className="fixed z-50 rounded py-1 text-xs shadow-lg"
          style={{
            left: menu.x,
            top: menu.y,
            minWidth: '160px',
            background: 'var(--vscode-menu-background, var(--vscode-sideBar-background))',
            border: '1px solid var(--vscode-menu-border, var(--vscode-panel-border))',
            color: 'var(--vscode-menu-foreground, var(--vscode-foreground))',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {visibleActions.map((action, i) => (
            <button
              key={i}
              className="block w-full px-3 py-1.5 text-left hover:opacity-80"
              style={{ background: 'transparent', color: 'inherit' }}
              onClick={() => {
                action.onClick();
                close();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Hook to create standard document context menu actions.
 */
export function useDocumentContextActions(opts: {
  hasSelection: boolean;
  onSendSelectionToAi?: () => void;
  onSendPageToAi?: () => void;
}): ContextMenuAction[] {
  const { t } = useTranslation();
  const actions: ContextMenuAction[] = [];

  if (opts.onSendSelectionToAi) {
    actions.push({
      label: t('preview.document.sendToAi'),
      onClick: opts.onSendSelectionToAi,
      when: opts.hasSelection,
    });
  }

  if (opts.onSendPageToAi) {
    actions.push({
      label: t('preview.document.sendPageToAi'),
      onClick: opts.onSendPageToAi,
    });
  }

  return actions;
}
