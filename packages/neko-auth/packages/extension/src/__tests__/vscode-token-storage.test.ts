import { describe, expect, it, vi } from 'vitest';
import { VscodeTokenStorage } from '../vscode-token-storage';

describe('VscodeTokenStorage', () => {
  it('delegates token persistence exclusively to VS Code SecretStorage', async () => {
    const secrets = new Map<string, string>();
    const adapter = {
      get: vi.fn(async (key: string) => secrets.get(key)),
      store: vi.fn(async (key: string, value: string) => {
        secrets.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        secrets.delete(key);
      }),
      onDidChange: vi.fn(),
    };
    const storage = new VscodeTokenStorage(adapter);

    await storage.set('neko.refreshToken', 'refresh-token');
    await expect(storage.get('neko.refreshToken')).resolves.toBe('refresh-token');
    await storage.delete('neko.refreshToken');
    await expect(storage.get('neko.refreshToken')).resolves.toBeNull();

    expect(adapter.store).toHaveBeenCalledWith('neko.refreshToken', 'refresh-token');
    expect(adapter.delete).toHaveBeenCalledWith('neko.refreshToken');
  });
});
