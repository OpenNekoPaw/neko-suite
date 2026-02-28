/**
 * Attachment Processor
 *
 * Handles processing of message attachments (images, files, media).
 * Extracted from MessageHandler for single responsibility.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../base';
import type { MessageAttachment } from '../types';

const logger = getLogger('AttachmentProcessor');

/**
 * Processed attachment result
 */
export interface ProcessedAttachments {
  textContent: string;
  imageAttachments: Array<{ type: 'base64'; media_type: string; data: string }>;
}

/**
 * Processor for message attachments
 */
export class AttachmentProcessor {
  /**
   * Process attachments - extract text content and image data
   */
  async processAttachments(attachments?: MessageAttachment[]): Promise<ProcessedAttachments> {
    const imageAttachments: ProcessedAttachments['imageAttachments'] = [];
    let textContent = '';

    if (!attachments || attachments.length === 0) {
      return { textContent, imageAttachments };
    }

    for (const attachment of attachments) {
      switch (attachment.type) {
        case 'image':
          // For images, extract base64 data for multimodal AI
          if (attachment.preview) {
            // Preview is already base64 data URL
            const match = attachment.preview.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              imageAttachments.push({
                type: 'base64',
                media_type: match[1],
                data: match[2],
              });
            }
          } else if (attachment.path) {
            // Read from file path
            try {
              const base64Data = await this.readFileAsBase64(attachment.path);
              if (base64Data) {
                imageAttachments.push(base64Data);
              }
            } catch (err) {
              logger.error('Failed to read image attachment:', err);
            }
          }
          break;

        case 'file':
          // For text files, read content and append to message
          if (attachment.path) {
            try {
              const content = await fs.promises.readFile(attachment.path, 'utf-8');
              textContent += `\n\n### File: ${attachment.name}\n\`\`\`\n${content}\n\`\`\``;
            } catch (err) {
              logger.error('Failed to read file attachment:', err);
              textContent += `\n\n### File: ${attachment.name}\n(Failed to read file)`;
            }
          }
          break;

        case 'video':
        case 'audio':
          // For media files, just note the reference
          textContent += `\n\n[Attached ${attachment.type}: ${attachment.name}]`;
          if (attachment.path) {
            textContent += ` (path: ${attachment.path})`;
          }
          break;
      }
    }

    return { textContent, imageAttachments };
  }

  /**
   * Read file as base64 for image attachments
   */
  async readFileAsBase64(filePath: string): Promise<{
    type: 'base64';
    media_type: string;
    data: string;
  } | null> {
    try {
      const buffer = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
      };
      const mediaType = mimeTypes[ext] || 'image/png';
      return {
        type: 'base64',
        media_type: mediaType,
        data: buffer.toString('base64'),
      };
    } catch (err) {
      logger.error('Failed to read file as base64:', err);
      return null;
    }
  }
}
