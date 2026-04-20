/**
 * FlowBinding Tests
 *
 * Covers:
 * - Initial persona applied on syncInitial()
 * - Transition swaps persona Skill via coordinator
 * - Missing persona skill is logged + skipped (no wipe)
 * - dispose() stops further swaps
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Skill, SkillInjection, ISkillRegistry } from '@neko/shared';
import { createFlowBinding } from '../flow-binding';
import { FlowSwitcher } from '../flow-switcher';

// Minimal Skill stub — the binding only reads `name` indirectly via the
// registry and hands the whole object to the service, so field completeness
// matters less than identity.
function skillStub(name: string): Skill {
  return {
    name,
    description: `${name} persona`,
    type: 'skill',
    source: 'builtin',
    allowedTools: [],
    content: `# ${name}\n`,
  } as unknown as Skill;
}

function makeRegistry(skills: Skill[]): ISkillRegistry {
  const map = new Map(skills.map((s) => [s.name, s]));
  return {
    getSkill: (name: string) => map.get(name),
    listSkills: () => [...map.values()],
    getSkillByCommand: () => undefined,
    skillCount: map.size,
  } as unknown as ISkillRegistry;
}

function makeService(): { apply: ReturnType<typeof vi.fn> } {
  const apply = vi.fn(async (skill: Skill) => ({
    name: skill.name,
    systemPrompt: `prompt:${skill.name}`,
    allowedTools: [],
  })) as unknown as (skill: Skill) => Promise<SkillInjection>;
  return { apply } as unknown as { apply: ReturnType<typeof vi.fn> };
}

function makeCoordinator(): { apply: ReturnType<typeof vi.fn> } {
  return { apply: vi.fn() };
}

describe('FlowBinding', () => {
  let switcher: FlowSwitcher;

  beforeEach(() => {
    switcher = new FlowSwitcher({ now: () => 0 });
  });

  it('syncInitial applies the creation persona on a fresh session', async () => {
    const creation = skillStub('flow-creation');
    const execution = skillStub('flow-execution');
    const service = makeService();
    const coord = makeCoordinator();

    const binding = createFlowBinding({
      flowSwitcher: switcher,
      skillRegistry: makeRegistry([creation, execution]),
      skillService: service as never,
      coordinator: coord as never,
    });

    await binding.syncInitial();

    expect(service.apply).toHaveBeenCalledTimes(1);
    expect(service.apply).toHaveBeenCalledWith(creation);
    expect(coord.apply).toHaveBeenCalledTimes(1);
    expect(coord.apply.mock.calls[0][0]).toMatchObject({ name: 'flow-creation' });
    expect(coord.apply.mock.calls[0][1]).toBe(creation);
    expect(binding.getActivePersona()).toBe('creation');
  });

  it('transition to execution swaps the persona via coordinator', async () => {
    const creation = skillStub('flow-creation');
    const execution = skillStub('flow-execution');
    const service = makeService();
    const coord = makeCoordinator();

    const binding = createFlowBinding({
      flowSwitcher: switcher,
      skillRegistry: makeRegistry([creation, execution]),
      skillService: service as never,
      coordinator: coord as never,
    });

    await binding.syncInitial();
    coord.apply.mockClear();
    service.apply.mockClear();

    const changed = switcher.onApplyTriggered();
    expect(changed).toBe(true);

    // The transition listener is async — wait a microtask tick.
    await new Promise((r) => setImmediate(r));

    expect(service.apply).toHaveBeenCalledWith(execution);
    expect(coord.apply).toHaveBeenCalledTimes(1);
    expect(coord.apply.mock.calls[0][0]).toMatchObject({ name: 'flow-execution' });
    expect(binding.getActivePersona()).toBe('execution');
  });

  it('missing persona skill logs + skips without throwing', async () => {
    // Registry has only creation; executing a transition to execution
    // should not throw and should not call coordinator.apply again.
    const creation = skillStub('flow-creation');
    const service = makeService();
    const coord = makeCoordinator();

    const binding = createFlowBinding({
      flowSwitcher: switcher,
      skillRegistry: makeRegistry([creation]),
      skillService: service as never,
      coordinator: coord as never,
    });

    await binding.syncInitial();
    coord.apply.mockClear();

    switcher.onApplyTriggered();
    await new Promise((r) => setImmediate(r));

    expect(coord.apply).not.toHaveBeenCalled();
    // Previous persona still reported as active (no wipe).
    expect(binding.getActivePersona()).toBe('creation');
  });

  it('dispose unsubscribes; subsequent transitions are ignored', async () => {
    const creation = skillStub('flow-creation');
    const execution = skillStub('flow-execution');
    const service = makeService();
    const coord = makeCoordinator();

    const binding = createFlowBinding({
      flowSwitcher: switcher,
      skillRegistry: makeRegistry([creation, execution]),
      skillService: service as never,
      coordinator: coord as never,
    });

    await binding.syncInitial();
    binding.dispose();

    coord.apply.mockClear();
    switcher.onApplyTriggered();
    await new Promise((r) => setImmediate(r));

    expect(coord.apply).not.toHaveBeenCalled();
  });

  it('dispose is idempotent', () => {
    const binding = createFlowBinding({
      flowSwitcher: switcher,
      skillRegistry: makeRegistry([]),
      skillService: makeService() as never,
      coordinator: makeCoordinator() as never,
    });
    expect(() => {
      binding.dispose();
      binding.dispose();
    }).not.toThrow();
  });
});
