import type { AttachmentType, MessageAttachment } from '@neko/shared';

export type MessageAttachmentPreviewKind = 'image' | 'audio' | 'video' | 'file';

export interface MessageAttachmentProjection {
  attachment: MessageAttachment;
  previewKind: MessageAttachmentPreviewKind;
  icon: string;
  name: string;
  previewSrc: string | null;
  sizeLabel: string | null;
  showSize: boolean;
}

export function projectMessageAttachment(
  attachment: MessageAttachment,
): MessageAttachmentProjection {
  return {
    attachment,
    previewKind: toAttachmentPreviewKind(attachment),
    icon: toAttachmentIcon(attachment.type),
    name: attachment.name,
    previewSrc: attachment.preview ?? null,
    sizeLabel: formatAttachmentSize(attachment.size),
    showSize: attachment.size !== undefined && attachment.size > 0,
  };
}

export function projectMessageAttachments(
  attachments: readonly MessageAttachment[] | undefined,
): MessageAttachmentProjection[] {
  return attachments?.map(projectMessageAttachment) ?? [];
}

export function formatAttachmentSize(bytes: number | undefined): string | null {
  if (bytes === undefined || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toAttachmentPreviewKind(attachment: MessageAttachment): MessageAttachmentPreviewKind {
  if (attachment.preview && attachment.type === 'image') return 'image';
  if (attachment.preview && attachment.type === 'audio') return 'audio';
  if (attachment.preview && attachment.type === 'video') return 'video';
  return 'file';
}

function toAttachmentIcon(type: AttachmentType): string {
  switch (type) {
    case 'file':
      return '📄';
    case 'image':
      return '🖼️';
    case 'video':
      return '🎥';
    case 'audio':
      return '🎵';
  }
}
