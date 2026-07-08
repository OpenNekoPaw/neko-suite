import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatCliMediaSaveSummary } from '../runner';

describe('CLI runner media output', () => {
  it('reports stable task identity instead of managed cache paths', () => {
    const summary = formatCliMediaSaveSummary('task-1', 2);

    expect(summary).toBe(
      '[media] Generated 2 file(s) for task task-1; managed output is tracked by Neko.',
    );
    expect(summary).not.toContain('.neko/.cache/generated');
  });

  it('does not expose the removed readline interactive API', () => {
    const runnerSource = fs.readFileSync(path.resolve(__dirname, '..', 'runner.ts'), 'utf8');
    const publicBarrelSource = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'index.ts'),
      'utf8',
    );

    expect(runnerSource).not.toContain("node:readline");
    expect(runnerSource).not.toContain('runInteractive');
    expect(publicBarrelSource).not.toContain('runInteractive');
  });
});
