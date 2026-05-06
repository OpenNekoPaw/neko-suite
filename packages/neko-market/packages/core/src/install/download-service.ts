/**
 * DownloadService — HTTP download with resume support.
 *
 * Supports Range headers for resuming interrupted downloads,
 * and streams data to disk to minimize memory usage.
 */

import { createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { InstallProgressCallback } from '@neko/shared';

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
  /** Abort an in-flight download and retry delay. */
  signal?: AbortSignal;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Download a file from URL to disk with optional resume support.
 */
export async function downloadFile(url: string, options: DownloadOptions): Promise<void> {
  const { destPath, resume = false, maxRetries = 3, onProgress, packageId = '', signal } = options;

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
      throwIfAborted(signal);
      const headers: Record<string, string> = {};
      if (startByte > 0) {
        headers['Range'] = `bytes=${startByte}-`;
      }

      const response = await fetch(url, { headers, signal });

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
          throwIfAborted(signal);
          const { done, value } = await reader.read();
          if (done) break;

          writer.write(Buffer.from(value));
          downloadedBytes += value.byteLength;

          if (onProgress) {
            onProgress({
              packageId,
              phase: 'fetch',
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
      if (isAbortError(error, signal)) {
        throw new Error(`Download cancelled: ${packageId || url}`);
      }
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay, signal);

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

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('Download aborted', 'AbortError');
  }
}

function isAbortError(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true;
  return error instanceof DOMException && error.name === 'AbortError';
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new DOMException('Download aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}
