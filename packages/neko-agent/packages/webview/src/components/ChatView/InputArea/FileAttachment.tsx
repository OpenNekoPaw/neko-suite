/**
 * FileAttachment Components
 * Split into AttachmentPreview and AttachmentButton for proper layout
 */

import type { MessageAttachment } from './types';
import {
  projectMessageAttachments,
  type MessageAttachmentProjection,
} from '@/presenters/message-attachment-presenter';

/**
 * AttachmentPreview - Shows attached files as inline tags (inside input box)
 */
interface AttachmentPreviewProps {
  attachedFiles: MessageAttachment[];
  onRemove: (id: string) => void;
}

export function AttachmentPreview({ attachedFiles, onRemove }: AttachmentPreviewProps) {
  if (attachedFiles.length === 0) return null;
  const attachmentProjections = projectMessageAttachments(attachedFiles);

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
      {attachmentProjections.map((projection) => (
        <div
          key={projection.attachment.id}
          className="group flex items-center gap-1 px-2 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded text-[11px]"
        >
          <AttachmentPreviewIcon projection={projection} />
          <span className="max-w-[120px] truncate">{projection.name}</span>
          <button
            onClick={() => onRemove(projection.attachment.id)}
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

function AttachmentPreviewIcon({ projection }: { projection: MessageAttachmentProjection }) {
  if (projection.previewKind === 'image' && projection.previewSrc) {
    return (
      <img
        src={projection.previewSrc}
        alt={projection.name}
        className="w-4 h-4 object-cover rounded"
      />
    );
  }

  return <span className="text-[10px]">{projection.icon}</span>;
}
