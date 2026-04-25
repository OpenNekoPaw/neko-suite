import { describe, it, expect } from 'vitest';
import type { Task } from '@neko-agent/types';
import { parseTask, serializeTask } from '../task-markdown';

function task(items: Task['items'], overrides: Partial<Task> = {}): Task {
  return {
    id: 'run-1',
    items,
    createdAt: Date.UTC(2026, 3, 22, 10, 0, 0),
    updatedAt: Date.UTC(2026, 3, 22, 10, 30, 0),
    ...overrides,
  };
}

describe('serializeTask', () => {
  it('renders frontmatter + heading + pending item', () => {
    const md = serializeTask(
      task([{ id: 't1', content: 'Generate hero shot', status: 'pending' }]),
    );
    expect(md).toContain('---\nid: run-1\n');
    expect(md).toContain('kind: task');
    expect(md).toContain('createdAt: 2026-04-22T10:00:00.000Z');
    expect(md).toContain('updatedAt: 2026-04-22T10:30:00.000Z');
    expect(md).toContain('# Tasks');
    expect(md).toContain('- [ ] Generate hero shot');
  });

  it('uses activeForm for in_progress items, content otherwise', () => {
    const md = serializeTask(
      task([
        {
          id: 't1',
          content: 'Generate establishing shot',
          activeForm: 'Generating establishing shot',
          status: 'in_progress',
        },
        { id: 't2', content: 'Compose audio bed', status: 'completed' },
      ]),
    );
    expect(md).toContain('- [~] Generating establishing shot');
    expect(md).toContain('- [x] Compose audio bed');
  });

  it('renders failed items with an error line when present', () => {
    const md = serializeTask(
      task([{ id: 't1', content: 'Export 4k master', status: 'failed', error: 'OOM on encoder' }]),
    );
    expect(md).toMatch(/- \[!\] Export 4k master\n\s+_error: OOM on encoder_/);
  });

  it('renders failed items without an error line when absent', () => {
    const md = serializeTask(task([{ id: 't1', content: 'Export 4k master', status: 'failed' }]));
    expect(md).toContain('- [!] Export 4k master');
    expect(md).not.toContain('_error:');
  });

  it('collapses whitespace / newlines in content so the list stays well-formed', () => {
    const md = serializeTask(
      task([{ id: 't1', content: '  multi\nline\tcontent  ', status: 'pending' }]),
    );
    expect(md).toContain('- [ ] multi line content');
  });

  it('empty list renders the empty-state placeholder', () => {
    const md = serializeTask(task([]));
    expect(md).toContain('_No items._');
  });

  it('item order is preserved', () => {
    const md = serializeTask(
      task([
        { id: 'a', content: 'First', status: 'completed' },
        { id: 'b', content: 'Second', status: 'in_progress', activeForm: 'Doing second' },
        { id: 'c', content: 'Third', status: 'pending' },
      ]),
    );
    const firstIdx = md.indexOf('First');
    const secondIdx = md.indexOf('Doing second');
    const thirdIdx = md.indexOf('Third');
    expect(firstIdx).toBeGreaterThan(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(thirdIdx).toBeGreaterThan(secondIdx);
  });

  it('round-trips canonical task markdown back into a Task object', () => {
    const original = task([
      { id: 'run-1.item.1', content: 'First', status: 'completed' },
      {
        id: 'run-1.item.2',
        content: 'Doing second',
        status: 'in_progress',
        activeForm: 'Doing second',
      },
      { id: 'run-1.item.3', content: 'Third', status: 'failed', error: 'OOM' },
    ]);

    expect(parseTask(serializeTask(original))).toEqual(original);
  });
});
