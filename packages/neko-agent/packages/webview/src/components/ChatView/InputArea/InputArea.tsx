/**
 * InputArea Component
 * Codex-style design with inline action buttons
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { ModelSelector } from './ModelSelector';
import { ModeSelector } from './ModeSelector';
import { PromptModeToggle } from './PromptModeToggle';
import { AttachmentPreview } from './FileAttachment';
import { SlashCommandMenu, getFilteredCommands } from './SlashCommandMenu';
import { FileReferenceMenu, getFilteredFiles, parseFileReference } from './FileReferenceMenu';
import { AttachedFile, ProjectFile, SlashCommand } from './types';
import { UsageIndicator } from './UsageIndicator';
import { useTranslation } from '@/i18n/I18nContext';
import type { QueuedMessage } from '@/hooks/useMessageQueue';
import { useInputHistory } from '@/hooks/useInputHistory';
import { useInputAreaContext } from '@/components/ChatView/InputAreaContext';

interface InputAreaProps {
  inputValue: string;
  isThinking: boolean;
  projectFiles?: ProjectFile[];
  droppedFiles?: AttachedFile[];
  onDroppedFilesProcessed?: () => void;
  onInputChange: (value: string) => void;
  onSend: (attachments?: AttachedFile[]) => void;
  onCancel?: () => void;
  /** Queued messages for preview */
  queuedMessages?: QueuedMessage[];
  /** Remove a queued message */
  onRemoveQueuedMessage?: (id: string) => void;
  /** Clear all queued messages */
  onClearQueue?: () => void;
  /** Session-bound attached files (managed by parent for conversation isolation) */
  attachedFiles?: AttachedFile[];
  /** Callback to update attached files (when managed externally) */
  onAttachedFilesChange?: (files: AttachedFile[]) => void;
}

