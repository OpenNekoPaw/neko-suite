import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createNekoPaths } from '../../../workspace';
import { ProposalWriteTool } from '../proposal-write-tool';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-proposalwrite-'));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

function buildTool(now?: () => number) {
  const paths = createNekoPaths(tmpRoot);
  return new ProposalWriteTool({ paths, ...(now ? { now } : {}) });
}

describe('ProposalWriteTool', () => {
  it('writes a .nkproposal.md at .neko/proposals/<id>.nkproposal.md', async () => {
    const tool = buildTool(() => Date.UTC(2026, 3, 22, 10, 0, 0));
    const res = await tool.execute({
      id: 'cut-tiktok-001',
      title: 'TikTok hero cut',
      status: 'pending_review',
      domain: 'cut',
      intent: 'Make a 15s TikTok.',
      approach: 'Three-act.',
      artifact: 'Shot list.',
    });
    expect(res.success).toBe(true);
    const outPath = path.join(tmpRoot, '.neko', 'proposals', 'cut-tiktok-001.nkproposal.md');
    const contents = await fs.readFile(outPath, 'utf-8');
    expect(contents).toContain('kind: proposal');
    expect(contents).toContain('status: pending_review');
    expect(contents).toContain('# TikTok hero cut');
    expect(contents).toContain('## Intent');
    expect(contents).toContain('Make a 15s TikTok.');
  });

  it('preserves createdAt across rewrites', async () => {
    const clock = { t: Date.UTC(2026, 3, 22, 10, 0, 0) };
    const tool = buildTool(() => clock.t);

    await tool.execute({
      id: 'p1',
      title: 'T',
      status: 'draft',
      domain: 'cut',
      intent: 'i',
      approach: 'a',
      artifact: 'x',
    });

    clock.t = Date.UTC(2026, 3, 22, 12, 0, 0);
    await tool.execute({
      id: 'p1',
      title: 'T',
      status: 'approved',
      domain: 'cut',
      intent: 'i',
      approach: 'a',
      artifact: 'x',
    });

    const contents = await fs.readFile(
      path.join(tmpRoot, '.neko', 'proposals', 'p1.nkproposal.md'),
      'utf-8',
    );
    expect(contents).toContain('createdAt: 2026-04-22T10:00:00.000Z');
    expect(contents).toContain('updatedAt: 2026-04-22T12:00:00.000Z');
    expect(contents).toContain('status: approved');
  });

  it('rejects invalid id characters', async () => {
    const tool = buildTool();
    const res = await tool.execute({
      id: 'has space',
      title: 'T',
      status: 'draft',
      domain: 'cut',
      intent: 'i',
      approach: 'a',
      artifact: 'x',
    });
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/"id" must/);
  });

  it('rejects unknown status', async () => {
    const tool = buildTool();
    const res = await tool.execute({
      id: 'p1',
      title: 'T',
      status: 'in-flight',
      domain: 'cut',
      intent: 'i',
      approach: 'a',
      artifact: 'x',
    });
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/"status" must be one of/);
  });

  it('rejects empty body fields', async () => {
    const tool = buildTool();
    const res = await tool.execute({
      id: 'p1',
      title: 'T',
      status: 'draft',
      domain: 'cut',
      intent: '',
      approach: 'a',
      artifact: 'x',
    });
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/"intent" must/);
  });

  it('referenceChain with non-string entries fails', async () => {
    const tool = buildTool();
    const res = await tool.execute({
      id: 'p1',
      title: 'T',
      status: 'draft',
      domain: 'cut',
      intent: 'i',
      approach: 'a',
      artifact: 'x',
      referenceChain: ['asset://hero', 123],
    });
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/referenceChain/);
  });

  it('creates .neko/proposals lazily', async () => {
    const tool = buildTool();
    await tool.execute({
      id: 'p1',
      title: 'T',
      status: 'draft',
      domain: 'cut',
      intent: 'i',
      approach: 'a',
      artifact: 'x',
    });
    const stat = await fs.stat(path.join(tmpRoot, '.neko', 'proposals'));
    expect(stat.isDirectory()).toBe(true);
  });
});
