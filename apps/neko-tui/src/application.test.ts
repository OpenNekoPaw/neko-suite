import { describe, expect, it } from 'vitest';
import { runCliEntrypoint } from '@neko/cli/terminal';
import { NEKO_TUI_APPLICATION_ID } from './application';

describe('Neko TUI application composition', () => {
  it('declares the canonical application identity', () => {
    expect(NEKO_TUI_APPLICATION_ID).toBe('neko-tui');
  });

  it('resolves the Agent-owned terminal entry as an executable contract', () => {
    expect(runCliEntrypoint).toBeTypeOf('function');
  });
});
