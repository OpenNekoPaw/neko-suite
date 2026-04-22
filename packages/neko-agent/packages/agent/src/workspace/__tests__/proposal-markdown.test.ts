import { describe, it, expect } from 'vitest';
import type { Proposal } from '@neko-agent/types';
import { serializeProposal } from '../proposal-markdown';

function make(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'cut-tiktok-001',
    title: 'TikTok 15s hero cut',
    status: 'pending_review',
    domain: 'cut',
    createdAt: Date.UTC(2026, 3, 22, 10, 0, 0),
    updatedAt: Date.UTC(2026, 3, 22, 10, 30, 0),
    intent: 'Compose a 15-second vertical TikTok piece.',
    approach: 'Three-act structure — hook, beat, payoff.',
    artifact: '- 00:00-00:03 hero shot\n- 00:03-00:10 montage\n- 00:10-00:15 tagline',
    ...overrides,
  };
}

describe('serializeProposal', () => {
  it('writes canonical frontmatter block', () => {
    const md = serializeProposal(make());
    expect(md).toContain('---\nid: cut-tiktok-001\n');
    expect(md).toContain('kind: proposal');
    expect(md).toContain('status: pending_review');
    expect(md).toContain('domain: cut');
    expect(md).toContain('createdAt: 2026-04-22T10:00:00.000Z');
    expect(md).toContain('updatedAt: 2026-04-22T10:30:00.000Z');
  });

  it('renders the three narrative layers as `## Intent / Approach / Concrete artifact`', () => {
    const md = serializeProposal(make());
    expect(md).toMatch(/## Intent\n\nCompose a 15-second vertical TikTok piece\./);
    expect(md).toMatch(/## Approach\n\nThree-act structure/);
    expect(md).toMatch(/## Concrete artifact\n\n- 00:00-00:03 hero shot/);
  });

  it('renders title both in frontmatter and as H1', () => {
    const md = serializeProposal(make());
    expect(md).toContain('# TikTok 15s hero cut');
    expect(md).toContain('title: TikTok 15s hero cut');
  });

  it('quotes YAML scalars that contain colons or special chars', () => {
    const md = serializeProposal(make({ title: 'Launch: v2' }));
    expect(md).toContain('title: "Launch: v2"');
  });

  it('omits referenceChain from frontmatter when empty', () => {
    const md = serializeProposal(make());
    expect(md).not.toContain('referenceChain:');
  });

  it('emits referenceChain as a YAML list when non-empty', () => {
    const md = serializeProposal(
      make({ referenceChain: ['asset://characters/hero', 'asset://styles/cinematic'] }),
    );
    expect(md).toMatch(/referenceChain:\n {2}- asset:\/\/characters\/hero/);
    expect(md).toContain('  - asset://styles/cinematic');
  });

  it('status value flows through verbatim', () => {
    for (const status of ['draft', 'pending_review', 'approved', 'refined', 'rejected'] as const) {
      const md = serializeProposal(make({ status }));
      expect(md).toContain(`status: ${status}`);
    }
  });
});
