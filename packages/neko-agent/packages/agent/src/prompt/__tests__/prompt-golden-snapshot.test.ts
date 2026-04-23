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
import { ArtifactSchemaModule } from '../modules/schema/artifact-schema-module';
import { freezePromptContext } from '../context';

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

  // PR3c: creation-persona + ArtifactSchemaModule combined. Proves the
  // schema extraction is content-equivalent to the pre-PR3c monolithic
  // persona (the schema section now lives on the schema layer between
  // base and skill, the persona covers only creative behaviour).
  it('EN base + creation-persona + schema layer (runId=tiktok-001)', () => {
    const composer = new SystemPromptComposer();
    composer.setBase(BUILTIN_DEFAULT_PROMPT_EN);

    // Schema layer injected by ArtifactSchemaModule (simulated — at
    // runtime the session-level wiring in PR3d will drive this).
    const schemaModule = new ArtifactSchemaModule();
    const ctx = freezePromptContext({
      runId: 'tiktok-001',
      stage: null,
      locale: 'en',
      projectPath: '',
      activeSkillName: null,
      activeTools: [],
    });
    const schemaSections = schemaModule.renderSync(ctx) ?? [];
    for (const s of schemaSections) {
      composer.setSection({
        id: s.sectionId,
        layer: s.layer,
        content: s.content,
        priority: s.priority ?? 50,
      });
    }

    // Skill layer: creation-persona post-extraction (no schema inline).
    composer.setSection({
      id: `skill:${creationPersonaSkill.name}`,
      layer: 'skill',
      content: creationPersonaSkill.content,
      priority: 50,
    });

    expect(composer.compose()).toMatchSnapshot();
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
