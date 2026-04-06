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
  /** Externally controlled menu position (e.g. from iframe events) */
  externalMenuPosition?: { x: number; y: number } | null;
  /** Called when external menu is consumed */
  onExternalMenuConsumed?: () => void;
  /** Called with the native contextmenu event target (for image detection etc.) */
  onContextMenuTarget?: (target: HTMLElement) => void;
}

interface MenuState {
  x: number;
  y: number;
}

export const DocumentContextMenu: FC<DocumentContextMenuProps> = ({
  actions,
  children,
  externalMenuPosition,
  onExternalMenuConsumed,
  onContextMenuTarget,
}) => {
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Handle externally triggered menu (e.g. from iframe contextmenu)
  useEffect(() => {
    if (externalMenuPosition) {
      setMenu(externalMenuPosition);
      onExternalMenuConsumed?.();
    }
  }, [externalMenuPosition, onExternalMenuConsumed]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onContextMenuTarget?.(e.target as HTMLElement);
      const x = Math.min(e.clientX, window.innerWidth - 180);
      const y = Math.min(e.clientY, window.innerHeight - 120);
      setMenu({ x, y });
    },
    [onContextMenuTarget],
  );

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
  /** Whether there is content to send (text selection or image) */
  hasContent: boolean;
  /** Send content (selected text or right-clicked image) to agent */
  onSendContentToAgent?: () => void;
  /** Send entire file/page to agent */
  onSendFileToAgent?: () => void;
}): ContextMenuAction[] {
  const { t } = useTranslation();
  const actions: ContextMenuAction[] = [];

  if (opts.onSendContentToAgent) {
    actions.push({
      label: t('preview.document.sendContentToAgent'),
      onClick: opts.onSendContentToAgent,
      when: opts.hasContent,
    });
  }

  if (opts.onSendFileToAgent) {
    actions.push({
      label: t('preview.document.sendFileToAgent'),
      onClick: opts.onSendFileToAgent,
    });
  }

  return actions;
}
