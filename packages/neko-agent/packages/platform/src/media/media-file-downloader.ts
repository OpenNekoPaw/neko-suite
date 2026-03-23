/**
 * Media File Downloader
 *
 * Shared utility for downloading remote media outputs to local filesystem.
 * Used by both the VSCode Extension and TUI after background task completion.
 * Has no dependency on VSCode APIs or readline — pure Node.js.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getLogger } from '../utils/logger';

const logger = getLogger('MediaFileDownloader');

/**
 * Formats that Electron webview (Chromium) cannot reliably decode inline.
 * Callers that run inside Electron should provide a `transcodeFile` callback.
 */
const TRANSCODE_NEEDED_EXTENSIONS = new Set(['.opus', '.mkv']);

function needsTranscode(ext: string): boolean {
  return TRANSCODE_NEEDED_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Derive file extension from HTTP Content-Type header.
 * Falls back to taskType / outputType hint when Content-Type is absent or generic.
 */
export function detectMediaExtension(
  contentType: string,
  taskType: string,
  outputType?: string,
): string {
  const ct = (contentType.split(';')[0] ?? '').trim().toLowerCase();

  // Audio
  if (ct === 'audio/ogg' || ct === 'audio/opus' || ct === 'audio/x-opus') return '.opus';
  if (ct === 'audio/mpeg' || ct === 'audio/mp3') return '.mp3';
  if (ct === 'audio/wav' || ct === 'audio/x-wav' || ct === 'audio/wave') return '.wav';
  if (ct === 'audio/mp4' || ct === 'audio/aac' || ct === 'audio/x-aac') return '.m4a';
  if (ct === 'audio/flac' || ct === 'audio/x-flac') return '.flac';
  if (ct === 'audio/webm') return '.webm';

  // Video
  if (ct === 'video/mp4') return '.mp4';
  if (ct === 'video/webm') return '.webm';
  if (ct === 'video/x-matroska' || ct === 'video/mkv') return '.mkv';
  if (ct === 'video/quicktime') return '.mov';

  // Image
  if (ct === 'image/png') return '.png';
  if (ct === 'image/jpeg') return '.jpg';
  if (ct === 'image/webp') return '.webp';
  if (ct === 'image/gif') return '.gif';

  // Fallback to task-type hint
  const hint = outputType || taskType;
  if (hint.includes('video')) return '.mp4';
  if (hint.includes('audio') || hint.includes('music') || hint.includes('tts')) return '.mp3';
  return '.png';
}

/**
 * Options for downloading media outputs
 */
export interface DownloadMediaOptions {
  /**
   * Optional transcoding callback for formats incompatible with the host environment
   * (e.g. raw Opus → MP3 for Electron webview). TUI callers can omit this.
   */
  transcodeFile?: (
    srcPath: string,
    destPath: string,
    mediaType: 'video' | 'audio',
  ) => Promise<boolean>;
}

/**
 * Download an array of media outputs to the local filesystem.
 *
 * @param taskId     - Used as filename prefix
 * @param taskType   - Used for format fallback detection (e.g. 'text-to-image')
 * @param outputs    - Array of { url?, type? } from the media adapter
 * @param outputDir  - Absolute path to the target directory (created if absent)
 * @param options    - Optional transcoding callback
 * @returns Absolute paths of successfully saved files (same order as outputs)
 */
export async function downloadMediaOutputs(
  taskId: string,
  taskType: string,
  outputs: Array<{ url?: string; type?: string }>,
  outputDir: string,
  options: DownloadMediaOptions = {},
): Promise<string[]> {
  const savedPaths: string[] = [];

  try {
    await fs.mkdir(outputDir, { recursive: true });

    for (let i = 0; i < outputs.length; i++) {
      const output = outputs[i];
      if (!output?.url) continue;

      // Already a local path — no download needed
      if (output.url.startsWith('/') || output.url.startsWith('file://')) {
        savedPaths.push(output.url.replace('file://', ''));
        continue;
      }

      try {
        const response = await fetch(output.url);
        if (!response.ok) {
          logger.error('Download failed', { status: response.status, url: output.url });
          continue;
        }

        const contentType = response.headers.get('content-type') || '';
        const detectedExt = detectMediaExtension(contentType, taskType, output.type);
        const rawPath = path.join(outputDir, `${taskId}_${i}${detectedExt}`);

        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(rawPath, buffer);

        // Transcode if the caller provided a handler and the format needs it
        if (needsTranscode(detectedExt) && options.transcodeFile) {
          const mediaType = taskType.includes('video') ? 'video' : 'audio';
          const compatExt = mediaType === 'video' ? '.mp4' : '.mp3';
          const compatPath = path.join(outputDir, `${taskId}_${i}${compatExt}`);
          try {
            const ok = await options.transcodeFile(rawPath, compatPath, mediaType);
            if (ok) {
              await fs.unlink(rawPath).catch(() => {});
              savedPaths.push(compatPath);
              continue;
            }
          } catch (transcodeErr) {
            logger.warn('Transcode failed, keeping original', { transcodeErr });
          }
        }

        savedPaths.push(rawPath);
      } catch (downloadErr) {
        logger.error('Failed to download output', { url: output.url, downloadErr });
        // Fall back to remote URL so the caller can still reference it
        savedPaths.push(output.url);
      }
    }
  } catch (err) {
    logger.error('Failed to save media outputs', { err });
  }

  return savedPaths;
}
