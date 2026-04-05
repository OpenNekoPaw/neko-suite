/**
 * Attachment Processor
 *
 * Handles processing of message attachments (images, files, media).
 * Automatically resizes images exceeding Claude's optimal vision dimensions.
 */

import * as fs from 'fs';
import { getLogger } from '../../base';
import { getMimeType } from '@neko/shared';
import type { MessageAttachment } from '../types';

const logger = getLogger('AttachmentProcessor');

/** Claude's optimal long-edge for vision inputs */
const VISION_MAX_LONG_EDGE = 1568;
/** Safety margin below the 5MB API limit */
const VISION_MAX_BYTES = 4 * 1024 * 1024;

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
]);

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
   * Read file as base64 for image attachments.
   * Automatically resizes if the image exceeds vision thresholds.
   */
  async readFileAsBase64(filePath: string): Promise<{
    type: 'base64';
    media_type: string;
    data: string;
  } | null> {
    try {
      const buffer = await fs.promises.readFile(filePath);
      const mimeFromExt = getMimeType(filePath);
      const mediaType = mimeFromExt !== 'application/octet-stream' ? mimeFromExt : 'image/png';

      if (IMAGE_MIMES.has(mediaType)) {
        const resized = await this.maybeResizeImage(buffer);
        if (resized) {
          return { type: 'base64', media_type: 'image/jpeg', data: resized };
        }
      }

      return { type: 'base64', media_type: mediaType, data: buffer.toString('base64') };
    } catch (err) {
      logger.error('Failed to read file as base64:', err);
      return null;
    }
  }

  /**
   * Resize image if it exceeds vision thresholds (dimension or file size).
   * Returns base64 JPEG string if resized, null if no resize needed.
   */
  private async maybeResizeImage(buffer: Buffer): Promise<string | null> {
    try {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(buffer).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      const longEdge = Math.max(w, h);

      const needsResize = longEdge > VISION_MAX_LONG_EDGE || buffer.length > VISION_MAX_BYTES;
      if (!needsResize) return null;

      const resized = await sharp(buffer)
        .resize({
          width: VISION_MAX_LONG_EDGE,
          height: VISION_MAX_LONG_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      logger.info(`Resized image: ${w}x${h} (${buffer.length}B) → ${resized.length}B`);
      return resized.toString('base64');
    } catch (err) {
      logger.warn('Image resize failed, using original:', err);
      return null;
    }
  }
}
