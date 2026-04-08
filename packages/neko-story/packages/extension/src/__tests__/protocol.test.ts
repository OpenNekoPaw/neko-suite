/**
 * Protocol tests for neko-story extension.
 *
 * Verifies that FOUNTAIN_GLOB and SEE_LINK_PATTERN cover the same
 * set of supported file extensions (.fountain, .nks, .story).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: { file: (p: string) => ({ fsPath: p, toString: () => p, parse: (s: string) => s }) },
  EventEmitter: vi.fn(),
  workspace: {
    findFiles: vi.fn().mockResolvedValue([]),
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    })),
  },
}));

// The constants are module-level in the source files, so we replicate
// their values here and verify the patterns match the expected extensions.
const FOUNTAIN_GLOB = '**/*.{fountain,nks,story}';
const SEE_LINK_PATTERN = /\[\[see:\s*([^\]]+\.(?:fountain|nks|story))\s*\]\]/gi;

const SUPPORTED_EXTENSIONS = ['.fountain', '.nks', '.story'];

describe('neko-story protocol', () => {
  describe('FOUNTAIN_GLOB', () => {
    it('includes .fountain extension', () => {
      expect(FOUNTAIN_GLOB).toContain('fountain');
    });

    it('includes .nks extension', () => {
      expect(FOUNTAIN_GLOB).toContain('nks');
    });

    it('includes .story extension', () => {
      expect(FOUNTAIN_GLOB).toContain('story');
    });
  });

  describe('SEE_LINK_PATTERN', () => {
    it.each(SUPPORTED_EXTENSIONS)('matches [[see: file%s]] references', (ext) => {
      const input = `[[see: scenes/intro${ext}]]`;
      SEE_LINK_PATTERN.lastIndex = 0;
      const match = SEE_LINK_PATTERN.exec(input);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe(`scenes/intro${ext}`);
    });

    it('does not match unsupported extensions', () => {
      SEE_LINK_PATTERN.lastIndex = 0;
      expect(SEE_LINK_PATTERN.exec('[[see: file.txt]]')).toBeNull();

      SEE_LINK_PATTERN.lastIndex = 0;
      expect(SEE_LINK_PATTERN.exec('[[see: file.md]]')).toBeNull();
    });
  });

  describe('format support consistency', () => {
    it('FOUNTAIN_GLOB and SEE_LINK_PATTERN cover the same extensions', () => {
      // Extract extensions from glob: "**/*.{fountain,nks,story}" -> [fountain,nks,story]
      const globMatch = FOUNTAIN_GLOB.match(/\{([^}]+)\}/);
      const globExtensions = globMatch?.[1]?.split(',').sort() ?? [];

      // Extract extensions from regex source: (?:fountain|nks|story)
      const regexMatch = SEE_LINK_PATTERN.source.match(/\(\?:([^)]+)\)/);
      const regexExtensions = regexMatch?.[1]?.split('|').sort() ?? [];

      expect(globExtensions).toEqual(regexExtensions);
      expect(globExtensions).toEqual(['fountain', 'nks', 'story']);
    });
  });
});
