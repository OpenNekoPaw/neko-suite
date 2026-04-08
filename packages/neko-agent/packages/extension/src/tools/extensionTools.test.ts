import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, './extensionTools.ts'), 'utf-8');

describe('extensionTools canvas export contracts', () => {
  it('syncs canvas shot metadata after importing storyboard into neko-cut', () => {
    expect(source).toContain('async function syncTimelineImportMetadata(');
    expect(source).toContain("await vscode.commands.executeCommand('neko.cut.importStoryboard'");
    expect(source).toContain('lastImportedToTimelineAt: importedAt');
    expect(source).toContain('lastImportedToTimelineProject: projectName');
  });
});
