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
});