export function InputArea({
  inputValue,
  isThinking,
  projectFiles = [],
  droppedFiles,
  onDroppedFilesProcessed,
  onInputChange,
  onSend,
  onCancel,
  queuedMessages = [],
  onRemoveQueuedMessage,
  onClearQueue,
  attachedFiles: externalAttachedFiles,
  onAttachedFilesChange,
}: InputAreaProps) {
  // Global configuration from context (model, modes, compression, skills)
  const {
    selectedModel, availableModels, onModelSelect,
    executionMode, onExecutionModeChange,
    promptMode, onPromptModeChange,
    contextTokenCount, isCompressing, onCompressContext,
    skills, onSlashCommand, onRequestFiles,
  } = useInputAreaContext();
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Input history for arrow key navigation
  const {
    addToHistory,
    navigateUp,
    navigateDown,
    resetNavigation,
    isNavigating,
  } = useInputHistory();

  // Slash command state
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  // File reference state
  const [showAtMenu, setShowAtMenu] = useState(false);
  const [atFilter, setAtFilter] = useState('');
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

  // Attached files - use external state if provided (for conversation isolation)
  const [internalAttachedFiles, setInternalAttachedFiles] = useState<AttachedFile[]>([]);
  const attachedFiles = externalAttachedFiles ?? internalAttachedFiles;

  // Create a unified setter that works with both internal state and external callback
  const updateAttachedFiles = useCallback((updater: AttachedFile[] | ((prev: AttachedFile[]) => AttachedFile[])) => {
    if (onAttachedFilesChange) {
      // External management: resolve the updater function with current value
      const newValue = typeof updater === 'function'
        ? updater(externalAttachedFiles ?? [])
        : updater;
      onAttachedFilesChange(newValue);
    } else {
      // Internal state: use React's setState directly
      setInternalAttachedFiles(updater);
    }
  }, [onAttachedFilesChange, externalAttachedFiles]);

  // Handle externally dropped files
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      updateAttachedFiles(prev => [...prev, ...droppedFiles]);
      onDroppedFilesProcessed?.();
    }
  }, [droppedFiles, onDroppedFilesProcessed, updateAttachedFiles]);

  // Filtered data
  const filteredCommands = getFilteredCommands(slashFilter, skills);
  const filteredFiles = getFilteredFiles(projectFiles, atFilter);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    onInputChange(value);

    // Reset history navigation when user types
    if (!isNavigating) {
      // Only reset if not currently navigating (to avoid resetting on arrow key changes)
    } else {
      resetNavigation();
    }

    // Check for slash command
    if (value.startsWith('/')) {
      const filter = value.slice(1).split(' ')[0];
      setSlashFilter(filter);
      setShowSlashMenu(true);
      setSelectedCommandIndex(0);
    } else {
      setShowSlashMenu(false);
    }

    // Check for @ mention with line range support
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1 && (lastAtIndex === 0 || value[lastAtIndex - 1] === ' ')) {
      const afterAt = value.slice(lastAtIndex + 1);
      if (!afterAt.includes(' ')) {
        setAtFilter(afterAt);
        setShowAtMenu(true);
        setSelectedFileIndex(0);
        const parsed = parseFileReference(afterAt);
        onRequestFiles?.(parsed?.file || afterAt);
      } else {
        setShowAtMenu(false);
      }
    } else {
      setShowAtMenu(false);
    }

    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ignore key events during IME composition (e.g., Chinese/Japanese input)
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }

    // Slash menu navigation
    if (showSlashMenu && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex(prev => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        selectSlashCommand(filteredCommands[selectedCommandIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
    }

    // @ menu navigation
    if (showAtMenu && filteredFiles.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedFileIndex(prev => (prev + 1) % filteredFiles.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedFileIndex(prev => (prev - 1 + filteredFiles.length) % filteredFiles.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        insertFilePath(filteredFiles[selectedFileIndex].path);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAtMenu(false);
        return;
      }
    }

    // Input history navigation (when no menus are open)
    if (!showSlashMenu && !showAtMenu) {
      if (e.key === 'ArrowUp') {
        // Only trigger when cursor is at the first line
        const cursorPosition = textareaRef.current?.selectionStart ?? 0;
        const textBeforeCursor = inputValue.slice(0, cursorPosition);
        if (!textBeforeCursor.includes('\n')) {
          const prevInput = navigateUp(inputValue);
          if (prevInput !== null) {
            e.preventDefault();
            onInputChange(prevInput);
            // Move cursor to end after state update
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.selectionStart = prevInput.length;
                textareaRef.current.selectionEnd = prevInput.length;
              }
            }, 0);
            return;
          }
        }
      }
      if (e.key === 'ArrowDown') {
        // Only trigger when cursor is at the last line
        const cursorPosition = textareaRef.current?.selectionStart ?? 0;
        const textAfterCursor = inputValue.slice(cursorPosition);
        if (!textAfterCursor.includes('\n')) {
          const nextInput = navigateDown();
          if (nextInput !== null) {
            e.preventDefault();
            onInputChange(nextInput);
            // Move cursor to end after state update
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.selectionStart = nextInput.length;
                textareaRef.current.selectionEnd = nextInput.length;
              }
            }, 0);
            return;
          }
        }
      }
    }

    // Normal send
    if (e.key === 'Enter' && !e.shiftKey && !showSlashMenu && !showAtMenu) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectSlashCommand = (command: SlashCommand) => {
    setShowSlashMenu(false);
    onInputChange(command.name + ' ');
    onSlashCommand?.(command);
    textareaRef.current?.focus();
  };

  const insertFilePath = (pathWithRange: string) => {
    const lastAtIndex = inputValue.lastIndexOf('@');
    const newValue = inputValue.slice(0, lastAtIndex) + '@' + pathWithRange + ' ';
    onInputChange(newValue);
    setShowAtMenu(false);
    textareaRef.current?.focus();
  };

  const handleSend = () => {
    if (!inputValue.trim() && attachedFiles.length === 0) return;
    // Add to history before sending
    if (inputValue.trim()) {
      addToHistory(inputValue);
    }
    onSend(attachedFiles.length > 0 ? attachedFiles : undefined);
    updateAttachedFiles([]);
  };

  const handleRemoveFile = (id: string) => {
    updateAttachedFiles(files => files.filter(f => f.id !== id));
  };

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const type = file.type.startsWith('image/') ? 'image' :
                     file.type.startsWith('video/') ? 'video' :
                     file.type.startsWith('audio/') ? 'audio' : 'file';
        const newFile: AttachedFile = {
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          type,
          size: file.size,
          preview: type === 'image' ? event.target?.result as string : undefined,
          path: file.name,
        };
        updateAttachedFiles(prev => [...prev, newFile]);
      };
      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsArrayBuffer(file);
        const newFile: AttachedFile = {
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          type: file.type.startsWith('video/') ? 'video' :
                file.type.startsWith('audio/') ? 'audio' : 'file',
          size: file.size,
          path: file.name,
        };
        updateAttachedFiles(prev => [...prev, newFile]);
      }
    });

    // Reset input
    e.target.value = '';
  }, [updateAttachedFiles]);

  // Handle paste for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const newFile: AttachedFile = {
              id: `paste-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              name: `pasted-image-${Date.now()}.png`,
              type: 'image',
              size: file.size,
              preview: event.target?.result as string,
            };
            updateAttachedFiles(files => [...files, newFile]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  }, [updateAttachedFiles]);

  // Insert slash command
  const handleSlashClick = () => {
    onInputChange('/');
    setShowSlashMenu(true);
    setSlashFilter('');
    textareaRef.current?.focus();
  };

  const canSend = inputValue.trim() || attachedFiles.length > 0;

  return (
    <div className="border-t border-[var(--vscode-panel-border)] p-3 flex-shrink-0">
      {/* Queued messages preview */}
      {queuedMessages.length > 0 && (
        <div className="mb-2 space-y-1">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs text-[var(--vscode-descriptionForeground)]">
              {t('chat.input.queuedMessages', { count: queuedMessages.length })}
            </span>
            <button
              onClick={onClearQueue}
              className="text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] transition-colors"
            >
              {t('chat.input.clearAll')}
            </button>
          </div>
          {queuedMessages.map((msg) => (
            <div
              key={msg.id}
              className="flex items-start gap-2 px-3 py-2 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--vscode-foreground)] truncate">
                  {msg.content}
                </p>
                {msg.attachments && msg.attachments.length > 0 && (
                  <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                    +{msg.attachments.length} {t('chat.input.attachments')}
                  </span>
                )}
              </div>
              <button
                onClick={() => onRemoveQueuedMessage?.(msg.id)}
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] transition-colors"
                title={t('chat.input.removeQueued')}
              >
                <CloseIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main input container - Codex style */}
      <div className="relative bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded-xl focus-within:border-[var(--vscode-focusBorder)] transition-colors">
        {/* Slash command menu */}
        <SlashCommandMenu
          isOpen={showSlashMenu}
          filter={slashFilter}
          selectedIndex={selectedCommandIndex}
          onSelect={selectSlashCommand}
          onClose={() => setShowSlashMenu(false)}
          skills={skills}
        />

        {/* File reference menu */}
        <FileReferenceMenu
          isOpen={showAtMenu}
          filter={atFilter}
          files={projectFiles}
          selectedIndex={selectedFileIndex}
          onSelect={insertFilePath}
          onClose={() => setShowAtMenu(false)}
        />

        {/* File attachment preview */}
        <AttachmentPreview
          attachedFiles={attachedFiles}
          onRemove={handleRemoveFile}
        />

        {/* Input row with inline buttons */}
        <div className="flex items-end gap-1 px-2 py-2">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isThinking && queuedMessages.length > 0
              ? t('chat.input.queuePlaceholder', { count: queuedMessages.length })
              : isThinking
                ? t('chat.input.thinkingPlaceholder')
                : t('chat.input.placeholder')}
            className="flex-1 px-2 py-1.5 bg-transparent text-[var(--vscode-foreground)] resize-none outline-none text-[13px] min-h-[32px] max-h-[120px] placeholder:text-[var(--vscode-descriptionForeground)]"
            rows={1}
          />

          {/* Send/Cancel button - Codex style circular */}
          {isThinking ? (
            <button
              onClick={onCancel}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--vscode-errorForeground)] text-white hover:opacity-90 transition-opacity"
              title={t('chat.input.cancel')}
            >
              <StopIcon className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all ${
                canSend
                  ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]'
                  : 'bg-[var(--vscode-input-background)] text-[var(--vscode-descriptionForeground)] opacity-50 cursor-not-allowed'
              }`}
              title={t('chat.input.send')}
            >
              <SendIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Bottom action bar */}
        <div className="flex items-center justify-between px-2 pb-2 border-t border-[var(--vscode-panel-border)] border-opacity-30">
          {/* Left actions */}
          <div className="flex items-center gap-0.5">
            {/* Attachment button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center w-7 h-7 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded-md transition-colors"
              title={t('chat.input.attach')}
            >
              <PlusIcon className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.go,.rs,.java,.c,.cpp,.h,.hpp,.css,.html,.xml,.yaml,.yml,.toml"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Slash command button */}
            <button
              onClick={handleSlashClick}
              className="flex items-center justify-center w-7 h-7 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded-md transition-colors font-medium text-[13px]"
              title="Commands"
            >
              /
            </button>

            {/* Divider */}
            <div className="w-px h-4 bg-[var(--vscode-panel-border)] mx-1" />

            {/* Model selector */}
            <ModelSelector
              selectedModel={selectedModel}
              models={availableModels}
              onSelect={onModelSelect}
            />
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-0.5">
            {/* Usage indicator */}
            <UsageIndicator
              tokenCount={contextTokenCount}
              isCompressing={isCompressing}
              onCompress={onCompressContext}
            />

            {/* Divider (only show if token count is significant) */}
            {contextTokenCount >= 100 && (
              <div className="w-px h-4 bg-[var(--vscode-panel-border)] mx-1" />
            )}

            {/* Prompt mode toggle */}
            <PromptModeToggle
              mode={promptMode}
              onChange={onPromptModeChange}
            />

            {/* Mode selector */}
            <ModeSelector
              mode={executionMode}
              onChange={onExecutionModeChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Icons
function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export type { AttachedFile, ProjectFile };
