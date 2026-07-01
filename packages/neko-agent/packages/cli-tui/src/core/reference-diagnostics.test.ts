import { describe, expect, it } from 'vitest';
import { formatTuiReferenceDiagnostics } from './reference-diagnostics';

describe('formatTuiReferenceDiagnostics', () => {
  it('returns undefined when there are no reference loading errors', () => {
    expect(formatTuiReferenceDiagnostics([])).toBeUndefined();
  });

  it('formats a visible diagnostic for unknown or unreadable references', () => {
    expect(
      formatTuiReferenceDiagnostics([
        { reference: '@missing.md', error: 'ENOENT: no such file or directory' },
        { reference: '@node_modules/pkg/index.ts', error: 'File is in excluded directory' },
      ]),
    ).toBe(
      [
        'Reference errors:',
        '- @missing.md: ENOENT: no such file or directory',
        '- @node_modules/pkg/index.ts: File is in excluded directory',
      ].join('\n'),
    );
  });
});
