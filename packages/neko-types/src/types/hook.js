/**
 * Hook Types - File-based hooks for agent automation
 *
 * Hooks allow users to define automated actions that run at specific points
 * during agent execution. They can be used for:
 * - Pre/post message processing
 * - Tool call interception
 * - Custom workflows triggered by events
 *
 * Configuration locations (Claude Code compatible):
 * - User hooks: ~/.neko/settings.json
 * - Workspace hooks: .neko/settings.json
 * - Local workspace: .neko/settings.local.json
 *
 * Legacy directory structure (deprecated):
 * - User hooks: ~/.neko/hooks/<name>.md
 * - Workspace hooks: .neko/hooks/<name>.md
 */
// =============================================================================
// Constants
// =============================================================================
/**
 * Hook directory locations (legacy - deprecated)
 */
export const HOOK_DIRECTORIES = {
    /** Project-level hooks: .neko/hooks/ */
    project: '.neko/hooks',
    /** Personal hooks: ~/.neko/hooks/ */
    personal: '~/.neko/hooks',
};
/**
 * Settings file locations (Claude Code compatible)
 */
export const SETTINGS_FILES = {
    /** Project-level settings: .neko/settings.json */
    project: '.neko/settings.json',
    /** Personal settings: ~/.neko/settings.json */
    personal: '~/.neko/settings.json',
    /** Local project settings (not committed): .neko/settings.local.json */
    local: '.neko/settings.local.json',
};
// =============================================================================
// Utility Functions
// =============================================================================
/**
 * Parse hook event from string
 */
export function parseHookEvent(eventStr) {
    const validEvents = [
        'PreToolUse',
        'PostToolUse',
        'PostToolUseFailure',
        'UserPromptSubmit',
        'PermissionRequest',
        'Stop',
        'SubagentStart',
        'SubagentStop',
        'SessionStart',
        'SessionEnd',
        'PreCompact',
        'Notification',
    ];
    if (validEvents.includes(eventStr)) {
        return eventStr;
    }
    return null;
}
/**
 * Create a Hook from parsed frontmatter
 */
export function createHook(frontmatter, action, source, filePath) {
    return {
        name: frontmatter.name,
        description: frontmatter.description,
        event: frontmatter.event,
        condition: frontmatter.condition,
        action,
        enabled: frontmatter.enabled ?? true,
        source,
        filePath,
        priority: frontmatter.priority ?? 100,
    };
}
/**
 * Validate hook condition against context
 */
export function matchHookCondition(condition, context) {
    if (!condition)
        return true;
    // Tool pattern: "tool:ToolName"
    if (condition.startsWith('tool:')) {
        const toolPattern = condition.slice(5);
        if (!context.tool)
            return false;
        if (toolPattern === '*')
            return true;
        return context.tool === toolPattern || context.tool.startsWith(toolPattern);
    }
    // Message pattern: "message:*pattern*"
    if (condition.startsWith('message:')) {
        const pattern = condition.slice(8);
        if (!context.message)
            return false;
        // Simple glob-like matching
        if (pattern === '*')
            return true;
        if (pattern.startsWith('*') && pattern.endsWith('*')) {
            return context.message.includes(pattern.slice(1, -1));
        }
        if (pattern.startsWith('*')) {
            return context.message.endsWith(pattern.slice(1));
        }
        if (pattern.endsWith('*')) {
            return context.message.startsWith(pattern.slice(0, -1));
        }
        return context.message === pattern;
    }
    return true;
}
/**
 * Match hook matcher against tool name (Claude Code compatible)
 * Supports: exact match, regex pattern, "*" for all
 */
export function matchHookMatcher(matcher, toolName) {
    // Match all tools
    if (matcher === '*')
        return true;
    // Exact match
    if (matcher === toolName)
        return true;
    // Regex pattern (e.g., "Edit|Write", "Bash.*")
    try {
        const regex = new RegExp(`^(${matcher})$`);
        return regex.test(toolName);
    }
    catch {
        // Invalid regex, fall back to exact match
        return matcher === toolName;
    }
}
//# sourceMappingURL=hook.js.map