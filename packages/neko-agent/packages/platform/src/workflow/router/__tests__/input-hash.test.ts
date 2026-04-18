import { describe, expect, it } from 'vitest';
import { hashInput } from '../input-hash';

describe('hashInput', () => {
  it('produces the same digest for identical inputs', () => {
    const a = hashInput({ kind: 'prompt', text: 'hello' });
    const b = hashInput({ kind: 'prompt', text: 'hello' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs when workDir changes', () => {
    const a = hashInput({ kind: 'prompt', text: 'hello' }, { workDir: '/a' });
    const b = hashInput({ kind: 'prompt', text: 'hello' }, { workDir: '/b' });
    expect(a).not.toBe(b);
  });

  it('is order-independent for multi-file inputs', () => {
    const a = hashInput({ kind: 'files', paths: ['/a', '/b', '/c'] });
    const b = hashInput({ kind: 'files', paths: ['/c', '/b', '/a'] });
    expect(a).toBe(b);
  });

  it('distinguishes kinds with the same string content', () => {
    const prompt = hashInput({ kind: 'prompt', text: '/tmp/x' });
    const file = hashInput({ kind: 'file', path: '/tmp/x' });
    expect(prompt).not.toBe(file);
  });

  it('truncates to requested byte length', () => {
    const full = hashInput({ kind: 'prompt', text: 'hi' });
    const short = hashInput({ kind: 'prompt', text: 'hi' }, { bytes: 8 });
    expect(short).toBe(full.slice(0, 8));
  });
});
