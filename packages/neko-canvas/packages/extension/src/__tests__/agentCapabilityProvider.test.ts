import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const providerSource = readFileSync(join(__dirname, '../agentCapabilityProvider.ts'), 'utf-8');

describe('agentCapabilityProvider storyboard export contracts', () => {
  it('syncs shot timeline import metadata after neko-cut import', () => {
    expect(providerSource).toContain('async function syncTimelineImportMetadata(');
    expect(providerSource).toContain(
      "await vscode.commands.executeCommand('neko.cut.importStoryboard'",
    );
    expect(providerSource).toContain('lastImportedToTimelineAt: importedAt');
    expect(providerSource).toContain('lastImportedToTimelineProject: projectName');
  });
});
