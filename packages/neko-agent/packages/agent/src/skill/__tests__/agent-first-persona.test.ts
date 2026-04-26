import { describe, expect, it } from 'vitest';
import { creationPersonaSkill } from '../builtins/creation-persona';
import { executionPersonaSkill } from '../builtins/execution-persona';

describe('Agent-first persona guidance', () => {
  it('adds Observation and Rationale sections to creation persona', () => {
    expect(creationPersonaSkill.content).toContain('## Observation');
    expect(creationPersonaSkill.content).toContain('## Rationale');
    expect(creationPersonaSkill.content).toContain(
      'tools, QualityReview, memory, user feedback, and subagents',
    );
    expect(creationPersonaSkill.content).toContain('evidence providers, not replacements');
  });

  it('adds operation rationale guidance to execution persona', () => {
    expect(executionPersonaSkill.content).toContain('## Observation');
    expect(executionPersonaSkill.content).toContain('## Rationale');
    expect(executionPersonaSkill.content).toContain('Every operation and recovery step');
    expect(executionPersonaSkill.content).toContain('## Recovery Guidance');
    expect(executionPersonaSkill.content).toContain('## Ask User When');
    expect(executionPersonaSkill.content).toContain('Do not create PipelineAction, partialRerun');
    expect(executionPersonaSkill.content).toContain('directly decide a');
    expect(executionPersonaSkill.content).toContain('returns evidence / recommendation only');
  });
});
