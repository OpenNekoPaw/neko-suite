/**
 * Golden snapshot tests — captures the final composed system prompt for a fixed
 * set of scenarios. Purpose: detect unintended drift in Stage B (skill module
 * migration) and Stage C (base prompt cleanup).
 *
 * Scenarios cover:
 *  - default EN base, no skill active
 *  - default ZH base, no skill active
 *  - EN base with creation-persona skill active
 *  - EN base with execution-persona skill active
 *  - Plan mode EN
 *
 * When expected changes happen (e.g. Stage C strips identity from base), update
 * the snapshots AFTER human review that the diff matches the intended deletion.
 */
import { describe, it, expect } from 'vitest';
import { SystemPromptComposer } from '../system-prompt-composer';
import {
  BUILTIN_DEFAULT_PROMPT_EN,
  BUILTIN_DEFAULT_PROMPT_ZH,
  BUILTIN_PLAN_PROMPT_EN,
} from '../builtin-prompts';
import { creationPersonaSkill } from '../../skill/builtins/creation-persona';
import { executionPersonaSkill } from '../../skill/builtins/execution-persona';

function composeBaseOnly(base: string): string {
  const composer = new SystemPromptComposer();
  composer.setBase(base);
  return composer.compose();
}

function composeBaseWithSkill(base: string, skillName: string, skillContent: string): string {
  const composer = new SystemPromptComposer();
  composer.setBase(base);
  composer.setSection({
    id: `skill:${skillName}`,
    layer: 'skill',
    content: skillContent,
    priority: 50,
  });
  return composer.compose();
}

describe('prompt golden snapshots', () => {
  it('default EN base (no skill)', () => {
    expect(composeBaseOnly(BUILTIN_DEFAULT_PROMPT_EN)).toMatchSnapshot();
  });

  it('default ZH base (no skill)', () => {
    expect(composeBaseOnly(BUILTIN_DEFAULT_PROMPT_ZH)).toMatchSnapshot();
  });

  it('plan mode EN base', () => {
    expect(composeBaseOnly(BUILTIN_PLAN_PROMPT_EN)).toMatchSnapshot();
  });

  it('EN base + creation-persona active', () => {
    expect(
      composeBaseWithSkill(
        BUILTIN_DEFAULT_PROMPT_EN,
        creationPersonaSkill.name,
        creationPersonaSkill.content,
      ),
    ).toMatchSnapshot();
  });

  it('EN base + execution-persona active', () => {
    expect(
      composeBaseWithSkill(
        BUILTIN_DEFAULT_PROMPT_EN,
        executionPersonaSkill.name,
        executionPersonaSkill.content,
      ),
    ).toMatchSnapshot();
  });

  // PR3b: AGENTS.md overlays into the environment layer instead of
  // replacing the base. This snapshot documents the composed output when a
  // user-authored project-level AGENTS.md is present.
  it('EN base + AGENTS.md overlay (environment layer)', () => {
    const composer = new SystemPromptComposer();
    composer.setBase(BUILTIN_DEFAULT_PROMPT_EN);
    composer.setSection({
      id: 'agents-md:override',
      layer: 'environment',
      content: '# Project Overrides\n\nUse TypeScript strict mode.\nPrefer functional composition.',
      priority: 80,
    });
    expect(composer.compose()).toMatchSnapshot();
  });
});
