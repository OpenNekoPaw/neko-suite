import { describe, expect, it } from 'vitest';
import {
  runAnalyzeTextStructure,
  runAskUser,
  runCheckExistingAssets,
  runEstimateDuration,
} from '../llm-router-tools';
import type { AssetLibrary } from '../../asset-library/types';

describe('runAnalyzeTextStructure', () => {
  it('counts fountain scene headings', () => {
    const r = runAnalyzeTextStructure({
      excerpt: 'INT. COFFEE SHOP - DAY\n\nAlice enters.\n\n  ALICE\n  Hi there.',
    });
    expect(r.headingCount).toBe(1);
    expect(r.hasFountainCues).toBe(true);
    expect(r.dialogueLineCount).toBeGreaterThan(0);
  });

  it('counts markdown headings', () => {
    const r = runAnalyzeTextStructure({
      excerpt: '# Title\n\n## Chapter 1\n\nBody text.',
    });
    expect(r.headingCount).toBe(2);
    expect(r.hasFountainCues).toBe(false);
  });

  it('detects CJK text', () => {
    const r = runAnalyzeTextStructure({ excerpt: '第一章\n她走进屋子。' });
    expect(r.hasChineseText).toBe(true);
  });
});

describe('runCheckExistingAssets', () => {
  const makeLib = (): AssetLibrary =>
    ({
      listEntities: () => [{ id: 'alice', kind: 'character', canonicalName: 'Alice', aliases: [] }],
      listAssets: (filter?: { kind?: string }) => {
        const all = [
          { id: 'a1', kind: 'image', path: '/a.png' },
          { id: 'a2', kind: 'image', path: '/b.png' },
          { id: 'a3', kind: 'video', path: '/c.mp4' },
        ];
        return filter?.kind ? all.filter((a) => a.kind === filter.kind) : all;
      },
    }) as unknown as AssetLibrary;

  it('aggregates counts by kind', () => {
    const r = runCheckExistingAssets({}, { assetLibrary: makeLib() });
    expect(r.assetCount).toBe(3);
    expect(r.byKind['image']).toBe(2);
    expect(r.byKind['video']).toBe(1);
    expect(r.entityCount).toBe(1);
  });

  it('filters by kind when requested', () => {
    const r = runCheckExistingAssets({ kind: 'video' }, { assetLibrary: makeLib() });
    expect(r.assetCount).toBe(1);
  });

  it('returns zeros when no AssetLibrary configured', () => {
    const r = runCheckExistingAssets({}, {});
    expect(r.assetCount).toBe(0);
    expect(r.entityCount).toBe(0);
  });
});

describe('runEstimateDuration', () => {
  it('returns cost for each level', () => {
    const r = runEstimateDuration({ level: 'L3' });
    expect(r.level).toBe('L3');
    expect(r.durationSec).toBeGreaterThan(0);
  });
});

describe('runAskUser', () => {
  it('returns deferred when no broker is configured', async () => {
    const r = await runAskUser({ question: 'Which style?' });
    expect(r.status).toBe('deferred');
  });

  it('awaits the broker answer when one is provided', async () => {
    const r = await runAskUser(
      { question: 'L1 or L3?', options: ['L1', 'L3'] },
      {
        broker: {
          ask: async (args) => ({ status: 'answered', choice: args.options?.[1] }),
        },
        timeoutMs: 1000,
      },
    );
    expect(r.status).toBe('answered');
    if (r.status === 'answered') {
      expect(r.choice).toBe('L3');
    }
  });

  it('returns dismissed when the broker throws', async () => {
    const r = await runAskUser(
      { question: 'anything' },
      {
        broker: {
          ask: async () => {
            throw new Error('timeout');
          },
        },
        timeoutMs: 1000,
      },
    );
    expect(r.status).toBe('dismissed');
  });
});
