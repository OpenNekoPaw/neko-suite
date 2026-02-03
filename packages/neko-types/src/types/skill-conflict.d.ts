/**
 * Skill Conflict Resolution Types
 *
 * Defines types for handling skill conflicts, priorities, and merge modes.
 */
/**
 * Skill priority level (higher = more important)
 */
export type SkillPriority = number;
/**
 * Skill conflict resolution strategy
 */
export type ConflictResolutionStrategy = 'priority' | 'user_choice' | 'merge' | 'first_wins' | 'last_wins';
/**
 * Skill merge mode
 */
export type SkillMergeMode = 'none' | 'sequential' | 'parallel' | 'composite';
/**
 * Skill conflict declaration in SKILL.md frontmatter
 */
export interface SkillConflictConfig {
    /** Skills that conflict with this one (cannot be active simultaneously) */
    conflicts?: string[];
    /** Priority level (default: 5, range: 1-10) */
    priority?: SkillPriority;
    /** Maximum concurrent skills when this skill is active */
    maxConcurrent?: number;
    /** Merge mode for this skill */
    mergeMode?: SkillMergeMode;
    /** Skills that can be merged with this one */
    mergeableWith?: string[];
    /** Skills that this skill depends on (will be auto-activated) */
    dependencies?: string[];
}
/**
 * Detected skill conflict
 */
export interface SkillConflict {
    /** Skill attempting to activate */
    requestedSkill: string;
    /** Currently active conflicting skills */
    conflictingSkills: string[];
    /** Reason for conflict */
    reason: 'explicit_conflict' | 'max_concurrent' | 'resource_conflict';
    /** Suggested resolution */
    suggestedResolution: ConflictResolutionStrategy;
}
/**
 * Skill conflict resolution result
 */
export interface ConflictResolutionResult {
    /** Whether the conflict was resolved */
    resolved: boolean;
    /** Skills to activate */
    activateSkills: string[];
    /** Skills to deactivate */
    deactivateSkills: string[];
    /** Message explaining the resolution */
    message: string;
    /** Whether user input was required */
    userInputRequired: boolean;
}
/**
 * Merged skill configuration
 */
export interface MergedSkillConfig {
    /** Name of the merged skill */
    name: string;
    /** Source skills */
    sourceSkills: string[];
    /** Merge mode used */
    mergeMode: SkillMergeMode;
    /** Combined allowed tools */
    allowedTools: string[];
    /** Combined content (system prompt) */
    content: string;
    /** Execution order for sequential mode */
    executionOrder?: string[];
}
/**
 * Skill conflict resolver interface
 */
export interface ISkillConflictResolver {
    /**
     * Check if activating a skill would cause conflicts
     */
    checkConflicts(skillName: string, activeSkills: string[]): SkillConflict | null;
    /**
     * Resolve a skill conflict
     */
    resolveConflict(conflict: SkillConflict, strategy?: ConflictResolutionStrategy): ConflictResolutionResult;
    /**
     * Check if two skills can be merged
     */
    canMerge(skill1: string, skill2: string): boolean;
    /**
     * Merge multiple skills into one
     */
    mergeSkills(skillNames: string[]): MergedSkillConfig | null;
    /**
     * Get skill priority
     */
    getSkillPriority(skillName: string): SkillPriority;
    /**
     * Get skill conflict configuration
     */
    getConflictConfig(skillName: string): SkillConflictConfig | undefined;
}
/**
 * Default skill conflict configuration
 */
export declare const DEFAULT_SKILL_CONFLICT_CONFIG: Required<SkillConflictConfig>;
/**
 * Extended skill frontmatter with conflict configuration
 */
export interface SkillFrontmatterWithConflict {
    name: string;
    description: string;
    'allowed-tools'?: string;
    'tools-ref'?: string;
    model?: string;
    icon?: string;
    enabled?: boolean;
    conflicts?: string;
    priority?: number;
    'max-concurrent'?: number;
    'merge-mode'?: SkillMergeMode;
    'mergeable-with'?: string;
    dependencies?: string;
}
/**
 * Parse conflict configuration from frontmatter
 */
export declare function parseConflictConfig(frontmatter: SkillFrontmatterWithConflict): SkillConflictConfig;
//# sourceMappingURL=skill-conflict.d.ts.map