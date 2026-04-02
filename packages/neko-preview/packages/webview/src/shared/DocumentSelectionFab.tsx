/**
 * Floating Action Button shown near text selection in document previews.
 * Clicking sends the selected text/region to the AI agent panel.
 */

import { useEffect, useRef, type FC } from 'react';
import type { DocumentSelection } from './useDocumentSelection';

interface DocumentSelectionFabProps {
  /** Current text selection state */
  selection: DocumentSelection | null;
  /** Callback to send selection to AI */
  onSendToAi: () => void;
  /** Label text */
  label?: string;
}

export const DocumentSelectionFab: FC<DocumentSelectionFabProps> = ({
  selection,
  onSendToAi,
  label = 'Send to AI',
}) => {
  const fabRef = useRef<HTMLButtonElement>(null);

  // Position the FAB near the selection
  useEffect(() => {
    if (!selection?.rect || !fabRef.current) return;
    const { rect } = selection;
    const fab = fabRef.current;
    // Position above the selection, centered horizontally
    const top = Math.max(8, rect.top - 40);
    const left = Math.min(
      window.innerWidth - fab.offsetWidth - 8,
      Math.max(8, rect.left + rect.width / 2 - fab.offsetWidth / 2),
    );
    fab.style.top = `${top}px`;
    fab.style.left = `${left}px`;
  }, [selection]);

  if (!selection) return null;

  return (
    <button
      ref={fabRef}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSendToAi();
      }}
      className="fixed z-50 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg transition-all hover:scale-105"
      style={{
        backgroundColor: 'var(--vscode-button-background)',
        color: 'var(--vscode-button-foreground)',
        border: '1px solid var(--vscode-button-border, transparent)',
      }}
      title={label}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M14 1L1 8l5 2 2 5 6-14z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </button>
  );
};
