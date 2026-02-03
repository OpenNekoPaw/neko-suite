/**
 * Skill Conflict Resolver Implementation
 *
 * Handles skill conflicts, priorities, and merge modes.
 */

import type {
  SkillConflictConfig,
  SkillConflict,
  ConflictResolutionResult,
  ConflictResolutionStrategy,
  MergedSkillConfig,
  SkillMergeMode,
  SkillPriority,
  ISkillConflictResolver,
  Skill,
} from '@neko/shared';
import { DEFAULT_SKILL_CONFLICT_CONFIG } from '@neko/shared';

/**
 * Skill conflict resolver implementation
 */
export class SkillConflictResolver implements ISkillConflictResolver {
  /** Skill conflict configurations by name */
  private conflictConfigs: Map<string, SkillConflictConfig> = new Map();

  /** Skill data by name */
  private skills: Map<string, Skill> = new Map();

  /** Default resolution strategy */
  private defaultStrategy: ConflictResolutionStrategy = 'priority';

  /** Maximum concurrent skills */
  private maxConcurrentSkills: number = 3;

  constructor(options?: {
    defaultStrategy?: ConflictResolutionStrategy;
    maxConcurrentSkills?: number;
  }) {
    if (options?.defaultStrategy) {
      this.defaultStrategy = options.defaultStrategy;
    }
    if (options?.maxConcurrentSkills) {
      this.maxConcurrentSkills = options.maxConcurrentSkills;
    }
  }

  /**
   * Register a skill with its conflict configuration
   */
  registerSkill(skill: Skill, config?: SkillConflictConfig): void {
    this.skills.set(skill.name, skill);
    this.conflictConfigs.set(skill.name, {
      ...DEFAULT_SKILL_CONFLICT_CONFIG,
      ...config,
    });
  }

  /**
   * Unregister a skill
   */
  unregisterSkill(skillName: string): void {
    this.skills.delete(skillName);
    this.conflictConfigs.delete(skillName);
  }

  /**
   * Check if activating a skill would cause conflicts
   */
  checkConflicts(
    skillName: string,
    activeSkills: string[]
  ): SkillConflict | null {
    const config = this.getConflictConfig(skillName);
    if (!config) {
      return null;
    }

    // Check explicit conflicts
    const explicitConflicts = activeSkills.filter(
      (active) => config.conflicts?.includes(active)
    );
    if (explicitConflicts.length > 0) {
      return {
        requestedSkill: skillName,
        conflictingSkills: explicitConflicts,
        reason: 'explicit_conflict',
        suggestedResolution: this.defaultStrategy,
      };
    }

    // Check reverse conflicts (other skills declare conflict with this one)
    const reverseConflicts = activeSkills.filter((active) => {
      const activeConfig = this.getConflictConfig(active);
      return activeConfig?.conflicts?.includes(skillName);
    });
    if (reverseConflicts.length > 0) {
      return {
        requestedSkill: skillName,
        conflictingSkills: reverseConflicts,
        reason: 'explicit_conflict',
        suggestedResolution: this.defaultStrategy,
      };
    }

    // Check max concurrent limit
    const maxConcurrent = config.maxConcurrent ?? this.maxConcurrentSkills;
    if (activeSkills.length >= maxConcurrent) {
      return {
        requestedSkill: skillName,
        conflictingSkills: activeSkills,
        reason: 'max_concurrent',
        suggestedResolution: 'priority',
      };
    }

    return null;
  }

  /**
   * Resolve a skill conflict
   */
  resolveConflict(
    conflict: SkillConflict,
    strategy?: ConflictResolutionStrategy
  ): ConflictResolutionResult {
    const resolveStrategy = strategy ?? conflict.suggestedResolution;

    switch (resolveStrategy) {
      case 'priority':
        return this.resolveByPriority(conflict);
      case 'merge':
        return this.resolveByMerge(conflict);
      case 'first_wins':
        return this.resolveFirstWins(conflict);
      case 'last_wins':
        return this.resolveLastWins(conflict);
      case 'user_choice':
        return this.resolveUserChoice(conflict);
      default:
        return this.resolveByPriority(conflict);
    }
  }

  /**
   * Resolve conflict by priority
   */
  private resolveByPriority(conflict: SkillConflict): ConflictResolutionResult {
    const requestedPriority = this.getSkillPriority(conflict.requestedSkill);
    
    // Find skills with lower priority that can be deactivated
    const toDeactivate: string[] = [];
    for (const activeSkill of conflict.conflictingSkills) {
      const activePriority = this.getSkillPriority(activeSkill);
      if (requestedPriority > activePriority) {
        toDeactivate.push(activeSkill);
      }
    }

    // If we can deactivate enough skills, do it
    if (toDeactivate.length > 0) {
      return {
        resolved: true,
        activateSkills: [conflict.requestedSkill],
        deactivateSkills: toDeactivate,
        message: `Deactivating lower priority skills: ${toDeactivate.join(', ')}`,
        userInputRequired: false,
      };
    }

    // Cannot resolve - requested skill has lower or equal priority
    return {
      resolved: false,
      activateSkills: [],
      deactivateSkills: [],
      message: `Cannot activate "${conflict.requestedSkill}" - conflicting skills have equal or higher priority`,
      userInputRequired: true,
    };
  }

  /**
   * Resolve conflict by merging skills
   */
  private resolveByMerge(conflict: SkillConflict): ConflictResolutionResult {
    // Check if skills can be merged
    const allSkills = [conflict.requestedSkill, ...conflict.conflictingSkills];
    const canMergeAll = allSkills.every((skill, i) =>
      allSkills.slice(i + 1).every((other) => this.canMerge(skill, other))
    );

    if (canMergeAll) {
      return {
        resolved: true,
        activateSkills: allSkills,
        deactivateSkills: [],
        message: `Merging skills: ${allSkills.join(', ')}`,
        userInputRequired: false,
      };
    }

    // Fall back to priority resolution
    return this.resolveByPriority(conflict);
  }

