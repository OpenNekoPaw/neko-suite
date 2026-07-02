import { describe, expect, it, vi } from 'vitest';
import type { Skill, SkillInjection } from '@neko/shared';
import { createStageTracker } from '../stage-tracker';
import { createStagePersonaBinding } from '../stage-persona-binding';
import { SkillLifecycleRuntime } from '../skill-lifecycle-runtime';
import type { SkillService } from '../skill-service';

describe('StagePersonaBinding lifecycle mode', () => {
  it('creates and expires IDC-owned stage persona lifecycle records', async () => {
    const creationPersona = createSkill('creation-persona');
    const executionPersona = createSkill('execution-persona');
    const skillService = createSkillService([creationPersona, executionPersona]);
    const lifecycleRuntime = new SkillLifecycleRuntime({
      skillService: skillService as unknown as SkillService,
      now: () => 100,
    });
    const tracker = createStageTracker();
    const binding = createStagePersonaBinding({
      stageTracker: tracker,
      skillRegistry: skillService.registry as SkillService['registry'],
      skillService: skillService as unknown as SkillService,
      lifecycleRuntime,
      getRunId: () => 'run-1',
      getConversationId: () => 'conv-1',
    });

    tracker.enter('draft');
    await Promise.resolve();

    const draftRecords = lifecycleRuntime.list('conv-1');
    expect(draftRecords).toEqual([
      expect.objectContaining({
        skillName: 'creation-persona',
        slot: 'stagePersona',
        owner: 'creation-profile',
        lifetime: { kind: 'creation-stage', runId: 'run-1', stage: 'draft' },
        deactivation: expect.objectContaining({
          clearableByUser: false,
          clearableByRuntime: true,
        }),
      }),
    ]);

    tracker.enter('plan');
    await Promise.resolve();

    const planRecords = lifecycleRuntime.list('conv-1');
    expect(planRecords).toEqual([
      expect.objectContaining({
        skillName: 'creation-persona',
        lifetime: { kind: 'creation-stage', runId: 'run-1', stage: 'plan' },
      }),
    ]);
    expect(planRecords[0]?.id).not.toBe(draftRecords[0]?.id);

    tracker.enter('apply');
    await Promise.resolve();

    expect(lifecycleRuntime.list('conv-1').map((record) => record.skillName)).toEqual([
      'execution-persona',
    ]);
    expect(skillService.apply).toHaveBeenCalledWith(executionPersona);
    binding.dispose();
  });
});

function createSkill(name: string): Skill {
  return {
    name,
    description: `${name} skill`,
    content: `${name} prompt`,
    source: 'builtin',
    enabled: true,
  };
}

function createSkillService(skills: readonly Skill[]) {
  return {
    registry: {
      getSkill: vi.fn((name: string) => skills.find((skill) => skill.name === name)),
      getSkillByCommand: vi.fn(),
      ensureLoaded: vi.fn(async (name: string) => skills.find((skill) => skill.name === name)),
      listSkills: vi.fn(() => skills),
    },
    apply: vi.fn(async (skill: Skill): Promise<SkillInjection> => ({
      name: skill.name,
      systemPrompt: skill.content,
      type: 'skill',
      allowedTools: skill.allowedTools,
    })),
  };
}
