/**
 * FastProbe rule-table tests.
 *
 * Each rule in the FastProbe table is covered by at least one test. Tests here
 * are deterministic (no I/O, no LLM) — FastProbe is a pure function.
 */

import { describe, expect, it } from 'vitest';
import { fastProbe, isCommittable, __internal } from '../fast-probe';
import type { ProbeContext, RawInput } from '../../types';

// =============================================================================
// Helpers
// =============================================================================

function ctx(
  overrides: Partial<ProbeContext> & { inputType: ProbeContext['inputType'] },
): ProbeContext {
  const fakeRaw: RawInput = { kind: 'prompt', text: '' };
  return {
    raw: fakeRaw,
    ...overrides,
  };
}

// =============================================================================
// Prompt-based rules
// =============================================================================

describe('FastProbe — prompt rules', () => {
  it('short prompt (<200) → L0 high confidence', () => {
    const r = fastProbe(ctx({ inputType: 'prompt', textLength: 42 }));
    expect(r.route).toBe('L0');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    expect(r.entryExtension).toBe('agent');
    expect(r.skipStages).toContain('arrangeOnTimeline');
    expect(isCommittable(r)).toBe(true);
  });

  it('prompt at boundary 199 → still L0', () => {
    const r = fastProbe(ctx({ inputType: 'prompt', textLength: 199 }));
    expect(r.route).toBe('L0');
  });

  it('prompt at 200 → L1 (medium)', () => {
    const r = fastProbe(ctx({ inputType: 'prompt', textLength: 200 }));
    expect(r.route).toBe('L1');
  });

  it('medium prompt (~400 chars) → L1', () => {
    const r = fastProbe(ctx({ inputType: 'prompt', textLength: 400 }));
    expect(r.route).toBe('L1');
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it('ambiguous medium-long (500..2000) → L2 low confidence', () => {
    const r = fastProbe(ctx({ inputType: 'prompt', textLength: 1200 }));
    expect(r.route).toBe('L2');
    expect(r.confidence).toBeLessThan(0.9);
    expect(isCommittable(r)).toBe(false);
  });

  it('long text (≥2000) → L3', () => {
    const r = fastProbe(ctx({ inputType: 'text', textLength: 3200 }));
    expect(r.route).toBe('L3');
    expect(r.entryExtension).toBe('story');
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it('prompt without textLength falls through to default', () => {
    const r = fastProbe(ctx({ inputType: 'prompt' }));
    // textLength = 0 → treated as < L0_MAX_LEN → L0
    expect(r.route).toBe('L0');
  });
});

// =============================================================================
// File-based rules
// =============================================================================

describe('FastProbe — file extension rules', () => {
  it('.fountain script → L2 skip readDocument', () => {
    const r = fastProbe(ctx({ inputType: 'file', fileExt: 'fountain' }));
    expect(r.route).toBe('L2');
    expect(r.skipStages).toContain('readDocument');
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('.nkc canvas → L2 starts from canvas', () => {
    const r = fastProbe(ctx({ inputType: 'file', fileExt: 'nkc' }));
    expect(r.route).toBe('L2');
    expect(r.entryExtension).toBe('canvas');
    expect(r.skipStages).toEqual(expect.arrayContaining(['readDocument', 'parseStoryboard']));
  });

  it('.nkv timeline → L0 post-production only', () => {
    const r = fastProbe(ctx({ inputType: 'file', fileExt: 'nkv' }));
    expect(r.route).toBe('L0');
    expect(r.entryExtension).toBe('cut');
    expect(r.skipStages).toEqual(expect.arrayContaining(['batchGenerate']));
  });

  it('.nks script → L3 skip readDocument', () => {
    const r = fastProbe(ctx({ inputType: 'file', fileExt: 'nks' }));
    expect(r.route).toBe('L3');
    expect(r.skipStages).toContain('readDocument');
  });

  it('.txt / .md → L3 full pipeline', () => {
    const r1 = fastProbe(ctx({ inputType: 'file', fileExt: 'txt' }));
    const r2 = fastProbe(ctx({ inputType: 'file', fileExt: 'md' }));
    expect(r1.route).toBe('L3');
    expect(r2.route).toBe('L3');
  });

  it('.docx → L3', () => {
    const r = fastProbe(ctx({ inputType: 'file', fileExt: 'docx' }));
    expect(r.route).toBe('L3');
  });

  it('.nkpup (2D puppet) → L4', () => {
    const r = fastProbe(ctx({ inputType: 'file', fileExt: 'nkpup' }));
    expect(r.route).toBe('L4');
    expect(r.entryExtension).toBe('sketch');
  });

  it('.gltf (3D model) → L4 canvas entry', () => {
    const r = fastProbe(ctx({ inputType: 'file', fileExt: 'gltf' }));
    expect(r.route).toBe('L4');
    expect(r.entryExtension).toBe('canvas');
  });

  it('unknown extension → no high-conf rule fires (falls through)', () => {
    const r = fastProbe(ctx({ inputType: 'file', fileExt: 'xyz' }));
    expect(r.confidence).toBeLessThan(0.9);
  });
});

// =============================================================================
// Image batch rules
// =============================================================================

describe('FastProbe — image rules', () => {
  it('≥3 images → L1 batch', () => {
    const r = fastProbe(ctx({ inputType: 'images', fileExt: 'png', fileCount: 10 }));
    expect(r.route).toBe('L1');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    expect(r.entryExtension).toBe('canvas');
  });

  it('2 images → ambiguous, low confidence', () => {
    const r = fastProbe(ctx({ inputType: 'images', fileExt: 'png', fileCount: 2 }));
    expect(r.confidence).toBeLessThan(0.9);
  });

  it('single image file → ambiguous', () => {
    const r = fastProbe(ctx({ inputType: 'file', fileExt: 'jpg', fileCount: 1 }));
    expect(r.confidence).toBeLessThan(0.9);
  });
});

// =============================================================================
// Drop-target rules (explicit user intent trumps everything else)
// =============================================================================

describe('FastProbe — drop target rules', () => {
  it('drop on cut timeline → L0 post-production', () => {
    const r = fastProbe(ctx({ inputType: 'prompt', textLength: 5000, dropTarget: 'cut' }));
    expect(r.route).toBe('L0');
    expect(r.entryExtension).toBe('cut');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    // skipStages should include generation-heavy stages
    expect(r.skipStages).toEqual(expect.arrayContaining(['batchGenerate']));
  });

  it('drop on canvas → L2', () => {
    const r = fastProbe(ctx({ inputType: 'prompt', textLength: 30, dropTarget: 'canvas' }));
    expect(r.route).toBe('L2');
    expect(r.entryExtension).toBe('canvas');
  });

  it('drop on sketch → L4', () => {
    const r = fastProbe(ctx({ inputType: 'prompt', textLength: 30, dropTarget: 'sketch' }));
    expect(r.route).toBe('L4');
  });

  it('drop on story → L3', () => {
    const r = fastProbe(ctx({ inputType: 'prompt', textLength: 30, dropTarget: 'story' }));
    expect(r.route).toBe('L3');
  });

  it('drop target overrides text-length rules', () => {
    // Short prompt normally → L0, but drop target says cut
    const r = fastProbe(ctx({ inputType: 'prompt', textLength: 10, dropTarget: 'cut' }));
    expect(r.route).toBe('L0');
    expect(r.entryExtension).toBe('cut');
  });
});

// =============================================================================
// Project reference rules
// =============================================================================

describe('FastProbe — project rules', () => {
  it('project reference → highest confidence, route deferred', () => {
    const r = fastProbe(ctx({ inputType: 'project', existingProject: '/path/to/proj.nkproj' }));
    expect(r.confidence).toBeGreaterThanOrEqual(0.95);
    // Router must consult the .nkproj file for the actual workflow
    expect(r.route).toBeUndefined();
  });
});

// =============================================================================
// Fallback
// =============================================================================

describe('FastProbe — fallback', () => {
  it('no inputType info at all → low-confidence fallback', () => {
    // Force a context with a kind that has no rule (images but no ext, no count)
    const r = fastProbe(ctx({ inputType: 'images' }));
    expect(r.confidence).toBeLessThan(0.7);
  });
});

// =============================================================================
// Internal helpers
// =============================================================================

describe('FastProbe — classifyExt helper', () => {
  it('classifies common image extensions', () => {
    expect(__internal.classifyExt('png')).toBe('image');
    expect(__internal.classifyExt('JPG')).toBe('image');
    expect(__internal.classifyExt('webp')).toBe('image');
  });

  it('classifies neko formats', () => {
    expect(__internal.classifyExt('nkc')).toBe('canvas');
    expect(__internal.classifyExt('nkv')).toBe('timeline');
    expect(__internal.classifyExt('nks')).toBe('script');
    expect(__internal.classifyExt('nkproj')).toBe('project');
    expect(__internal.classifyExt('fountain')).toBe('fountain');
  });

  it('returns "unknown" for unrecognised ext', () => {
    expect(__internal.classifyExt('xyz')).toBe('unknown');
    expect(__internal.classifyExt(undefined)).toBe('unknown');
  });
});

describe('isCommittable predicate', () => {
  it('true when confidence ≥0.9 and route defined', () => {
    expect(isCommittable({ confidence: 0.95, route: 'L0', skipStages: [], reason: '' })).toBe(true);
  });

  it('false when route missing', () => {
    expect(isCommittable({ confidence: 0.99, skipStages: [], reason: '' })).toBe(false);
  });

  it('false when confidence low', () => {
    expect(isCommittable({ confidence: 0.7, route: 'L0', skipStages: [], reason: '' })).toBe(false);
  });
});
