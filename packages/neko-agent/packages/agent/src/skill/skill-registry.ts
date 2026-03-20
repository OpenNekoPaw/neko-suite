/**
 * Skill Registry - Unified storage for skills
 *
 * Skills with a `command` field are also accessible as slash commands.
 * No separate SlashCommand type needed.
 */

import type { Skill, ISkillRegistry } from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('SkillRegistry');

/**
 * Skill registry implementation
 */
export class SkillRegistry implements ISkillRegistry {
  /** Skills indexed by name */
  private skills: Map<string, Skill> = new Map();

  // ===========================================================================
  // Skill Operations
  // ===========================================================================

  registerSkill(skill: Skill): void {
    if (!skill.name) {
      throw new Error('Skill must have a name');
    }

    if (this.skills.has(skill.name)) {
      logger.warn('Skill already registered, overwriting', { skillName: skill.name });
    }

    this.skills.set(skill.name, skill);
  }

  unregisterSkill(name: string): void {
    this.skills.delete(name);
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  listSkills(): Skill[] {
    return Array.from(this.skills.values()).filter((s) => s.enabled);
  }

  listAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Find a skill by its slash command trigger name.
   * Only returns skills that have the `command` field set.
   */
  getSkillByCommand(commandName: string): Skill | undefined {
    const normalized = commandName.startsWith('/') ? commandName.slice(1) : commandName;
    for (const skill of this.skills.values()) {
      if (skill.command === normalized && skill.enabled !== false) {
        return skill;
      }
    }
    return undefined;
  }

  searchSkills(keyword: string): Skill[] {
    const lower = keyword.toLowerCase();
    return this.listSkills().filter(
      (s) => s.name.toLowerCase().includes(lower) || s.description.toLowerCase().includes(lower),
    );
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  get skillCount(): number {
    return this.skills.size;
  }

  clear(): void {
    this.skills.clear();
  }
}
