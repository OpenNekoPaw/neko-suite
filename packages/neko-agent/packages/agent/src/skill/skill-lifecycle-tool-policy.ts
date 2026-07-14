import type { SkillInjection, SkillLifecycleSlot } from '@neko/shared';

export interface SkillLifecycleToolPolicyInput {
  readonly slot: SkillLifecycleSlot;
  readonly injection: SkillInjection;
}

export function contributesExecutableToolRestriction(
  input: SkillLifecycleToolPolicyInput,
): boolean {
  return input.slot !== 'referenceSkill' && (input.injection.allowedTools?.length ?? 0) > 0;
}

export function intersectAllowedToolPolicies(
  inputs: readonly SkillLifecycleToolPolicyInput[],
): readonly string[] {
  const restricted = inputs.filter(contributesExecutableToolRestriction);
  const first = restricted[0];
  if (!first) {
    return [];
  }

  let allowed = new Set(first.injection.allowedTools ?? []);
  for (const input of restricted.slice(1)) {
    const next = new Set(input.injection.allowedTools ?? []);
    allowed = new Set([...allowed].filter((tool) => next.has(tool)));
  }
  return [...allowed].sort();
}
