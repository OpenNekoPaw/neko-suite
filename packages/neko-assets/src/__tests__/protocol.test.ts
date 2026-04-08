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

// ============================================================================
// Tests
// ============================================================================

describe('neko-assets package.json — removed cloud sync commands', () => {
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

describe('neko-assets package.json — required commands are present', () => {
  it('declares viewHistory command', () => {
    expect(declaredCommands).toContain('neko.assets.viewHistory');
  });

  it('declares previewMedia command', () => {
    expect(declaredCommands).toContain('neko.assets.previewMedia');
  });

  it('has a non-trivial number of commands registered', () => {
    // Guard against accidentally emptying the commands array
    expect(declaredCommands.length).toBeGreaterThan(10);
  });
});
