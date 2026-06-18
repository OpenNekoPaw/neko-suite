import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const commandSource = readFileSync(join(__dirname, './index.ts'), 'utf-8');

describe('Puppet commands project file I/O', () => {
  it('creates imported Live2D bundle projects through shared project-file I/O', () => {
    expect(commandSource).toContain('new ProjectFileStore({');
    expect(commandSource).toContain('new ProjectFileSaveSession<NkpProjectData>({');
    expect(commandSource).toContain('createDefaultProjectFormatCodecRegistry()');
    expect(commandSource).toContain('ingestProjectSourceAddRequest(');
    expect(commandSource).toContain("formatId: 'nkp'");
    expect(commandSource).toContain('sourcePolicy: nkpSourcePathPolicy');
    expect(commandSource).toContain("saveReason: 'import'");
    expect(commandSource).toContain('projectFileSession.save({');
    expect(commandSource).not.toContain('vscode.workspace.fs.writeFile(\n          projectUri');
    expect(commandSource).not.toContain('JSON.stringify(loaded.projectData');
  });
});
