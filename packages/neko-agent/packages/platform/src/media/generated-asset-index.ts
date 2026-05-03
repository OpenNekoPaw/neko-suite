import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import type { GeneratedAsset, GeneratedAssetType, GENERATED_ASSET_DIRS } from '@neko/shared';

export interface AssetFilter {
  readonly type?: GeneratedAssetType;
  readonly model?: string;
  readonly after?: string;
  readonly before?: string;
  readonly limit?: number;
}

interface IndexFile {
  readonly version: 1;
  readonly assets: GeneratedAsset[];
}

const FLUSH_DELAY_MS = 300;
const INDEX_FILE_NAME = 'index.json';

export class GeneratedAssetIndex {
  private readonly assets = new Map<string, GeneratedAsset>();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly indexPath: string;

  constructor(private readonly generatedDir: string) {
    this.indexPath = path.join(generatedDir, INDEX_FILE_NAME);
  }

  async load(): Promise<void> {
    this.assets.clear();
    try {
      const raw = await fsp.readFile(this.indexPath, 'utf-8');
      const data = JSON.parse(raw) as IndexFile;
      if (data.version === 1 && Array.isArray(data.assets)) {
        for (const asset of data.assets) {
          if (asset.id && asset.type) {
            this.assets.set(asset.id, asset);
          }
        }
      }
    } catch {
      // The index is reconstructible from generated files.
    }
  }

  dispose(): void {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.dirty) {
      this.flushSync();
    }
  }

  add(asset: GeneratedAsset): void {
    this.assets.set(asset.id, asset);
    this.scheduleDirtyFlush();
  }

  get(id: string): GeneratedAsset | undefined {
    return this.assets.get(id);
  }

  remove(id: string): boolean {
    const existed = this.assets.delete(id);
    if (existed) {
      this.scheduleDirtyFlush();
    }
    return existed;
  }

  list(filter?: AssetFilter): GeneratedAsset[] {
    let results = Array.from(this.assets.values());

    if (filter?.type) {
      results = results.filter((asset) => asset.type === filter.type);
    }
    if (filter?.model) {
      results = results.filter((asset) => asset.model === filter.model);
    }
    if (filter?.after) {
      const threshold = filter.after;
      results = results.filter((asset) => asset.generatedAt >= threshold);
    }
    if (filter?.before) {
      const threshold = filter.before;
      results = results.filter((asset) => asset.generatedAt < threshold);
    }

    results.sort((a, b) => (b.generatedAt > a.generatedAt ? 1 : -1));

    if (filter?.limit !== undefined && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  get size(): number {
    return this.assets.size;
  }

  private scheduleDirtyFlush(): void {
    this.dirty = true;
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      void this.flushAsync();
    }, FLUSH_DELAY_MS);
  }

  private async flushAsync(): Promise<void> {
    if (!this.dirty) return;
    try {
      await fsp.mkdir(this.generatedDir, { recursive: true });

      const data: IndexFile = {
        version: 1,
        assets: Array.from(this.assets.values()),
      };
      const json = JSON.stringify(data, null, 2);
      const tmpPath = `${this.indexPath}.tmp`;

      await fsp.writeFile(tmpPath, json, 'utf-8');
      await fsp.rename(tmpPath, this.indexPath);
      this.dirty = false;
    } catch {
      // The index is reconstructible from generated files.
    }
  }

  private flushSync(): void {
    if (!this.dirty) return;
    try {
      fs.mkdirSync(this.generatedDir, { recursive: true });

      const data: IndexFile = {
        version: 1,
        assets: Array.from(this.assets.values()),
      };
      const json = JSON.stringify(data, null, 2);
      const tmpPath = `${this.indexPath}.tmp`;

      fs.writeFileSync(tmpPath, json, 'utf-8');
      fs.renameSync(tmpPath, this.indexPath);
      this.dirty = false;
    } catch {
      // The index is reconstructible from generated files.
    }
  }
}

export function resolveGeneratedDir(workspaceRoot: string): string {
  const dir = path.join(workspaceRoot, '.neko', '.cache', 'generated');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveAssetSubDir(
  generatedDir: string,
  subDir: (typeof GENERATED_ASSET_DIRS)[keyof typeof GENERATED_ASSET_DIRS],
): string {
  const dir = path.join(generatedDir, subDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function generateAssetId(): string {
  return randomUUID();
}
