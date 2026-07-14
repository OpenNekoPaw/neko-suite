import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Neko TUI application boundary', () => {
  it('composes the Agent-owned public terminal entry without importing package internals', () => {
    const source = readFileSync(resolve(__dirname, 'application.ts'), 'utf8');
    expect(source).toContain("from '@neko/cli/terminal'");
    expect(source).not.toMatch(/packages\/neko-agent|@neko\/cli\/src/u);
    expect(source).not.toMatch(/\b(?:react-dom|vscode)\b/u);
  });
});
