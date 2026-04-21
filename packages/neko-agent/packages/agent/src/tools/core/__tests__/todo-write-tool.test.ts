import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createNekoPaths } from '../../../workspace';
import { TodoWriteTool } from '../todo-write-tool';

/**
 * Integration tests for TodoWriteTool — uses real fs into a temp dir
 * so we exercise the full path resolution + frontmatter preservation.
 */

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-todowrite-'));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

function buildTool(runId: string | null, now?: () => number) {
  const paths = createNekoPaths(tmpRoot);
  return new TodoWriteTool({
    paths,
    getRunId: () => runId,
    ...(now ? { now } : {}),
  });
}

describe('TodoWriteTool', () => {
  it('writes a .nktodo.md file at .neko/todos/<runId>.nktodo.md', async () => {
    const tool = buildTool('run-1', () => Date.UTC(2026, 3, 22, 10, 0, 0));
    const res = await tool.execute({
      todos: [
        { id: 't1', content: 'First task', status: 'pending' },
        { id: 't2', content: 'Second task', status: 'in_progress', activeForm: 'Doing second' },
      ],
    });
    expect(res.success).toBe(true);

    const outPath = path.join(tmpRoot, '.neko', 'todos', 'run-1.nktodo.md');
    const contents = await fs.readFile(outPath, 'utf-8');
    expect(contents).toContain('id: run-1');
    expect(contents).toContain('- [ ] First task');
    expect(contents).toContain('- [~] Doing second');
  });

  it('preserves createdAt across rewrites', async () => {
    const clock = { t: Date.UTC(2026, 3, 22, 10, 0, 0) };
    const tool = buildTool('run-1', () => clock.t);

    await tool.execute({ todos: [{ id: 't1', content: 'First', status: 'pending' }] });

    clock.t = Date.UTC(2026, 3, 22, 11, 0, 0); // one hour later
    await tool.execute({ todos: [{ id: 't1', content: 'First', status: 'completed' }] });

    const outPath = path.join(tmpRoot, '.neko', 'todos', 'run-1.nktodo.md');
    const contents = await fs.readFile(outPath, 'utf-8');
    expect(contents).toContain('createdAt: 2026-04-22T10:00:00.000Z');
    expect(contents).toContain('updatedAt: 2026-04-22T11:00:00.000Z');
    expect(contents).toContain('- [x] First');
  });

  it('rejects when no active run', async () => {
    const tool = buildTool(null);
    const res = await tool.execute({
      todos: [{ id: 't1', content: 'x', status: 'pending' }],
    });
    expect(res.success).toBe(false);
    expect(String(res.error)).toContain('no active SddRun');
  });

  it('rejects malformed items with a pointer to the bad index', async () => {
    const tool = buildTool('run-1');
    const res = await tool.execute({
      todos: [
        { id: 't1', content: 'ok', status: 'pending' },
        { id: 't2', content: 'bad', status: 'unknown-status' },
      ],
    });
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/todos\[1\]\.status/);
  });

  it('rejects missing required fields', async () => {
    const tool = buildTool('run-1');
    const res = await tool.execute({
      todos: [{ id: '', content: 'x', status: 'pending' }],
    });
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/id must be/);
  });

  it('rejects non-array todos', async () => {
    const tool = buildTool('run-1');
    const res = await tool.execute({ todos: 'not-an-array' });
    expect(res.success).toBe(false);
  });

  it('creates the todos directory if it does not exist', async () => {
    // Confirm the mkdir -p happens lazily.
    const tool = buildTool('run-1');
    await tool.execute({ todos: [{ id: 't1', content: 'x', status: 'pending' }] });
    const stat = await fs.stat(path.join(tmpRoot, '.neko', 'todos'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('includes error text when status is failed', async () => {
    const tool = buildTool('run-1');
    await tool.execute({
      todos: [{ id: 't1', content: 'Export master', status: 'failed', error: 'OOM' }],
    });
    const contents = await fs.readFile(
      path.join(tmpRoot, '.neko', 'todos', 'run-1.nktodo.md'),
      'utf-8',
    );
    expect(contents).toContain('- [!] Export master');
    expect(contents).toContain('_error: OOM_');
  });

  it('different runIds produce different files', async () => {
    const tool1 = buildTool('run-a');
    const tool2 = buildTool('run-b');
    await tool1.execute({ todos: [{ id: 't1', content: 'A', status: 'pending' }] });
    await tool2.execute({ todos: [{ id: 't1', content: 'B', status: 'pending' }] });
    const files = await fs.readdir(path.join(tmpRoot, '.neko', 'todos'));
    expect(files.sort()).toEqual(['run-a.nktodo.md', 'run-b.nktodo.md']);
  });
});
