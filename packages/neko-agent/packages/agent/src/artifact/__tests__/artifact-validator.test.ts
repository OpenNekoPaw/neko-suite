import { describe, it, expect } from 'vitest';
import { validateArtifact } from '../artifact-validator';

// Minimal helper — builds a canonical draft frontmatter the validator should accept.
function draft(overrides: Partial<Record<string, string>> = {}): string {
  const fields = {
    id: 'cut-tiktok-001',
    kind: 'draft',
    title: 'TikTok hero cut',
    status: 'pending_review',
    domain: 'cut',
    createdAt: '2026-04-22T10:00:00.000Z',
    updatedAt: '2026-04-22T10:30:00.000Z',
    ...overrides,
  };
  const lines = [
    '---',
    ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`),
    '---',
    '',
    '# body',
  ];
  return lines.join('\n') + '\n';
}

function plan(overrides: Partial<Record<string, string>> = {}): string {
  const fields = {
    id: 'cut-tiktok-001-plan',
    kind: 'plan',
    draftId: 'cut-tiktok-001',
    title: 'Hero cut plan',
    status: 'ready',
    createdAt: '2026-04-22T10:00:00.000Z',
    updatedAt: '2026-04-22T10:30:00.000Z',
    ...overrides,
  };
  const lines = [
    '---',
    ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`),
    '---',
    '',
    '# body',
  ];
  return lines.join('\n') + '\n';
}

function task(overrides: Partial<Record<string, string>> = {}): string {
  const fields = {
    id: 'run-1',
    kind: 'task',
    createdAt: '2026-04-22T10:00:00.000Z',
    updatedAt: '2026-04-22T10:30:00.000Z',
    ...overrides,
  };
  const lines = [
    '---',
    ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`),
    '---',
    '',
    '# body',
  ];
  return lines.join('\n') + '\n';
}

describe('validateArtifact — happy path', () => {
  it('accepts a canonical draft', () => {
    const r = validateArtifact('draft', draft());
    expect(r.valid).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.frontmatter.id).toBe('cut-tiktok-001');
    expect(r.frontmatter.kind).toBe('draft');
  });

  it('accepts a canonical plan with draftId lineage', () => {
    const r = validateArtifact('plan', plan());
    expect(r.valid).toBe(true);
    expect(r.frontmatter.draftId).toBe('cut-tiktok-001');
  });

  it('accepts a canonical task (minimal schema)', () => {
    const r = validateArtifact('task', task());
    expect(r.valid).toBe(true);
  });

  it('strips surrounding quotes from values', () => {
    const raw = [
      '---',
      'id: x',
      'kind: task',
      'createdAt: "2026-04-22T10:00:00.000Z"',
      "updatedAt: '2026-04-22T10:30:00.000Z'",
      '---',
      '',
    ].join('\n');
    const r = validateArtifact('task', raw);
    expect(r.valid).toBe(true);
    expect(r.frontmatter.createdAt).toBe('2026-04-22T10:00:00.000Z');
  });
});

describe('validateArtifact — structural failures', () => {
  it('flags missing frontmatter block', () => {
    const r = validateArtifact('draft', '# no frontmatter here\n');
    expect(r.valid).toBe(false);
    expect(r.issues[0]?.code).toBe('missing-frontmatter');
  });

  it('flags frontmatter missing its closing fence', () => {
    const r = validateArtifact('draft', '---\nid: x\nkind: draft\n# body');
    expect(r.valid).toBe(false);
    expect(r.issues[0]?.code).toBe('malformed-frontmatter');
  });

  it('rejects block scalars in frontmatter (the simple parser does not support them)', () => {
    const raw = ['---', 'id: x', 'kind: draft', 'title: |', '  Multi', '  line', '---', ''].join(
      '\n',
    );
    const r = validateArtifact('draft', raw);
    expect(r.valid).toBe(false);
    expect(r.issues[0]?.code).toBe('malformed-frontmatter');
  });

  it('rejects nested list items (unsupported construct)', () => {
    const raw = [
      '---',
      'id: x',
      'kind: draft',
      'referenceChain:',
      '  - asset://characters/hero',
      '---',
      '',
    ].join('\n');
    const r = validateArtifact('draft', raw);
    expect(r.valid).toBe(false);
    expect(r.issues[0]?.code).toBe('malformed-frontmatter');
  });
});

describe('validateArtifact — schema failures', () => {
  it('flags kind mismatch with directory', () => {
    const r = validateArtifact('plan', draft()); // draft content in plan dir
    expect(r.valid).toBe(false);
    expect(r.issues[0]?.code).toBe('wrong-kind');
    expect(r.issues[0]?.field).toBe('kind');
  });

  it('wrong-kind issue appears first, before missing-field noise', () => {
    const r = validateArtifact('plan', draft());
    expect(r.issues[0]?.code).toBe('wrong-kind');
    // draft is missing `draftId` for a plan schema — still reported below
    expect(r.issues.some((i) => i.field === 'draftId')).toBe(true);
  });

  it('flags missing required field', () => {
    const raw = draft({ domain: '' });
    const r = validateArtifact('draft', raw);
    expect(r.valid).toBe(false);
    const missing = r.issues.find((i) => i.code === 'missing-field' && i.field === 'domain');
    expect(missing).toBeDefined();
  });

  it('flags invalid status', () => {
    const r = validateArtifact('draft', draft({ status: 'not-a-status' }));
    expect(r.valid).toBe(false);
    const issue = r.issues.find((i) => i.code === 'invalid-status');
    expect(issue?.field).toBe('status');
    expect(issue?.message).toContain('pending_review');
  });

  it('flags invalid timestamp', () => {
    const r = validateArtifact('draft', draft({ updatedAt: 'yesterday' }));
    expect(r.valid).toBe(false);
    const issue = r.issues.find((i) => i.code === 'invalid-timestamp');
    expect(issue?.field).toBe('updatedAt');
  });

  it('plan requires draftId', () => {
    const raw = plan({ draftId: '' });
    const r = validateArtifact('plan', raw);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.field === 'draftId' && i.code === 'missing-field')).toBe(true);
  });
});

describe('validateArtifact — frozen output', () => {
  it('returns a frozen frontmatter snapshot', () => {
    const r = validateArtifact('task', task());
    expect(Object.isFrozen(r.frontmatter)).toBe(true);
  });
});