  /**
   * Resolve conflict - first activated wins
   */
  private resolveFirstWins(conflict: SkillConflict): ConflictResolutionResult {
    return {
      resolved: false,
      activateSkills: [],
      deactivateSkills: [],
      message: `Cannot activate "${conflict.requestedSkill}" - conflicting skills are already active`,
      userInputRequired: false,
    };
  }

  /**
   * Resolve conflict - last activated wins
   */
  private resolveLastWins(conflict: SkillConflict): ConflictResolutionResult {
    return {
      resolved: true,
      activateSkills: [conflict.requestedSkill],
      deactivateSkills: conflict.conflictingSkills,
      message: `Deactivating conflicting skills: ${conflict.conflictingSkills.join(', ')}`,
      userInputRequired: false,
    };
  }

  /**
   * Resolve conflict - require user choice
   */
  private resolveUserChoice(conflict: SkillConflict): ConflictResolutionResult {
    return {
      resolved: false,
      activateSkills: [],
      deactivateSkills: [],
      message: `Conflict detected. Please choose which skill to use: "${conflict.requestedSkill}" or ${conflict.conflictingSkills.map((s) => `"${s}"`).join(', ')}`,
      userInputRequired: true,
    };
  }

  /**
   * Check if two skills can be merged
   */
  canMerge(skill1: string, skill2: string): boolean {
    const config1 = this.getConflictConfig(skill1);
    const config2 = this.getConflictConfig(skill2);

    if (!config1 || !config2) {
      return false;
    }

    // Check if either skill declares the other as mergeable
    const skill1MergeableWith = config1.mergeableWith ?? [];
    const skill2MergeableWith = config2.mergeableWith ?? [];

    // Both must allow merging
    if (config1.mergeMode === 'none' || config2.mergeMode === 'none') {
      return false;
    }

    // Check explicit mergeable declarations
    return (
      skill1MergeableWith.includes(skill2) ||
      skill2MergeableWith.includes(skill1)
    );
  }

  /**
   * Merge multiple skills into one
   */
  mergeSkills(skillNames: string[]): MergedSkillConfig | null {
    if (skillNames.length < 2) {
      return null;
    }

    // Verify all skills can be merged
    for (let i = 0; i < skillNames.length; i++) {
      for (let j = i + 1; j < skillNames.length; j++) {
        if (!this.canMerge(skillNames[i], skillNames[j])) {
          return null;
        }
      }
    }

    // Collect skill data
    const skills = skillNames
      .map((name) => this.skills.get(name))
      .filter((s): s is Skill => s !== undefined);

    if (skills.length !== skillNames.length) {
      return null;
    }

    // Determine merge mode (use the most restrictive)
    const mergeModes = skillNames
      .map((name) => this.getConflictConfig(name)?.mergeMode ?? 'sequential')
      .filter((m): m is SkillMergeMode => m !== 'none');

    const mergeMode: SkillMergeMode = mergeModes.includes('sequential')
      ? 'sequential'
      : mergeModes.includes('composite')
        ? 'composite'
        : 'parallel';

    // Combine allowed tools
    const allowedTools = new Set<string>();
    for (const skill of skills) {
      if (skill.allowedTools) {
        for (const tool of skill.allowedTools) {
          allowedTools.add(tool);
        }
      }
    }

    // Combine content based on merge mode
    let content: string;
    if (mergeMode === 'sequential') {
      content = skills
        .map((s, i) => `## Phase ${i + 1}: ${s.name}\n\n${s.content}`)
        .join('\n\n---\n\n');
    } else if (mergeMode === 'composite') {
      content = `# Composite Skill: ${skillNames.join(' + ')}\n\n` +
        skills.map((s) => `## ${s.name}\n\n${s.content}`).join('\n\n');
    } else {
      // Parallel - just combine
      content = skills.map((s) => s.content).join('\n\n---\n\n');
    }

    // Sort by priority for execution order
    const executionOrder = [...skillNames].sort(
      (a, b) => this.getSkillPriority(b) - this.getSkillPriority(a)
    );

    return {
      name: `merged_${skillNames.join('_')}`,
      sourceSkills: skillNames,
      mergeMode,
      allowedTools: Array.from(allowedTools),
      content,
      executionOrder,
    };
  }

  /**
   * Get skill priority
   */
  getSkillPriority(skillName: string): SkillPriority {
    const config = this.conflictConfigs.get(skillName);
    return config?.priority ?? DEFAULT_SKILL_CONFLICT_CONFIG.priority;
  }

  /**
   * Get skill conflict configuration
   */
  getConflictConfig(skillName: string): SkillConflictConfig | undefined {
    return this.conflictConfigs.get(skillName);
  }

  /**
   * Set default resolution strategy
   */
  setDefaultStrategy(strategy: ConflictResolutionStrategy): void {
    this.defaultStrategy = strategy;
  }

  /**
   * Set maximum concurrent skills
   */
  setMaxConcurrentSkills(max: number): void {
    this.maxConcurrentSkills = max;
  }

  /**
   * Get all registered skills
   */
  getRegisteredSkills(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.skills.clear();
    this.conflictConfigs.clear();
  }
}

/**
 * Factory function to create a skill conflict resolver
 */
export function createSkillConflictResolver(options?: {
  defaultStrategy?: ConflictResolutionStrategy;
  maxConcurrentSkills?: number;
}): ISkillConflictResolver {
  return new SkillConflictResolver(options);
}
