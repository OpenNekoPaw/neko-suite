import { describe, it, expect } from 'vitest';
import type { TodoList } from '@neko-agent/types';
import { serializeTodoList } from '../todo-markdown';

function list(items: TodoList['items'], overrides: Partial<TodoList> = {}): TodoList {
  return {
    id: 'run-1',
    items,
    createdAt: Date.UTC(2026, 3, 22, 10, 0, 0),
    updatedAt: Date.UTC(2026, 3, 22, 10, 30, 0),
    ...overrides,
  };
}

describe('serializeTodoList', () => {
  it('renders frontmatter + heading + pending item', () => {
    const md = serializeTodoList(
      list([{ id: 't1', content: 'Generate hero shot', status: 'pending' }]),
    );
    expect(md).toContain('---\nid: run-1\n');
    expect(md).toContain('createdAt: 2026-04-22T10:00:00.000Z');
    expect(md).toContain('updatedAt: 2026-04-22T10:30:00.000Z');
    expect(md).toContain('# TODO');
    expect(md).toContain('- [ ] Generate hero shot');
  });

  it('uses activeForm for in_progress items, content otherwise', () => {
    const md = serializeTodoList(
      list([
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
    const md = serializeTodoList(
      list([{ id: 't1', content: 'Export 4k master', status: 'failed', error: 'OOM on encoder' }]),
    );
    expect(md).toMatch(/- \[!\] Export 4k master\n\s+_error: OOM on encoder_/);
  });

  it('renders failed items without an error line when absent', () => {
    const md = serializeTodoList(
      list([{ id: 't1', content: 'Export 4k master', status: 'failed' }]),
    );
    expect(md).toContain('- [!] Export 4k master');
    expect(md).not.toContain('_error:');
  });

  it('collapses whitespace / newlines in content so the list stays well-formed', () => {
    const md = serializeTodoList(
      list([{ id: 't1', content: '  multi\nline\tcontent  ', status: 'pending' }]),
    );
    expect(md).toContain('- [ ] multi line content');
  });

  it('empty list renders the empty-state placeholder', () => {
    const md = serializeTodoList(list([]));
    expect(md).toContain('_No items._');
  });

  it('item order is preserved', () => {
    const md = serializeTodoList(
      list([
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
});
