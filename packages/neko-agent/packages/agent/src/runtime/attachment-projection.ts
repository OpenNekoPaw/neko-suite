import { isDocumentFile, type MessageAttachment } from '@neko/shared';

export interface AgentBase64ImageAttachment {
  readonly type: 'base64';
  readonly media_type: string;
  readonly data: string;
}

export interface AgentProcessedAttachments {
  readonly textContent: string;
  readonly imageAttachments: AgentBase64ImageAttachment[];
}

export interface AgentAttachmentProjectionError {
  readonly attachment: MessageAttachment;
  readonly operation: 'read-image' | 'read-file';
  readonly error: unknown;
}

export interface AgentAttachmentProjectionDeps {
  readonly readTextFile: (path: string) => Promise<string>;
  readonly readImageFileAsBase64: (path: string) => Promise<AgentBase64ImageAttachment | null>;
  readonly onError?: (error: AgentAttachmentProjectionError) => void;
}

const DATA_URL_BASE64_RE = /^data:([^;]+);base64,(.+)$/;
const FILE_REFERENCE_RE = /\[File: [^\]]+\]\n(.+)/g;

export function parseBase64DataUrl(dataUrl: string): AgentBase64ImageAttachment | null {
  const match = dataUrl.match(DATA_URL_BASE64_RE);
  const mediaType = match?.[1];
  const data = match?.[2];
  if (!mediaType || !data) {
    return null;
  }
  return {
    type: 'base64',
    media_type: mediaType,
    data,
  };
}

export function formatFileAttachmentContent(name: string, content: string): string {
  return `\n\n### File: ${name}\n\`\`\`\n${content}\n\`\`\``;
}

export function formatUnreadableFileAttachment(name: string): string {
  return `\n\n### File: ${name}\n(Failed to read file)`;
}

export function formatMediaAttachmentReference(
  attachment: Pick<MessageAttachment, 'type' | 'name' | 'path'>,
): string {
  let text = `\n\n[Attached ${attachment.type}: ${attachment.name}]`;
  if (attachment.path) {
    text += ` (path: ${attachment.path})`;
  }
  return text;
}

export function formatDocumentAttachmentReference(name: string, path: string): string {
  return `\n\n[Attached document: ${name}] (path: ${path})\nUse ReadDocument with file_path="${path}" and mode="manifest" or mode="range" before analyzing this document. Do not inline the whole document as chat context.`;
}

export function extractFileReferencePaths(message: string): string[] {
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  FILE_REFERENCE_RE.lastIndex = 0;
  while ((match = FILE_REFERENCE_RE.exec(message)) !== null) {
    const filePath = match[1]?.trim();
    if (filePath) {
      paths.push(filePath);
    }
  }
  return paths;
}

export async function projectAgentMessageAttachments(
  attachments: readonly MessageAttachment[] | undefined,
  deps: AgentAttachmentProjectionDeps,
): Promise<AgentProcessedAttachments> {
  const imageAttachments: AgentBase64ImageAttachment[] = [];
  let textContent = '';

  if (!attachments || attachments.length === 0) {
    return { textContent, imageAttachments };
  }

  for (const attachment of attachments) {
    switch (attachment.type) {
      case 'image': {
        if (attachment.preview) {
          const preview = parseBase64DataUrl(attachment.preview);
          if (preview) {
            imageAttachments.push(preview);
          }
          break;
        }

        if (!attachment.path) {
          break;
        }

        try {
          const base64Data = await deps.readImageFileAsBase64(attachment.path);
          if (base64Data) {
            imageAttachments.push(base64Data);
          }
        } catch (error) {
          deps.onError?.({ attachment, operation: 'read-image', error });
        }
        break;
      }

      case 'file': {
        if (!attachment.path) {
          break;
        }

        if (isDocumentFile(attachment.path)) {
          textContent += formatDocumentAttachmentReference(attachment.name, attachment.path);
          break;
        }

        try {
          const content = await deps.readTextFile(attachment.path);
          textContent += formatFileAttachmentContent(attachment.name, content);
        } catch (error) {
          deps.onError?.({ attachment, operation: 'read-file', error });
          textContent += formatUnreadableFileAttachment(attachment.name);
        }
        break;
      }

      case 'video':
      case 'audio':
        textContent += formatMediaAttachmentReference(attachment);
        break;
    }
  }

  return { textContent, imageAttachments };
}
