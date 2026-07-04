/**
 * Builtin skills runtime registration.
 *
 * Static builtin skill and tool group definitions live in @neko-agent/skills.
 * The Agent package owns registration into runtime registries.
 */

import type { ISkillRegistry, IToolGroupRegistry } from '@neko/shared';
import {
  builtinToolGroups,
  getBuiltinSkills,
  type BuiltinSkillOptions,
} from '@neko-agent/skills';

export * from '@neko-agent/skills';

export function registerBuiltins(
  registry: ISkillRegistry,
  options: BuiltinSkillOptions = {},
): void {
  for (const skill of getBuiltinSkills(options)) {
    registry.registerSkill(skill);
  }
}

export function registerBuiltinToolGroups(registry: IToolGroupRegistry): void {
  for (const group of builtinToolGroups) {
    registry.register(group);
  }
}
