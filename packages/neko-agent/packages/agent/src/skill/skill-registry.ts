/**
 * Skill Registry - Unified storage for skills
 *
 * Skills with a `command` field are also accessible as slash commands.
 * No separate SlashCommand type needed.
 */

import type { Skill, ISkillRegistry } from '@neko/shared';
import type { LazySkill } from './lazy-loader';
import { getLogger } from '../utils/logger';

const logger = getLogger('SkillRegistry');

/**
 * Skill registry implementation
 *
 * Supports both eager and lazy skill registration:
 * - `registerSkill()`: Registers a fully-loaded skill (content available immediately)
 * - `registerLazySkill()`: Registers frontmatter-only skill (content loaded on demand)
 *
 * Both types are discoverable via `listSkills()` / `getSkill()`. Lazy skills have
 * empty `content` until `ensureLoaded()` is called.
 */
export class SkillRegistry implements ISkillRegistry {
  /** Skills indexed by name */
  private skills: Map<string, Skill> = new Map();

  /** Lazy skill loaders indexed by name (for deferred content loading) */
  private lazySkills: Map<string, LazySkill> = new Map();

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

    this.lazySkills.delete(skill.name);
    this.skills.set(skill.name, skill);
  }

  unregisterSkill(name: string): void {
    this.skills.delete(name);
    this.lazySkills.delete(name);
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
  // Lazy Skill Support (Tiered Loading)
  // ===========================================================================

  /**
   * Register a lazy skill (frontmatter only, content loaded on demand).
   * Creates a lightweight Skill placeholder discoverable via listSkills/getSkill.
   */
  registerLazySkill(lazySkill: LazySkill): void {
    this.lazySkills.set(lazySkill.name, lazySkill);

    // Register lightweight placeholder in the main skills map
    this.skills.set(lazySkill.name, {
      name: lazySkill.name,
      description: lazySkill.description,
      content: '', // placeholder — loaded on demand via ensureLoaded()
      source: lazySkill.source,
      enabled: true,
      icon: lazySkill.icon,
      directoryPath: lazySkill.directoryPath,
    });
  }

  /**
   * Ensure a skill's content is fully loaded. For lazy skills, triggers
   * the deferred content load. For eager skills, returns immediately.
   *
   * @returns The fully-loaded Skill, or undefined if not found
   */
  async ensureLoaded(name: string): Promise<Skill | undefined> {
    const lazy = this.lazySkills.get(name);
    if (lazy && !lazy.isLoaded) {
      try {
        const fullSkill = await lazy.loadContent();
        this.skills.set(name, fullSkill);
        logger.info('Lazy skill loaded', { name });
        return fullSkill;
      } catch (error) {
        logger.error('Failed to load lazy skill content', { name, error });
        return this.skills.get(name); // return placeholder
      }
    }
    return this.skills.get(name);
  }

  /**
   * Check if a skill is lazy (content not yet loaded).
   */
  isLazy(name: string): boolean {
    const lazy = this.lazySkills.get(name);
    return lazy !== undefined && !lazy.isLoaded;
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  get skillCount(): number {
    return this.skills.size;
  }

  clear(): void {
    this.skills.clear();
    this.lazySkills.clear();
  }
}
