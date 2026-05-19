import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ============================================================================
// Mock vscode module
// ============================================================================

vi.mock('vscode', () => ({
  Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p }) },
  commands: { executeCommand: vi.fn() },
  EventEmitter: vi.fn(),
}));

// ============================================================================
// Helpers
// ============================================================================

const pkgJsonPath = resolve(__dirname, '..', '..', 'package.json');
const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
const declaredCommands: string[] =
  (pkgJson.contributes?.commands as Array<{ command: string }> | undefined)?.map(
    (c) => c.command,
  ) ?? [];

const extensionSource = readFileSync(resolve(__dirname, '..', 'extension.ts'), 'utf-8');

// ============================================================================
// Tests: package.json command declarations
// ============================================================================

describe('neko-assets package.json -- removed cloud sync commands', () => {
  const removedCommands = [
    'neko.assets.sync',
    'neko.assets.push',
    'neko.assets.pull',
    'neko.assets.initLfs',
    'neko.assets.trackLfs',
    'neko.assets.triggerRender',
  ];

  it.each(removedCommands)('"%s" is NOT declared in contributes.commands', (cmd) => {
    expect(declaredCommands).not.toContain(cmd);
  });
});

describe('neko-assets package.json -- required commands are present', () => {
  it('declares viewHistory command', () => {
    expect(declaredCommands).toContain('neko.assets.viewHistory');
  });

  it('declares previewMedia command', () => {
    expect(declaredCommands).toContain('neko.assets.previewMedia');
  });

  it('has a non-trivial number of commands registered', () => {
    expect(declaredCommands.length).toBeGreaterThan(10);
  });
});

// ============================================================================
// Tests: extension.ts source contract -- registerLegacyCommands
// ============================================================================

describe('extension.ts -- registerLegacyCommands keeps only valid commands', () => {
  it('does NOT contain neko.assets.sync command registration', () => {
    // registerLegacyCommands should not register removed cloud sync commands
    expect(extensionSource).not.toMatch(/registerCommand\(\s*['"]neko\.assets\.sync['"]/);
  });

  it('does NOT contain neko.assets.push command registration', () => {
    expect(extensionSource).not.toMatch(/registerCommand\(\s*['"]neko\.assets\.push['"]/);
  });

  it('does NOT contain neko.assets.pull command registration', () => {
    expect(extensionSource).not.toMatch(/registerCommand\(\s*['"]neko\.assets\.pull['"]/);
  });

  it('DOES contain neko.assets.viewHistory command registration', () => {
    expect(extensionSource).toContain("'neko.assets.viewHistory'");
  });

  it('DOES contain neko.assets.previewMedia command registration', () => {
    expect(extensionSource).toContain("'neko.assets.previewMedia'");
  });

  it('DOES contain internal media-library roots command registration', () => {
    expect(extensionSource).toContain("'neko.assets.getMediaLibraryRoots'");
  });
});

describe('extension.ts -- no cloud sync TreeDataProvider (NKAS-002)', () => {
  it('does NOT register a neko.cloudSync TreeDataProvider', () => {
    expect(extensionSource).not.toContain('neko.cloudSync');
    expect(extensionSource).not.toMatch(/registerTreeDataProvider\(\s*['"].*cloudSync/);
  });
});

describe('extension.ts -- registerLegacyCommands function exists', () => {
  it('defines registerLegacyCommands as a function', () => {
    expect(extensionSource).toMatch(/function registerLegacyCommands/);
  });

  it('is called during activation', () => {
    expect(extensionSource).toContain('registerLegacyCommands(context)');
  });
});

// ============================================================================
// Tests: extension activation contracts (NKAS-007)
// ============================================================================

describe('extension activation (NKAS-007)', () => {
  it('calls registerLegacyCommands(context) during activation', () => {
    expect(extensionSource).toContain('registerLegacyCommands(context)');
  });

  it('registers neko.assetManager tree view', () => {
    expect(extensionSource).toContain("'neko.assetManager'");
  });

  it('uses AssetManagerTreeProvider', () => {
    expect(extensionSource).toContain('AssetManagerTreeProvider');
  });

  it('uses MediaLibraryTreeProvider', () => {
    expect(extensionSource).toContain('MediaLibraryTreeProvider');
  });

  it('does NOT use CloudSyncTreeProvider', () => {
    expect(extensionSource).not.toContain('CloudSyncTreeProvider');
  });

  it('registers media library tree view', () => {
    expect(extensionSource).toContain("'neko.mediaLibraries'");
  });

  it('initializes i18n during activation', () => {
    expect(extensionSource).toContain('initI18n');
  });

  it('sets up error handler during activation', () => {
    expect(extensionSource).toContain('setErrorHandler');
  });
});
