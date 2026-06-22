/**
 * Attachment Processor
 *
 * Extension-host bridge for attachment projection.
 */

import * as fs from 'fs';
import { getLogger } from '../../base';
import {
  projectAgentMessageAttachments,
  type AgentBase64ImageAttachment,
  type AgentProcessedAttachments,
} from '@neko/agent/runtime';
import {
  isVisionImageMime,
  planVisionImagePreprocess,
  resolveVisionImageAttachmentMediaType,
} from '@neko/platform/media/vision-preprocess-policy';
import type { MessageAttachment } from '../types';
import { resolveDocumentPath } from '../../services/documentPathResolver';

const logger = getLogger('AttachmentProcessor');

/**
 * Processed attachment result
 */
export type ProcessedAttachments = AgentProcessedAttachments;

/**
 * Bridge for message attachments.
 *
 * Projection rules live in @neko/agent. This class only injects local file IO
 * and image encoding capabilities from the extension host.
 */
export class AttachmentProcessor {
  /**
   * Process attachments using agent-owned projection rules.
   */
  async processAttachments(attachments?: MessageAttachment[]): Promise<ProcessedAttachments> {
    return projectAgentMessageAttachments(attachments, {
      readTextFile: async (path) => fs.promises.readFile(await resolveDocumentPath(path), 'utf-8'),
      readImageFileAsBase64: (path) => this.readFileAsBase64(path),
      onError: ({ operation, error }) => {
        logger.error(`Failed to ${operation} attachment`, error);
      },
    });
  }

  /**
   * Read file as base64 for image attachments.
   * Image policy is provided by @neko/platform; this method only performs IO
   * and sharp-based encoding in the extension host.
   */
  async readFileAsBase64(filePath: string): Promise<{
    type: 'base64';
    media_type: string;
    data: string;
  } | null> {
    try {
      const resolvedPath = await resolveDocumentPath(filePath);
      const buffer = await fs.promises.readFile(resolvedPath);
      const mediaType = resolveVisionImageAttachmentMediaType(resolvedPath);

      if (isVisionImageMime(mediaType)) {
        const encoded = await this.maybeEncodeVisionImage(buffer);
        if (encoded) {
          return encoded;
        }
      }

      return { type: 'base64', media_type: mediaType, data: buffer.toString('base64') };
    } catch (err) {
      logger.error('Failed to read file as base64:', err);
      return null;
    }
  }

  /**
   * Encode image only when the platform policy asks for a transform.
   */
  private async maybeEncodeVisionImage(buffer: Buffer): Promise<AgentBase64ImageAttachment | null> {
    try {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(buffer).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      const plan = planVisionImagePreprocess({
        width: w,
        height: h,
        byteLength: buffer.length,
      });

      if (!plan.shouldResize) return null;

      const resized = await sharp(buffer)
        .resize({
          width: plan.maxWidth,
          height: plan.maxHeight,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: plan.jpegQuality })
        .toBuffer();

      logger.debug(`Resized image: ${w}x${h} (${buffer.length}B) -> ${resized.length}B`);
      return {
        type: 'base64',
        media_type: plan.outputMediaType,
        data: resized.toString('base64'),
      };
    } catch (err) {
      logger.warn('Image resize failed, using original:', err);
      return null;
    }
  }
}
