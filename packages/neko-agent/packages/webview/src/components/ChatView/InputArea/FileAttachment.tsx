/**
 * FileAttachment Components
 * Split into AttachmentPreview and AttachmentButton for proper layout
 */

import { useRef, useCallback } from 'react';
import { AttachedFile, getFileTypeFromMime, FILE_TYPE_ICONS } from './types';
import { useTranslation } from '@/i18n/I18nContext';

/**
 * AttachmentPreview - Shows attached files as inline tags (inside input box)
 */
interface AttachmentPreviewProps {
  attachedFiles: AttachedFile[];
  onRemove: (id: string) => void;
}

export function AttachmentPreview({ attachedFiles, onRemove }: AttachmentPreviewProps) {
  if (attachedFiles.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
      {attachedFiles.map(file => (
        <div
          key={file.id}
          className="group flex items-center gap-1 px-2 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded text-[11px]"
        >
          {file.type === 'image' && file.preview ? (
            <img src={file.preview} alt={file.name} className="w-4 h-4 object-cover rounded" />
          ) : (
            <span className="text-[10px]">{FILE_TYPE_ICONS[file.type]}</span>
          )}
          <span className="max-w-[120px] truncate">{file.name}</span>
          <button
            onClick={() => onRemove(file.id)}
            className="ml-0.5 text-[var(--vscode-badge-foreground)] hover:text-[var(--vscode-errorForeground)] transition-colors"
          >
            ×
          </button>
        </div>
      ))}
      <span className="text-[var(--vscode-descriptionForeground)] text-[11px]">+</span>
    </div>
  );
}

/**
 * AttachmentButton - Upload button for toolbar
 */
interface AttachmentButtonProps {
  onFilesAdd: (files: AttachedFile[]) => void;
}

export function AttachmentButton({ onFilesAdd }: AttachmentButtonProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: AttachedFile[] = [];

    Array.from(files).forEach(file => {
      const fileType = getFileTypeFromMime(file.type);
      const newFile: AttachedFile = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        type: fileType,
        size: file.size,
      };

      if (fileType === 'image') {
        const reader = new FileReader();
        reader.onload = (e) => {
          newFile.preview = e.target?.result as string;
          onFilesAdd([newFile]);
        };
        reader.readAsDataURL(file);
      } else {
        newFiles.push(newFile);
      }
    });

    if (newFiles.length > 0) {
      onFilesAdd(newFiles);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onFilesAdd]);

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <button
        onClick={openFileDialog}
        className="flex items-center justify-center w-7 h-7 text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-colors"
        title={t('chat.input.attachFile')}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        accept="*/*"
      />
    </>
  );
}

/**
 * FileAttachment - Legacy combined component for backward compatibility
 * @deprecated Use AttachmentPreview and AttachmentButton separately
 */
interface FileAttachmentProps {
  attachedFiles: AttachedFile[];
  onFilesChange: (files: AttachedFile[]) => void;
}

export function FileAttachment({ attachedFiles, onFilesChange }: FileAttachmentProps) {
  const handleRemove = (id: string) => {
    onFilesChange(attachedFiles.filter(f => f.id !== id));
  };

  const handleFilesAdd = (newFiles: AttachedFile[]) => {
    onFilesChange([...attachedFiles, ...newFiles]);
  };

  return (
    <>
      <AttachmentPreview attachedFiles={attachedFiles} onRemove={handleRemove} />
      <AttachmentButton onFilesAdd={handleFilesAdd} />
    </>
  );
}
