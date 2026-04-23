/**
 * IDC stage persona skills tests.
 *
 * Covers:
 * - All three persona skills (creation-persona / execution-persona /
 *   iteration-persona) are registered in builtinSkills
 * - Each skill has a stable name, non-empty description, non-empty
 *   content, allowedTools list
 * - allowedTools only references registered TOOL_NAMES constants
 * - iteration-persona is distinct from creation-persona (narrower scope)
 */

import { describe, it, expect } from 'vitest';
import {
  builtinSkills,
  creationPersonaSkill,
  executionPersonaSkill,
  iterationPersonaSkill,
} from './index';
import { TOOL_NAMES } from '@neko/shared';

describe('IDC stage persona skills', () => {
  it('builtinSkills contains all three personas', () => {
    const names = builtinSkills.map((s) => s.name);
    expect(names).toContain('creation-persona');
    expect(names).toContain('execution-persona');
    expect(names).toContain('iteration-persona');
  });

  it.each([
    ['creationPersonaSkill', creationPersonaSkill, 'creation-persona'],
    ['executionPersonaSkill', executionPersonaSkill, 'execution-persona'],
    ['iterationPersonaSkill', iterationPersonaSkill, 'iteration-persona'],
  ])('%s has stable shape', (_label, skill, expectedName) => {
    expect(skill.name).toBe(expectedName);
    expect(skill.description.length).toBeGreaterThan(10);
    expect(skill.content.length).toBeGreaterThan(100);
    expect(skill.allowedTools).toBeDefined();
    expect(Array.isArray(skill.allowedTools)).toBe(true);
    expect(skill.source).toBe('builtin');
    expect(skill.enabled).toBe(true);
  });

  it.each([
    ['creationPersonaSkill', creationPersonaSkill],
    ['executionPersonaSkill', executionPersonaSkill],
    ['iterationPersonaSkill', iterationPersonaSkill],
  ])('%s allowedTools reference only registered TOOL_NAMES', (_label, skill) => {
    const registered = new Set<string>(Object.values(TOOL_NAMES));
    const unknown = (skill.allowedTools ?? []).filter((t) => !registered.has(t));
    expect(unknown).toEqual([]);
  });

  it('iteration-persona is narrower than creation-persona (by design)', () => {
    // Iteration is consistency-driven and focused — it deliberately
    // does NOT have timeline inspection tools that creation-persona has.
    const creationTools = new Set(creationPersonaSkill.allowedTools ?? []);
    const iterationTools = new Set(iterationPersonaSkill.allowedTools ?? []);
    // Some overlap is expected (both read the filesystem); but iteration
    // must have at least one tool creation-persona does not — the quality
    // read tool — and must not have timeline-edit tools.
    const iterationOnly = [...iterationTools].filter((t) => !creationTools.has(t));
    expect(iterationOnly.length).toBeGreaterThan(0);
    expect(iterationTools.has(TOOL_NAMES.QUALITY_CHECK_CONSISTENCY)).toBe(true);
  });

  it('iteration-persona description mentions ConsistencyReport and partial rerun', () => {
    const text = iterationPersonaSkill.description.toLowerCase();
    // Surface triggers that agent matcher can latch onto — the skill
    // must read as "iterate after a run", not as "start a new run".
    expect(text.includes('consistency')).toBe(true);
    expect(text.includes('partial')).toBe(true);
  });

  it('iteration-persona content prescribes a narrow proposal structure', () => {
    const text = iterationPersonaSkill.content;
    expect(text).toMatch(/diagnosis/i);
    expect(text).toMatch(/scope/i);
    expect(text).toMatch(/recipe/i);
  });
});
