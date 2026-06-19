import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { DEFAULT_USER_CONFIG } from '@neko/platform';
import { parseTomlConfigText } from '@neko/shared';
import { buildUserConfigTemplate, migrateLegacyUserConfigFileInVsCode } from './configFileHandler';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

const tempRoots: string[] = [];

function createTempHome(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-config-extension-'));
  tempRoots.push(root);
  return root;
}

describe('ConfigFileHandler', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the NewAPI/local MVP default config as the new file template', () => {
    expect(parseTomlConfigText(buildUserConfigTemplate())).toEqual(DEFAULT_USER_CONFIG);
    expect(buildUserConfigTemplate()).toContain('[[providers]]');
  });

  it('migrates legacy JSON to TOML and opens the migrated file', async () => {
    const home = createTempHome();
    vi.stubEnv('HOME', home);
    const configDir = path.join(home, '.neko');
    const legacyPath = path.join(configDir, 'config.json');
    const tomlPath = path.join(configDir, 'config.toml');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      legacyPath,
      JSON.stringify({
        providers: [
          {
            id: 'ollama-local',
            name: 'ollama',
            displayName: 'Ollama Local',
            type: 'ollama',
            apiUrl: 'http://localhost:11434/api',
            enabled: true,
            requiresApiKey: false,
          },
        ],
      }),
      'utf-8',
    );

    await migrateLegacyUserConfigFileInVsCode();

    expect(fs.existsSync(tomlPath)).toBe(true);
    expect(fs.existsSync(`${legacyPath}.bak`)).toBe(true);
    expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(tomlPath);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Migrated Neko config'),
    );
  });
});
