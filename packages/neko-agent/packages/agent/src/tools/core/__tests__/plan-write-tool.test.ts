import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createNekoPaths } from '../../../workspace';
import { PlanWriteTool } from '../plan-write-tool';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-planwrite-'));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

function buildTool(now?: () => number) {
  return new PlanWriteTool({ paths: createNekoPaths(tmpRoot), ...(now ? { now } : {}) });
}

describe('PlanWriteTool', () => {
  it('writes a .nkplan.md with step fences + proposal lineage', async () => {
    const tool = buildTool(() => Date.UTC(2026, 3, 22, 10, 0, 0));
    const res = await tool.execute({
      id: 'cut-tiktok-001-plan',
      proposalId: 'cut-tiktok-001',
      title: 'Hero cut plan',
      status: 'ready',
      steps: [
        {
          id: 's1',
          tool: 'GenerateImage',
          rationale: 'Hero frame.',
          args: 'prompt: hero on rooftop',
        },
      ],
    });
    expect(res.success).toBe(true);
    const contents = await fs.readFile(
      path.join(tmpRoot, '.neko', 'plans', 'cut-tiktok-001-plan.nkplan.md'),
      'utf-8',
    );
    expect(contents).toContain('proposalId: cut-tiktok-001');
    expect(contents).toContain('### 1. [pending] GenerateImage');
    expect(contents).toContain('```yaml\nprompt: hero on rooftop\n```');
  });

  it('preserves createdAt across rewrites', async () => {
    const clock = { t: Date.UTC(2026, 3, 22, 10, 0, 0) };
    const tool = buildTool(() => clock.t);
    const base = {
      id: 'p1',
      proposalId: 'prop1',
      title: 'T',
      status: 'ready' as const,
      steps: [],
    };
    await tool.execute(base);
    clock.t = Date.UTC(2026, 3, 22, 13, 0, 0);
    await tool.execute({ ...base, status: 'in_progress' });

    const contents = await fs.readFile(
      path.join(tmpRoot, '.neko', 'plans', 'p1.nkplan.md'),
      'utf-8',
    );
    expect(contents).toContain('createdAt: 2026-04-22T10:00:00.000Z');
    expect(contents).toContain('updatedAt: 2026-04-22T13:00:00.000Z');
    expect(contents).toContain('status: in_progress');
  });

  it('rejects missing proposalId', async () => {
    const tool = buildTool();
    const res = await tool.execute({
      id: 'p1',
      title: 'T',
      status: 'ready',
      steps: [],
    });
    expect(res.success).toBe(false);
  });

  it('rejects malformed step with index pointer', async () => {
    const tool = buildTool();
    const res = await tool.execute({
      id: 'p1',
      proposalId: 'prop1',
      title: 'T',
      status: 'ready',
      steps: [
        { id: 's1', tool: 'Read', rationale: '', args: '' },
        { id: 's2', tool: '', rationale: '', args: '' }, // empty tool
      ],
    });
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/steps\[1\]\.tool/);
  });

  it('rejects unknown step status', async () => {
    const tool = buildTool();
    const res = await tool.execute({
      id: 'p1',
      proposalId: 'prop1',
      title: 'T',
      status: 'ready',
      steps: [{ id: 's1', tool: 'Read', rationale: '', args: '', status: 'weird' }],
    });
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/steps\[0\]\.status/);
  });

  it('rejects non-array steps', async () => {
    const tool = buildTool();
    const res = await tool.execute({
      id: 'p1',
      proposalId: 'prop1',
      title: 'T',
      status: 'ready',
      steps: 'nope',
    });
    expect(res.success).toBe(false);
  });

  it('empty steps array is valid (draft plan)', async () => {
    const tool = buildTool();
    const res = await tool.execute({
      id: 'p1',
      proposalId: 'prop1',
      title: 'T',
      status: 'draft',
      steps: [],
    });
    expect(res.success).toBe(true);
    const contents = await fs.readFile(
      path.join(tmpRoot, '.neko', 'plans', 'p1.nkplan.md'),
      'utf-8',
    );
    expect(contents).toContain('_No steps._');
  });

  it('notes field flows into the output', async () => {
    const tool = buildTool();
    await tool.execute({
      id: 'p1',
      proposalId: 'prop1',
      title: 'T',
      status: 'ready',
      steps: [],
      notes: 'Keep under 30s.',
    });
    const contents = await fs.readFile(
      path.join(tmpRoot, '.neko', 'plans', 'p1.nkplan.md'),
      'utf-8',
    );
    expect(contents).toContain('## Notes');
    expect(contents).toContain('Keep under 30s.');
  });
});
