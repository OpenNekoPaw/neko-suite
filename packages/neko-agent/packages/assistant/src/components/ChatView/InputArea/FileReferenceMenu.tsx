/**
 * FileReferenceMenu Component
 * Autocomplete menu for @ file references with line range support
 * Supports formats: @file, @file:10, @file:10-20, @file:L10-L20
 */

import { useRef } from 'react';
import { ProjectFile } from './types';
import { useClickOutsideSingle } from './useClickOutside';
import { useTranslation } from '@/i18n/I18nContext';

/**
 * Parse file reference with optional line range
 * Supports: @file, @file:10, @file:10-20, @file:L10, @file:L10-L20, @file:L10-20
 */
export interface FileReference {
  file: string;
  startLine?: number;
  endLine?: number;
}

export function parseFileReference(input: string): FileReference | null {
  // Match @file:L10-L20 or @file:10-20 formats
  const match = input.match(/^([^:\s]+)(?::L?(\d+)(?:-L?(\d+))?)?$/);
  if (!match) return null;

  return {
    file: match[1] || '',
    startLine: match[2] ? parseInt(match[2], 10) : undefined,
    endLine: match[3] ? parseInt(match[3], 10) : undefined,
  };
}

/**
 * Format file reference back to string
 */
export function formatFileReference(ref: FileReference): string {
  if (ref.startLine !== undefined && ref.endLine !== undefined) {
    return `${ref.file}:${ref.startLine}-${ref.endLine}`;
  }
  if (ref.startLine !== undefined) {
    return `${ref.file}:${ref.startLine}`;
  }
  return ref.file;
}

interface FileReferenceMenuProps {
  isOpen: boolean;
  filter: string;
  files: ProjectFile[];
  selectedIndex: number;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export function FileReferenceMenu({
  isOpen,
  filter,
  files,
  selectedIndex,
  onSelect,
  onClose,
}: FileReferenceMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, onClose);

  // Parse filter to separate file path and line range
  const parsed = parseFileReference(filter);
  const fileFilter = parsed?.file || filter;
  const hasLineRange = parsed && (parsed.startLine !== undefined);

  const filteredFiles = files
    .filter(file =>
      file.path.toLowerCase().includes(fileFilter.toLowerCase()) ||
      file.name.toLowerCase().includes(fileFilter.toLowerCase())
    )
    .slice(0, 15);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 mb-1 w-full bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg max-h-[240px] overflow-y-auto py-1 z-50"
    >
      {/* Header with hint */}
      <div className="px-3 py-1 text-[10px] text-[var(--vscode-descriptionForeground)] border-b border-[var(--vscode-dropdown-border)]">
        {filter ? (
          <>
            {t('chat.input.filesFound', { filter: fileFilter, count: filteredFiles.length })}
            {hasLineRange && (
              <span className="ml-1 text-[var(--vscode-textLink-foreground)]">
                (L{parsed?.startLine}{parsed?.endLine ? `-${parsed.endLine}` : ''})
              </span>
            )}
          </>
        ) : (
          t('chat.input.fileSearchHint')
        )}
      </div>

      {/* Line range hint */}
      {filteredFiles.length > 0 && !hasLineRange && (
        <div className="px-3 py-1 text-[9px] text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-textBlockQuote-background)]">
          💡 {t('chat.input.lineRangeHint', { defaultValue: 'Tip: Use :10-20 for line range (e.g., file.ts:10-20)' })}
        </div>
      )}

      {filteredFiles.length > 0 ? (
        filteredFiles.map((file, index) => (
          <button
            key={file.path}
            onClick={() => onSelect(hasLineRange ? formatFileReference({ ...parsed!, file: file.path }) : file.path)}
            className={`w-full px-3 py-1 text-left text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors truncate ${
              index === selectedIndex ? 'bg-[var(--vscode-list-hoverBackground)]' : ''
            }`}
          >
            <span>{file.path}</span>
            {hasLineRange && (
              <span className="ml-1 text-[var(--vscode-textLink-foreground)]">
                :{parsed?.startLine}{parsed?.endLine ? `-${parsed.endLine}` : ''}
              </span>
            )}
          </button>
        ))
      ) : filter ? (
        <div className="px-3 py-2 text-[10px] text-[var(--vscode-descriptionForeground)]">
          {t('chat.input.noMatchingFiles')}
        </div>
      ) : (
        <div className="px-3 py-2 text-[10px] text-[var(--vscode-descriptionForeground)]">
          {t('chat.input.startTypingToSearch')}
        </div>
      )}
    </div>
  );
}

// Export filtered files helper
export function getFilteredFiles(files: ProjectFile[], filter: string): ProjectFile[] {
  // Parse filter to extract file part (before colon)
  const parsed = parseFileReference(filter);
  const fileFilter = parsed?.file || filter;

  return files
    .filter(file =>
      file.path.toLowerCase().includes(fileFilter.toLowerCase()) ||
      file.name.toLowerCase().includes(fileFilter.toLowerCase())
    )
    .slice(0, 15);
}
