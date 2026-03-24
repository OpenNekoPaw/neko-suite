/**
 * DownloadService — HTTP download with resume support.
 *
 * Supports Range headers for resuming interrupted downloads,
 * and streams data to disk to minimize memory usage.
 */

import { createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { InstallProgressCallback } from '@neko/shared/types/asset/market';

// =============================================================================
// Types
// =============================================================================

export interface DownloadOptions {
  /** Target file path */
  destPath: string;
  /** Resume from existing partial download */
  resume?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Progress callback */
  onProgress?: InstallProgressCallback;
  /** Package ID for progress reporting */
  packageId?: string;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Download a file from URL to disk with optional resume support.
 */
export async function downloadFile(url: string, options: DownloadOptions): Promise<void> {
  const { destPath, resume = false, maxRetries = 3, onProgress, packageId = '' } = options;

  let startByte = 0;

  // Check for existing partial download
  if (resume) {
    try {
      const stats = await stat(destPath);
      startByte = stats.size;
    } catch {
      // File doesn't exist, start from beginning
    }
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const headers: Record<string, string> = {};
      if (startByte > 0) {
        headers['Range'] = `bytes=${startByte}-`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? startByte + Number(contentLength) : undefined;
      const body = response.body;

      if (!body) {
        throw new Error('Response body is empty');
      }

      const writer = createWriteStream(destPath, {
        flags: startByte > 0 ? 'a' : 'w',
      });

      let downloadedBytes = startByte;
      const reader = body.getReader();

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          writer.write(Buffer.from(value));
          downloadedBytes += value.byteLength;

          if (onProgress) {
            onProgress({
              packageId,
              phase: 'downloading',
              percent: totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
              bytesDownloaded: downloadedBytes,
              bytesTotal: totalBytes,
            });
          }
        }
      } finally {
        writer.end();
        await new Promise<void>((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
      }

      return; // Success
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Update startByte for resume on retry
        try {
          const stats = await stat(destPath);
          startByte = stats.size;
        } catch {
          startByte = 0;
        }
      }
    }
  }

  throw lastError ?? new Error('Download failed');
}
