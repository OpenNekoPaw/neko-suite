/**
 * CacheManager — Local download cache management.
 *
 * Manages `.neko/market-cache/` directory with LRU eviction.
 * Packages are cached by ID and version to avoid re-downloading.
 */

import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ICacheManager } from '@neko/shared/types/asset/market';

// =============================================================================
// Implementation
// =============================================================================

export class CacheManager implements ICacheManager {
  constructor(private readonly cacheDir: string) {}

  async getCachedPath(packageId: string, version: string): Promise<string | undefined> {
    const path = this.buildPath(packageId, version);
    try {
      await stat(path);
      return path;
    } catch {
      return undefined;
    }
  }

  async cacheFile(packageId: string, version: string, sourcePath: string): Promise<string> {
    const targetDir = this.buildDir(packageId);
    await mkdir(targetDir, { recursive: true });

    const targetPath = this.buildPath(packageId, version);
    await copyFile(sourcePath, targetPath);

    return targetPath;
  }

  async evict(packageId: string, version?: string): Promise<void> {
    if (version) {
      const path = this.buildPath(packageId, version);
      await rm(path, { force: true });
    } else {
      const dir = this.buildDir(packageId);
      await rm(dir, { recursive: true, force: true });
    }
  }

  async getSize(): Promise<number> {
    return this.dirSize(this.cacheDir);
  }

  async prune(maxSizeBytes: number): Promise<void> {
    const currentSize = await this.getSize();
    if (currentSize <= maxSizeBytes) return;

    // Collect all cached files with access times
    const files = await this.collectFiles();

    // Sort by access time (oldest first) for LRU eviction
    files.sort((a, b) => a.atimeMs - b.atimeMs);

    let freedSize = 0;
    const targetFree = currentSize - maxSizeBytes;

    for (const file of files) {
      if (freedSize >= targetFree) break;
      await rm(file.path, { force: true });
      freedSize += file.size;
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private buildDir(packageId: string): string {
    // Sanitize: @publisher/name → publisher__name
    const safe = packageId.replace(/^@/, '').replace(/\//g, '__');
    return join(this.cacheDir, safe);
  }

  private buildPath(packageId: string, version: string): string {
    return join(this.buildDir(packageId), `${version}.tar.gz`);
  }

  private async dirSize(dir: string): Promise<number> {
    let total = 0;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          total += await this.dirSize(fullPath);
        } else {
          const s = await stat(fullPath);
          total += s.size;
        }
      }
    } catch {
      // Directory may not exist
    }
    return total;
  }

  private async collectFiles(): Promise<Array<{ path: string; size: number; atimeMs: number }>> {
    const files: Array<{ path: string; size: number; atimeMs: number }> = [];
    try {
      const pkgDirs = await readdir(this.cacheDir, { withFileTypes: true });
      for (const dir of pkgDirs) {
        if (!dir.isDirectory()) continue;
        const pkgDir = join(this.cacheDir, dir.name);
        const versions = await readdir(pkgDir, { withFileTypes: true });
        for (const file of versions) {
          if (file.isDirectory()) continue;
          const filePath = join(pkgDir, file.name);
          const s = await stat(filePath);
          files.push({ path: filePath, size: s.size, atimeMs: s.atimeMs });
        }
      }
    } catch {
      // Cache dir may not exist
    }
    return files;
  }
}
