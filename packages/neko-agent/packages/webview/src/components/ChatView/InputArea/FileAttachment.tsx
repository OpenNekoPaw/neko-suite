/**
 * FileAttachment Components
 * Split into AttachmentPreview and AttachmentButton for proper layout
 */

import { type MessageAttachment, FILE_TYPE_ICONS } from './types';

/**
 * AttachmentPreview - Shows attached files as inline tags (inside input box)
 */
interface AttachmentPreviewProps {
  attachedFiles: MessageAttachment[];
  onRemove: (id: string) => void;
}

export function AttachmentPreview({ attachedFiles, onRemove }: AttachmentPreviewProps) {
  if (attachedFiles.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
      {attachedFiles.map((file) => (
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
