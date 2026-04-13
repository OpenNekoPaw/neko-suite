/**
 * DiffBlock Component
 * Displays code diffs with Accept/Reject actions
 * Compact inline design following Claude Code style
 */

import { useState, useMemo, memo } from 'react';
import { computeDiff } from '@neko/shared/utils';
import { CodeDiff } from '@/components/types';
import { useTranslation } from '@/i18n/I18nContext';

interface DiffBlockProps {
  diff: CodeDiff;
  onAccept?: (filePath: string) => void;
  onReject?: (filePath: string) => void;
}

/**
 * Get file extension for language detection
 */
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    xml: 'xml',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
  };
  return langMap[ext] || 'text';
}

/**
 * Get file name from path
 */
function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

function DiffBlockComponent({ diff, onAccept, onReject }: DiffBlockProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);

  // Compute diff lines
  const diffLines = useMemo(
    () => computeDiff(diff.oldContent, diff.newContent),
    [diff.oldContent, diff.newContent],
  );

  // Stats
  const additions = diffLines.filter((l) => l.type === 'add').length;
  const deletions = diffLines.filter((l) => l.type === 'remove').length;

  // Language for syntax highlighting hint (future use)
  const _language = diff.language || getLanguageFromPath(diff.filePath);
  void _language; // Reserved for future syntax highlighting

  // Status styling
  const toneClass =
    diff.status === 'accepted' ? 'is-success' : diff.status === 'rejected' ? 'is-danger' : '';

  return (
    <div
      className={`agent-inline-card my-1 ${toneClass} ${diff.status === 'rejected' ? 'opacity-70' : ''}`}
    >
      {/* Header */}
      <div
        className="agent-inline-header flex cursor-pointer items-center gap-2 px-2 py-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand/Collapse icon */}
        <ChevronIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />

        {/* File icon */}
        <FileIcon className="w-3 h-3 text-[var(--agent-fg-secondary)]" />

        {/* File name */}
        <span className="flex-1 truncate font-mono text-[11px] text-[var(--agent-fg)]">
          {getFileName(diff.filePath)}
        </span>

        {/* Stats */}
        <span className="text-[10px] text-[var(--vscode-gitDecoration-addedResourceForeground)]">
          +{additions}
        </span>
        <span className="text-[10px] text-[var(--vscode-gitDecoration-deletedResourceForeground)]">
          -{deletions}
        </span>

        {/* Status badge */}
        {diff.status !== 'pending' && (
          <span
            className={`agent-badge ${diff.status === 'accepted' ? 'is-success' : 'is-danger'} text-[9px]`}
          >
            {diff.status === 'accepted' ? t('chat.diff.accepted') : t('chat.diff.rejected')}
          </span>
        )}
      </div>

      {/* Diff content */}
      {isExpanded && (
        <>
          <div className="max-h-[300px] overflow-auto w-full">
            <pre className="text-[11px] font-mono leading-tight w-full min-w-0">
              {diffLines.map((line, idx) => (
                <div
                  key={idx}
                  className={`flex ${
                    line.type === 'add'
                      ? 'bg-[var(--vscode-diffEditor-insertedLineBackground)]'
                      : line.type === 'remove'
                        ? 'bg-[var(--vscode-diffEditor-removedLineBackground)]'
                        : ''
                  }`}
                >
                  {/* Line numbers */}
                  <span className="w-8 select-none border-r border-[var(--agent-divider)] px-1 text-right text-[10px] text-[var(--agent-fg-secondary)]">
                    {line.oldLineNum || ''}
                  </span>
                  <span className="w-8 select-none border-r border-[var(--agent-divider)] px-1 text-right text-[10px] text-[var(--agent-fg-secondary)]">
                    {line.newLineNum || ''}
                  </span>

                  {/* Diff marker */}
                  <span
                    className={`w-4 text-center select-none ${
                      line.type === 'add'
                        ? 'text-[var(--vscode-gitDecoration-addedResourceForeground)]'
                        : line.type === 'remove'
                          ? 'text-[var(--vscode-gitDecoration-deletedResourceForeground)]'
                          : 'text-[var(--agent-fg-secondary)]'
                    }`}
                  >
                    {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                  </span>

                  {/* Content */}
                  <span
                    className={`flex-1 px-1 whitespace-pre overflow-x-auto ${
                      line.type === 'add'
                        ? 'text-[var(--vscode-gitDecoration-addedResourceForeground)]'
                        : line.type === 'remove'
                          ? 'text-[var(--vscode-gitDecoration-deletedResourceForeground)]'
                          : 'text-[var(--agent-fg)]'
                    }`}
                  >
                    {line.content}
                  </span>
                </div>
              ))}
            </pre>
          </div>

          {/* Action buttons (only for pending status) */}
          {diff.status === 'pending' && (onAccept || onReject) && (
            <div className="flex items-center gap-2 border-t border-[var(--agent-divider)] px-2 py-1.5">
              {onAccept && (
                <button
                  onClick={() => onAccept(diff.filePath)}
                  className="vscode-button flex items-center gap-1 px-2 py-0.5 text-[11px] leading-4"
                >
                  <CheckIcon className="w-3 h-3" />
                  {t('diff.accept')}
                </button>
              )}
              {onReject && (
                <button
                  onClick={() => onReject(diff.filePath)}
                  className="vscode-button vscode-button-secondary flex items-center gap-1 px-2 py-0.5 text-[11px] leading-4"
                >
                  <XIcon className="w-3 h-3" />
                  {t('diff.reject')}
                </button>
              )}
              <span className="flex-1" />
              <span className="text-[10px] text-[var(--agent-fg-secondary)]">{diff.filePath}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const DiffBlock = memo(DiffBlockComponent);

// Icons
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
