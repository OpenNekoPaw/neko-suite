/**
 * Skill Registry - Unified storage for skills
 *
 * Command artifacts reuse the Skill runtime shape but are explicitly marked
 * with `entryPointKind: "command-artifact"` before they enter the slash
 * command namespace.
 */

import type { Skill, ISkillRegistry, SkillCatalogMeta } from '@neko/shared';
import type { LazySkill } from './lazy-loader';
import {
  projectSkillHostProjection,
  type SkillHostProjectionContextResolver,
} from './skill-host-projection';
import { getLogger } from '../utils/logger';

const logger = getLogger('SkillRegistry');

export interface SkillRegistryOptions {
  /** Trusted Host policy/availability resolver. Author package metadata is not consulted. */
  readonly resolveHostProjectionContext?: SkillHostProjectionContextResolver;
}

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

  constructor(private readonly options: SkillRegistryOptions = {}) {}

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
    this.skills.set(skill.name, this.projectRegisteredSkill(skill));
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
   * Find a command artifact by slash command trigger name.
   * Ordinary Skills may carry legacy `command` metadata during migration, but
   * they are invoked explicitly through `$skill` and are not returned here.
   */
  getSkillByCommand(commandName: string): Skill | undefined {
    const normalized = commandName.startsWith('/') ? commandName.slice(1) : commandName;
    for (const skill of this.skills.values()) {
      if (
        skill.entryPointKind === 'command-artifact' &&
        skill.command === normalized &&
        skill.enabled !== false
      ) {
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

    const placeholder: Skill = {
      name: lazySkill.name,
      description: lazySkill.description,
      content: '',
      source: lazySkill.source,
      enabled: true,
      icon: lazySkill.nekoOverlay?.interface?.iconSmall ?? lazySkill.icon,
      directoryPath: lazySkill.directoryPath,
      entryPointKind: lazySkill.entryPointKind,
      command: lazySkill.command,
      argumentHint: lazySkill.argumentHint,
      supportsArguments: lazySkill.supportsArguments,
      allowedTools: lazySkill.portableDefinition.allowedTools
        ? [...lazySkill.portableDefinition.allowedTools]
        : undefined,
      portableDefinition: lazySkill.portableDefinition,
      nekoOverlay: lazySkill.nekoOverlay,
    };

    this.skills.set(lazySkill.name, this.projectRegisteredSkill(placeholder));
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
        const projected = this.projectRegisteredSkill(fullSkill);
        this.skills.set(name, projected);
        logger.debug('Lazy skill loaded', { name });
        return projected;
      } catch (error) {
        logger.error('Failed to load lazy skill content', { name, error });
        return this.skills.get(name); // return the validated placeholder
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

  private projectRegisteredSkill(skill: Skill): Skill {
    const hostProjection = projectSkillHostProjection(
      skill,
      this.options.resolveHostProjectionContext?.(skill),
    );
    return {
      ...skill,
      enabled: hostProjection.enabled,
      catalog: projectCatalogMeta(skill.catalog, hostProjection),
      hostProjection,
    };
  }
}

function projectCatalogMeta(
  existing: SkillCatalogMeta | undefined,
  host: NonNullable<Skill['hostProjection']>,
): SkillCatalogMeta {
  const role = existing?.role ?? 'standalone';
  return {
    role,
    source: host.source,
    visibility:
      existing?.visibility ??
      (role === 'persona' ? 'hidden' : role === 'focused-skill' ? 'advanced' : 'primary'),
    editable: host.editable,
    ...(existing?.groupId === undefined ? {} : { groupId: existing.groupId }),
    ...(existing?.parentSkillIds === undefined
      ? {}
      : { parentSkillIds: [...existing.parentSkillIds] }),
    actions: [...host.catalogActions],
  };
}
