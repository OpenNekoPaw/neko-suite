/**
 * Skill Conflict Resolution Types
 *
 * Defines types for handling skill conflicts, priorities, and merge modes.
 */
/**
 * Default skill conflict configuration
 */
export const DEFAULT_SKILL_CONFLICT_CONFIG = {
    conflicts: [],
    priority: 5,
    maxConcurrent: 3,
    mergeMode: 'none',
    mergeableWith: [],
    dependencies: [],
};
/**
 * Parse conflict configuration from frontmatter
 */
export function parseConflictConfig(frontmatter) {
    return {
        conflicts: frontmatter.conflicts?.split(',').map((s) => s.trim()).filter(Boolean),
        priority: frontmatter.priority,
        maxConcurrent: frontmatter['max-concurrent'],
        mergeMode: frontmatter['merge-mode'],
        mergeableWith: frontmatter['mergeable-with']?.split(',').map((s) => s.trim()).filter(Boolean),
        dependencies: frontmatter.dependencies?.split(',').map((s) => s.trim()).filter(Boolean),
    };
}
//# sourceMappingURL=skill-conflict.js.map