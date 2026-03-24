/**
 * FileTokenStorage — ITokenStorage backed by a local JSON file.
 *
 * Storage path: ~/.neko/auth.json  (key→value map)
 * Used by the CLI-TUI where VSCode's SecretStorage is unavailable.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ITokenStorage } from '@neko/shared';

const DEFAULT_AUTH_FILE = path.join(os.homedir(), '.neko', 'auth.json');

export class FileTokenStorage implements ITokenStorage {
  private readonly filePath: string;

  constructor(filePath: string = DEFAULT_AUTH_FILE) {
    this.filePath = filePath;
  }

  async get(key: string): Promise<string | null> {
    const store = await this.readStore();
    return store[key] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const store = await this.readStore();
    store[key] = value;
    await this.writeStore(store);
  }

  async delete(key: string): Promise<void> {
    const store = await this.readStore();
    delete store[key];
    await this.writeStore(store);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async readStore(): Promise<Record<string, string>> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private async writeStore(store: Record<string, string>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(store, null, 2), 'utf8');
  }
}
