import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAgentRealApiUserConfigManagerOptions } from '../realApiConfigInjection';

vi.mock('vscode', () => ({
  ExtensionMode: {
    Production: 1,
    Development: 2,
    Test: 3,
  },
}));

const tempRoots: string[] = [];

function createTempConfigPath(): string {
  const root = mkdtempSync(join(tmpdir(), 'neko-agent-real-api-config-'));
  tempRoots.push(root);
  const filePath = join(root, 'config.toml');
  writeFileSync(filePath, '', 'utf8');
  return filePath;
}

function createMissingConfigPath(): string {
  const root = mkdtempSync(join(tmpdir(), 'neko-agent-real-api-config-'));
  tempRoots.push(root);
  return join(root, 'config.toml');
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('serviceBootstrap real API config injection', () => {
  it('does not inject the real API test config in production extension mode', () => {
    expect(
      resolveAgentRealApiUserConfigManagerOptions({
        extensionMode: 1,
        productionExtensionMode: 1,
        env: {
          NEKO_AGENT_REAL_API: '1',
          NEKO_AGENT_TEST_CONFIG: '/tmp/neko-agent/config.toml',
        },
      }),
    ).toEqual({});
  });

  it('does not inject a test config unless the real API lane is explicit', () => {
    expect(
      resolveAgentRealApiUserConfigManagerOptions({
        extensionMode: 2,
        productionExtensionMode: 1,
        env: {
          NEKO_AGENT_TEST_CONFIG: '/tmp/neko-agent/config.toml',
        },
      }),
    ).toEqual({});
  });

  it('fails visibly when the explicit real API lane lacks config.toml', () => {
    expect(() =>
      resolveAgentRealApiUserConfigManagerOptions({
        extensionMode: 2,
        productionExtensionMode: 1,
        env: {
          NEKO_AGENT_REAL_API: '1',
        },
      }),
    ).toThrow('requires NEKO_AGENT_TEST_CONFIG to point at config.toml');
  });

  it('rejects non-config.toml real API test config names', () => {
    expect(() =>
      resolveAgentRealApiUserConfigManagerOptions({
        extensionMode: 2,
        productionExtensionMode: 1,
        env: {
          NEKO_AGENT_REAL_API: '1',
          NEKO_AGENT_TEST_CONFIG: '/tmp/neko-agent/mock.toml',
        },
      }),
    ).toThrow('must point at config.toml');
  });

  it('does not let the real API flag run against a non-real profile', () => {
    expect(() =>
      resolveAgentRealApiUserConfigManagerOptions({
        extensionMode: 2,
        productionExtensionMode: 1,
        env: {
          NEKO_AGENT_REAL_API: '1',
          NEKO_AGENT_TEST_PROFILE: 'mock',
          NEKO_AGENT_TEST_CONFIG: '/tmp/neko-agent/config.toml',
        },
      }),
    ).toThrow('requires NEKO_AGENT_TEST_PROFILE=real');
  });

  it('rejects missing config.toml files for explicit real API test config', () => {
    const filePath = createMissingConfigPath();

    expect(() =>
      resolveAgentRealApiUserConfigManagerOptions({
        extensionMode: 2,
        productionExtensionMode: 1,
        env: {
          NEKO_AGENT_REAL_API: '1',
          NEKO_AGENT_TEST_CONFIG: filePath,
        },
      }),
    ).toThrow('does not exist for real API tests');
  });

  it('injects the explicit real API test config in development or test extension mode', () => {
    const filePath = createTempConfigPath();

    expect(
      resolveAgentRealApiUserConfigManagerOptions({
        extensionMode: 2,
        productionExtensionMode: 1,
        env: {
          NEKO_AGENT_REAL_API: '1',
          NEKO_AGENT_TEST_CONFIG: filePath,
        },
      }),
    ).toEqual({ filePath });
  });
});
