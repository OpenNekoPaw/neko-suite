/**
 * capabilityKindOf / safeCapabilityKindOf tests (ADR §5.1 §5.3).
 */

import { describe, it, expect } from 'vitest';
import { capabilityKindOf, safeCapabilityKindOf } from '@neko-agent/types';

describe('capabilityKindOf', () => {
  it('classifies a Skill-shaped object as "skill"', () => {
    const skill = { name: 'writer', content: '# prompt body' };
    expect(capabilityKindOf(skill)).toBe('skill');
  });

  it('classifies a non-destructive Tool as "tool"', () => {
    const tool = {
      name: 'Read',
      parameters: { type: 'object' },
      execute: () => {},
      isDestructive: false,
    };
    expect(capabilityKindOf(tool)).toBe('tool');
  });

  it('classifies a tool with isDestructive=true as "operation"', () => {
    const op = {
      name: 'DeleteTimelineElement',
      parameters: { type: 'object' },
      execute: () => {},
      isDestructive: true,
    };
    expect(capabilityKindOf(op)).toBe('operation');
  });

  it('treats missing isDestructive as tool (fail-closed default)', () => {
    const tool = {
      name: 'GenerateImage',
      parameters: { type: 'object' },
      execute: () => {},
    };
    expect(capabilityKindOf(tool)).toBe('tool');
  });

  it('skill classification wins when an object looks like both', () => {
    // Pathological: something with both content (Skill) and execute (Tool).
    // Skill discriminant comes first.
    const odd = {
      name: 'odd',
      content: '# skill content',
      parameters: {},
      execute: () => {},
    };
    expect(capabilityKindOf(odd)).toBe('skill');
  });

  it('throws when input matches neither shape', () => {
    expect(() =>
      capabilityKindOf({ name: 'nothing' } as unknown as Parameters<typeof capabilityKindOf>[0]),
    ).toThrow(/does not look like a Skill or Tool/);
  });
});

describe('safeCapabilityKindOf', () => {
  it('returns the kind for skill / tool / operation', () => {
    expect(safeCapabilityKindOf({ name: 's', content: '' })).toBe('skill');
    expect(safeCapabilityKindOf({ name: 't', parameters: {}, execute: () => {} })).toBe('tool');
    expect(
      safeCapabilityKindOf({
        name: 'o',
        parameters: {},
        execute: () => {},
        isDestructive: true,
      }),
    ).toBe('operation');
  });

  it('returns null for unknown shapes instead of throwing', () => {
    expect(safeCapabilityKindOf(null)).toBeNull();
    expect(safeCapabilityKindOf(undefined)).toBeNull();
    expect(safeCapabilityKindOf('string')).toBeNull();
    expect(safeCapabilityKindOf(42)).toBeNull();
    expect(safeCapabilityKindOf({})).toBeNull();
    expect(safeCapabilityKindOf({ name: 'no-shape' })).toBeNull();
  });
});
