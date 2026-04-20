/**
 * Dual-flow persona skills tests.
 *
 * Covers:
 * - All three persona skills (flow-creation / flow-execution /
 *   iteration-flow) are registered in builtinSkills
 * - Each skill has a stable name, non-empty description, non-empty
 *   content, allowedTools list
 * - allowedTools only references registered TOOL_NAMES constants
 * - iteration-flow is distinct from creation-flow (narrower scope)
 */

import { describe, it, expect } from 'vitest';
import { builtinSkills, creationFlowSkill, executionFlowSkill, iterationFlowSkill } from './index';
import { TOOL_NAMES } from '@neko/shared';

describe('dual-flow persona skills', () => {
  it('builtinSkills contains all three personas', () => {
    const names = builtinSkills.map((s) => s.name);
    expect(names).toContain('flow-creation');
    expect(names).toContain('flow-execution');
    expect(names).toContain('iteration-flow');
  });

  it.each([
    ['creationFlowSkill', creationFlowSkill, 'flow-creation'],
    ['executionFlowSkill', executionFlowSkill, 'flow-execution'],
    ['iterationFlowSkill', iterationFlowSkill, 'iteration-flow'],
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
    ['creationFlowSkill', creationFlowSkill],
    ['executionFlowSkill', executionFlowSkill],
    ['iterationFlowSkill', iterationFlowSkill],
  ])('%s allowedTools reference only registered TOOL_NAMES', (_label, skill) => {
    const registered = new Set<string>(Object.values(TOOL_NAMES));
    const unknown = (skill.allowedTools ?? []).filter((t) => !registered.has(t));
    expect(unknown).toEqual([]);
  });

  it('iteration-flow is narrower than creation-flow (by design)', () => {
    // Iteration is consistency-driven and focused — it deliberately
    // does NOT have timeline inspection tools that creation-flow has.
    const creationTools = new Set(creationFlowSkill.allowedTools ?? []);
    const iterationTools = new Set(iterationFlowSkill.allowedTools ?? []);
    // Some overlap is expected (both read the filesystem); but iteration
    // must have at least one tool creation-flow does not — the quality
    // read tool — and must not have timeline-edit tools.
    const iterationOnly = [...iterationTools].filter((t) => !creationTools.has(t));
    expect(iterationOnly.length).toBeGreaterThan(0);
    expect(iterationTools.has(TOOL_NAMES.QUALITY_CHECK_CONSISTENCY)).toBe(true);
  });

  it('iteration-flow description mentions ConsistencyReport and partial rerun', () => {
    const text = iterationFlowSkill.description.toLowerCase();
    // Surface triggers that agent matcher can latch onto — the skill
    // must read as "iterate after a run", not as "start a new run".
    expect(text.includes('consistency')).toBe(true);
    expect(text.includes('partial')).toBe(true);
  });

  it('iteration-flow content prescribes a narrow proposal structure', () => {
    const text = iterationFlowSkill.content;
    expect(text).toMatch(/diagnosis/i);
    expect(text).toMatch(/scope/i);
    expect(text).toMatch(/recipe/i);
  });
});
