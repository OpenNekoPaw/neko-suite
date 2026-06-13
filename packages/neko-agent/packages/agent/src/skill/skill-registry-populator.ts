import type { Skill, SlashCommand } from '@neko/shared';
import { builtinSkills } from './builtins';
import { createCommandBackedSkill, createLazyCommandBackedSkill } from './command-backed-skill';
import type { LazyCommand, LazySkill } from './lazy-loader';
import { SkillRegistry } from './skill-registry';

export interface SkillRegistryScanGroup {
  readonly skills: readonly Skill[];
  readonly commands: readonly SlashCommand[];
}

export interface SkillRegistryScanResult {
  readonly personal: SkillRegistryScanGroup;
  readonly project: SkillRegistryScanGroup;
}

export interface LazySkillRegistryScanGroup {
  readonly skills: readonly LazySkill[];
  readonly commands: readonly LazyCommand[];
}

export interface LazySkillRegistryScanResult {
  readonly personal: LazySkillRegistryScanGroup;
  readonly project: LazySkillRegistryScanGroup;
}

export interface SkillRegistryPopulateInput {
  readonly registry: SkillRegistry;
  readonly scanResult: SkillRegistryScanResult;
  readonly builtinSkills?: readonly Skill[];
}

export interface LazySkillRegistryPopulateInput {
  readonly registry: SkillRegistry;
  readonly scanResult: LazySkillRegistryScanResult;
  readonly builtinSkills?: readonly Skill[];
}

export interface SkillRegistryPopulationSummary {
  readonly total: number;
  readonly builtin: number;
  readonly personal: number;
  readonly project: number;
  readonly personalCommands: number;
  readonly projectCommands: number;
}

export class SkillRegistryPopulator {
  private readonly managedDiskSkillNames = new Set<string>();
  private readonly managedDiskSkillRestores = new Map<string, Skill>();

  populate(input: SkillRegistryPopulateInput): SkillRegistryPopulationSummary {
    const builtins = input.builtinSkills ?? builtinSkills;
    this.ensureBuiltinSkills(input.registry, builtins);
    this.clearManagedDiskSkills(input.registry);

    const diskSkills = [
      ...input.scanResult.personal.skills,
      ...input.scanResult.project.skills,
      ...input.scanResult.personal.commands.map((command) => createCommandBackedSkill(command)),
      ...input.scanResult.project.commands.map((command) => createCommandBackedSkill(command)),
    ];

    for (const skill of diskSkills) {
      this.registerManagedSkill(input.registry, skill);
    }

    return {
      total: input.registry.skillCount,
      builtin: builtins.length,
      personal: input.scanResult.personal.skills.length,
      project: input.scanResult.project.skills.length,
      personalCommands: input.scanResult.personal.commands.length,
      projectCommands: input.scanResult.project.commands.length,
    };
  }

  populateLazy(input: LazySkillRegistryPopulateInput): SkillRegistryPopulationSummary {
    const builtins = input.builtinSkills ?? builtinSkills;
    this.ensureBuiltinSkills(input.registry, builtins);
    this.clearManagedDiskSkills(input.registry);

    const lazySkills = [
      ...input.scanResult.personal.skills,
      ...input.scanResult.project.skills,
      ...input.scanResult.personal.commands.map((command) => createLazyCommandBackedSkill(command)),
      ...input.scanResult.project.commands.map((command) => createLazyCommandBackedSkill(command)),
    ];

    for (const lazySkill of lazySkills) {
      this.registerManagedLazySkill(input.registry, lazySkill);
    }

    return {
      total: input.registry.skillCount,
      builtin: builtins.length,
      personal: input.scanResult.personal.skills.length,
      project: input.scanResult.project.skills.length,
      personalCommands: input.scanResult.personal.commands.length,
      projectCommands: input.scanResult.project.commands.length,
    };
  }

  private ensureBuiltinSkills(registry: SkillRegistry, builtins: readonly Skill[]): void {
    for (const skill of builtins) {
      if (!registry.getSkill(skill.name)) {
        registry.registerSkill({
          ...skill,
          source: 'builtin',
          enabled: true,
        });
      }
    }
  }

  private registerManagedSkill(registry: SkillRegistry, skill: Skill): void {
    this.rememberManagedSkillRestore(registry, skill.name);
    registry.registerSkill(skill);
    this.managedDiskSkillNames.add(skill.name);
  }

  private registerManagedLazySkill(registry: SkillRegistry, lazySkill: LazySkill): void {
    this.rememberManagedSkillRestore(registry, lazySkill.name);
    registry.registerLazySkill(lazySkill);
    this.managedDiskSkillNames.add(lazySkill.name);
  }

  private rememberManagedSkillRestore(registry: SkillRegistry, skillName: string): void {
    if (this.managedDiskSkillRestores.has(skillName)) {
      return;
    }

    const existing = registry.getSkill(skillName);
    if (existing) {
      this.managedDiskSkillRestores.set(skillName, existing);
    }
  }

  private clearManagedDiskSkills(registry: SkillRegistry): void {
    for (const skillName of this.managedDiskSkillNames) {
      const restoredSkill = this.managedDiskSkillRestores.get(skillName);
      if (restoredSkill) {
        registry.registerSkill(restoredSkill);
      } else {
        registry.unregisterSkill(skillName);
      }
    }

    this.managedDiskSkillNames.clear();
    this.managedDiskSkillRestores.clear();
  }
}
