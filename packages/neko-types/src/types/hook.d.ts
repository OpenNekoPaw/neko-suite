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
import type { SkillSource } from './skill';
/**
 * Hook trigger events (aligned with Claude Code)
 */
export type HookEvent = 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure' | 'UserPromptSubmit' | 'PermissionRequest' | 'Stop' | 'SubagentStart' | 'SubagentStop' | 'SessionStart' | 'SessionEnd' | 'PreCompact' | 'Notification';
/**
 * Hook action in settings.json
 */
export interface SettingsHookAction {
    /** Action type - currently only 'command' is supported */
    type: 'command';
    /** Shell command to execute */
    command: string;
}
/**
 * Hook configuration entry in settings.json
 */
export interface SettingsHookConfig {
    /** Tool name, regex pattern, or "*" for all tools */
    matcher: string;
    /** List of hook actions to execute */
    hooks: SettingsHookAction[];
}
/**
 * Hooks section in settings.json
 * Maps event types to hook configurations
 */
export type SettingsHooks = Partial<Record<HookEvent, SettingsHookConfig[]>>;
/**
 * Complete settings.json structure (hooks section)
 */
export interface NekoSettings {
    /** Hook configurations by event type */
    hooks?: SettingsHooks;
}
/**
 * Hook input passed via stdin (JSON)
 */
export interface HookInput {
    /** Tool name (for tool-related events) */
    tool_name?: string;
    /** Tool input parameters */
    tool_input?: Record<string, unknown>;
    /** Tool execution success (for PostToolUse) */
    success?: boolean;
    /** Tool output (for PostToolUse) */
    output?: string;
    /** Error message (for PostToolUseFailure) */
    error?: string;
    /** User message (for UserPromptSubmit) */
    message?: string;
    /** Session ID */
    session_id?: string;
    /** Timestamp */
    timestamp?: string;
}
/**
 * Hook output returned via stdout (JSON)
 */
export interface HookOutput {
    /** Decision for blocking hooks */
    decision?: 'approve' | 'block' | 'allow' | 'deny';
    /** Reason for the decision (shown to Claude) */
    reason?: string;
    /** Whether to continue (for Stop hook) */
    continue?: boolean;
    /** Modified tool input (for PreToolUse) */
    updatedInput?: Record<string, unknown>;
}
/**
 * Hook definition loaded from .md file
 */
export interface Hook {
    /**
     * Unique identifier (lowercase letters, numbers, hyphens)
     * Should match filename without extension
     * @example "auto-commit", "lint-check"
     */
    name: string;
    /**
     * Human-readable description
     */
    description: string;
    /**
     * Event that triggers this hook
     */
    event: HookEvent;
    /**
     * Condition for when to run (optional)
     * Can reference tool names, message content patterns, etc.
     * @example "tool:Bash", "message:*commit*"
     */
    condition?: string;
    /**
     * Hook action - shell command or script to run
     */
    action: string;
    /**
     * Whether hook is enabled
     * @default true
     */
    enabled: boolean;
    /**
     * Source (personal, project)
     */
    source: SkillSource;
    /**
     * File path
     */
    filePath?: string;
    /**
     * Priority (lower runs first)
     * @default 100
     */
    priority?: number;
}
/**
 * YAML frontmatter from hook .md file
 */
export interface HookFrontmatter {
    /** Hook name (required) */
    name: string;
    /** Description (required) */
    description: string;
    /** Event trigger (required) */
    event: HookEvent;
    /** Condition pattern */
    condition?: string;
    /** Priority */
    priority?: number;
    /** Enabled state */
    enabled?: boolean;
}
/**
 * Hook load result
 */
export interface HookLoadResult {
    hooks: Hook[];
    errors: HookLoadError[];
}
/**
 * Hook load error
 */
export interface HookLoadError {
    file: string;
    message: string;
    details?: string;
}
/**
 * Configured Hook for settings UI
 */
export interface ConfiguredHook extends Hook {
    /** User notes */
    notes?: string;
    /** Tags for organization */
    tags?: string[];
    /** Last modified timestamp */
    lastModified?: number;
}
/**
 * Hook directory locations (legacy - deprecated)
 */
export declare const HOOK_DIRECTORIES: {
    /** Project-level hooks: .neko/hooks/ */
    readonly project: ".neko/hooks";
    /** Personal hooks: ~/.neko/hooks/ */
    readonly personal: "~/.neko/hooks";
};
/**
 * Settings file locations (Claude Code compatible)
 */
export declare const SETTINGS_FILES: {
    /** Project-level settings: .neko/settings.json */
    readonly project: ".neko/settings.json";
    /** Personal settings: ~/.neko/settings.json */
    readonly personal: "~/.neko/settings.json";
    /** Local project settings (not committed): .neko/settings.local.json */
    readonly local: ".neko/settings.local.json";
};
/**
 * Parse hook event from string
 */
export declare function parseHookEvent(eventStr: string): HookEvent | null;
/**
 * Create a Hook from parsed frontmatter
 */
export declare function createHook(frontmatter: HookFrontmatter, action: string, source: SkillSource, filePath?: string): Hook;
/**
 * Validate hook condition against context
 */
export declare function matchHookCondition(condition: string | undefined, context: {
    tool?: string;
    message?: string;
}): boolean;
/**
 * Match hook matcher against tool name (Claude Code compatible)
 * Supports: exact match, regex pattern, "*" for all
 */
export declare function matchHookMatcher(matcher: string, toolName: string): boolean;
//# sourceMappingURL=hook.d.ts.map