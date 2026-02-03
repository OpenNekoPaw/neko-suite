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

// =============================================================================
// Hook Event Types
// =============================================================================

/**
 * Hook trigger events (aligned with Claude Code)
 */
export type HookEvent =
  | 'PreToolUse'         // Before tool execution (can block)
  | 'PostToolUse'        // After tool success
  | 'PostToolUseFailure' // After tool failure
  | 'UserPromptSubmit'   // User submits prompt (can block)
  | 'PermissionRequest'  // Permission dialog appears (can block)
  | 'Stop'               // Claude finishes response (can block)
  | 'SubagentStart'      // Subagent spawned
  | 'SubagentStop'       // Subagent completed
  | 'SessionStart'       // Session starts or resumes
  | 'SessionEnd'         // Session terminates
  | 'PreCompact'         // Before context compaction
  | 'Notification';      // Notification sent

// =============================================================================
// JSON Configuration Format (Claude Code Compatible)
// =============================================================================

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

// =============================================================================
// Hook Configuration
// =============================================================================

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

// =============================================================================
// YAML Frontmatter
// =============================================================================

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

// =============================================================================
// Loading Results
// =============================================================================

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

// =============================================================================
// Configured Hook (with UI extensions)
// =============================================================================

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
} as const;

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
} as const;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Parse hook event from string
 */
export function parseHookEvent(eventStr: string): HookEvent | null {
  const validEvents: HookEvent[] = [
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

  if (validEvents.includes(eventStr as HookEvent)) {
    return eventStr as HookEvent;
  }
  return null;
}

/**
 * Create a Hook from parsed frontmatter
 */
export function createHook(
  frontmatter: HookFrontmatter,
  action: string,
  source: SkillSource,
  filePath?: string
): Hook {
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
export function matchHookCondition(
  condition: string | undefined,
  context: { tool?: string; message?: string }
): boolean {
  if (!condition) return true;

  // Tool pattern: "tool:ToolName"
  if (condition.startsWith('tool:')) {
    const toolPattern = condition.slice(5);
    if (!context.tool) return false;
    if (toolPattern === '*') return true;
    return context.tool === toolPattern || context.tool.startsWith(toolPattern);
  }

  // Message pattern: "message:*pattern*"
  if (condition.startsWith('message:')) {
    const pattern = condition.slice(8);
    if (!context.message) return false;
    // Simple glob-like matching
    if (pattern === '*') return true;
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
export function matchHookMatcher(matcher: string, toolName: string): boolean {
  // Match all tools
  if (matcher === '*') return true;

  // Exact match
  if (matcher === toolName) return true;

  // Regex pattern (e.g., "Edit|Write", "Bash.*")
  try {
    const regex = new RegExp(`^(${matcher})$`);
    return regex.test(toolName);
  } catch {
    // Invalid regex, fall back to exact match
    return matcher === toolName;
  }
}
