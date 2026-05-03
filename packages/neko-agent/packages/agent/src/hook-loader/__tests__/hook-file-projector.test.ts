import { describe, expect, it } from 'vitest';
import {
  buildHookDirectoryScanError,
  buildHookFileReadError,
  parseHookMarkdownFile,
  parseSimpleHookYaml,
  shouldScanHookFile,
  toConfiguredHookCatalog,
} from '../hook-file-projector';

describe('hook-file-projector', () => {
  it('parses hook markdown into a hook object', () => {
    const result = parseHookMarkdownFile(
      `---
name: "guard"
description: "Guard shell"
event: "PreToolUse"
condition: "tool:Bash"
priority: 10
enabled: false
---
echo check`,
      'project',
      '/repo/.neko/hooks/guard.md',
    );

    expect(result.error).toBeUndefined();
    expect(result.hook).toEqual({
      name: 'guard',
      description: 'Guard shell',
      event: 'PreToolUse',
      condition: 'tool:Bash',
      action: 'echo check',
      enabled: false,
      source: 'project',
      filePath: '/repo/.neko/hooks/guard.md',
      priority: 10,
    });
  });

  it('reports missing frontmatter and invalid events', () => {
    expect(parseHookMarkdownFile('plain', 'personal', '/h.md').error?.message).toBe(
      'Invalid format: missing YAML frontmatter',
    );
    expect(
      parseHookMarkdownFile(
        `---
name: test
description: test
event: Nope
---
body`,
        'personal',
        '/h.md',
      ).error?.message,
    ).toBe('Invalid event type: Nope');
  });

  it('parses simple scalar yaml values', () => {
    expect(parseSimpleHookYaml('name: "x"\nenabled: true\npriority: 5')).toEqual({
      name: 'x',
      enabled: true,
      priority: 5,
    });
  });

  it('projects configured hooks with enabled default', () => {
    const hook = parseHookMarkdownFile(
      `---
name: notify
description: Notify user
event: Notification
---
notify`,
      'personal',
      '/hook.md',
    ).hook!;

    expect(toConfiguredHookCatalog({ personal: [hook], project: [], errors: [] })).toEqual([
      expect.objectContaining({ name: 'notify', enabled: true }),
    ]);
  });

  it('projects scan filters and host read errors', () => {
    expect(shouldScanHookFile('guard.md')).toBe(true);
    expect(shouldScanHookFile('guard.ts')).toBe(false);
    expect(buildHookFileReadError('/hook.md', new Error('denied'))).toEqual({
      file: '/hook.md',
      message: 'Failed to read: denied',
    });
    expect(buildHookDirectoryScanError('/hooks', 'bad')).toEqual({
      file: '/hooks',
      message: 'Failed to scan directory: bad',
    });
  });
});
