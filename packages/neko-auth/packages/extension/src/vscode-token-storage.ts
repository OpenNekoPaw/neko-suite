import type * as vscode from 'vscode';
import type { ITokenStorage } from '@neko/shared';

/**
 * VscodeTokenStorage — ITokenStorage backed by VSCode's SecretStorage API.
 * Secrets are encrypted by the OS keychain and scoped to the extension.
 */
export class VscodeTokenStorage implements ITokenStorage {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  get(key: string): Promise<string | null> {
    return this.secrets.get(key).then((v) => v ?? null);
  }

  set(key: string, value: string): Promise<void> {
    return this.secrets.store(key, value);
  }

  delete(key: string): Promise<void> {
    return this.secrets.delete(key);
  }
}
