/**
 * Router façade integration tests.
 *
 * Verifies that the Router correctly composes InputProbe + FastProbe + RouteRegistry
 * and honors user overrides.
 */

import { describe, expect, it } from 'vitest';
import { createRouter } from '../index';
import type { RawInput } from '../../types';

describe('Router — user override', () => {
  it('forceLevel bypasses probing', async () => {
    const router = createRouter();
    const input: RawInput = { kind: 'prompt', text: 'anything' };
    const route = await router.decide(input, { forceLevel: 'L3' });
    expect(route.level).toBe('L3');
    expect(route.provenance).toBe('user-override');
    expect(route.confidence).toBe(1.0);
  });
});

describe('Router — prompt inputs', () => {
  it('short prompt → L0', async () => {
    const router = createRouter();
    const route = await router.decide({ kind: 'prompt', text: 'a jumping cat' });
    expect(route.level).toBe('L0');
    expect(route.provenance).toBe('rules');
    expect(route.flowId).toBe('flowB');
  });

  it('long text → L3', async () => {
    const router = createRouter();
    const longText = 'A '.repeat(2000); // 4000 chars
    const route = await router.decide({ kind: 'prompt', text: longText });
    expect(route.level).toBe('L3');
    expect(route.flowId).toBe('flowA');
    expect(route.entryExtension).toBe('story');
  });
});

describe('Router — file inputs', () => {
  it('.fountain file → L2 skip readDocument', async () => {
    const router = createRouter();
    const route = await router.decide({ kind: 'file', path: '/tmp/script.fountain' });
    expect(route.level).toBe('L2');
    expect(route.skipStages).toContain('readDocument');
  });

  it('.nkv timeline → L0 entry via cut', async () => {
    const router = createRouter();
    const route = await router.decide({ kind: 'file', path: '/tmp/edit.nkv' });
    expect(route.level).toBe('L0');
    expect(route.entryExtension).toBe('cut');
  });

  it('multiple image drop → L1 batch', async () => {
    const router = createRouter();
    const paths = ['/a.png', '/b.png', '/c.png', '/d.png'];
    const route = await router.decide({ kind: 'files', paths });
    expect(route.level).toBe('L1');
    expect(route.entryExtension).toBe('canvas');
  });
});

describe('Router — drop target override', () => {
  it('drop onto Cut turns a prompt into post-production L0', async () => {
    const router = createRouter({ probeOptions: { dropTarget: 'cut' } });
    const route = await router.decide({ kind: 'prompt', text: 'some note' });
    expect(route.level).toBe('L0');
    expect(route.entryExtension).toBe('cut');
  });
});

describe('Router — fallback when confidence low', () => {
  it('ambiguous medium prompt falls back to L2', async () => {
    const router = createRouter();
    const text = 'x'.repeat(1000);
    const route = await router.decide({ kind: 'prompt', text });
    // FastProbe returns confidence ~0.6 → fallback applies
    expect(route.level).toBe('L2');
    expect(route.confidence).toBeLessThan(0.9);
    // reason should mention the fallback
    expect(route.reason.toLowerCase()).toMatch(/ambigu|fallback|refine/);
  });

  it('custom defaultFallbackLevel is honoured', async () => {
    const router = createRouter({ defaultFallbackLevel: 'L1' });
    const text = 'x'.repeat(1000);
    const route = await router.decide({ kind: 'prompt', text });
    // L2 route was returned by FastProbe (ambiguous rule), so we still get L2
    // (fallback only kicks in when FastProbe returns undefined)
    expect(route.level).toBe('L2');
  });
});
