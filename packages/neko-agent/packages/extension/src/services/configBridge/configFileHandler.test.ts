import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_USER_CONFIG } from '@neko/platform';
import { buildUserConfigTemplate } from './configFileHandler';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

describe('ConfigFileHandler', () => {
  it('uses the NewAPI/local MVP default config as the new file template', () => {
    expect(JSON.parse(buildUserConfigTemplate())).toEqual(DEFAULT_USER_CONFIG);
  });
});
