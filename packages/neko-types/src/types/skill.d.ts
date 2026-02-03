/**
 * Skill & Slash Command Types - Claude-compatible Definitions
 *
 * This module defines two distinct concepts:
 *
 * 1. **Skill** - Semantic discovery, auto-triggered based on description matching
 *    - Located in: `.neko/skills/` (project) or `~/.neko/skills/` (personal)
 *    - Triggered by: Semantic matching of user input against description
 *    - Arguments: NOT supported (no $ARGUMENTS, $1, $2)
 *    - File structure: skill-name/SKILL.md + support files
 *
 * 2. **Slash Command** - Explicit trigger with /command
 *    - Located in: `.neko/commands/` (project) or `~/.neko/commands/` (personal)
 *    - Triggered by: User typing /command
 *    - Arguments: Supported ($ARGUMENTS, $1, $2, etc.)
 *    - File structure: Single .md file (command-name.md)
 *
 * @see https://docs.anthropic.com/en/docs/claude-code/skills
 */
/**
 * Tool parameter definition (from tools.md frontmatter)
 */
export interface SkillToolParameter {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required?: boolean;
    description?: string;
    enum?: (string | number)[];
    min?: number;
    max?: number;
    default?: unknown;
}
/**
 * Tool definition (from tools.md frontmatter)
 * These are converted to OpenAI-compatible function definitions when injected
 */
export interface SkillToolDefinition {
    /** Tool name (function name) */
    name: string;
    /** Tool description */
    description: string;
    /** Parameter definitions */
    parameters: Record<string, SkillToolParameter>;
}
/**
 * Parsed tools.md frontmatter
 */
export interface ToolsFileFrontmatter {
    tools: SkillToolDefinition[];
}
/**
 * Where the skill/command comes from
 */
export type SkillSource = 'builtin' | 'personal' | 'project';
/**
 * Skill directory locations
 */
export declare const SKILL_DIRECTORIES: {
    /** Project-level skills: .neko/skills/ in project root */
    readonly project: ".neko/skills";
    /** Personal skills: ~/.neko/skills/ */
    readonly personal: "~/.neko/skills";
};
/**
 * Slash command directory locations (separate from skills)
 */
export declare const COMMAND_DIRECTORIES: {
    /** Project-level commands: .neko/commands/ in project root */
    readonly project: ".neko/commands";
    /** Personal commands: ~/.neko/commands/ */
    readonly personal: "~/.neko/commands";
};
/**
 * Skill - Claude-compatible semantic discovery skill
 *
 * A Skill is a Markdown document (SKILL.md) that teaches Claude how to
 * perform a specific task. Skills are automatically discovered based on
 * semantic matching of their descriptions.
 *
 * Key characteristics:
 * - NO slash command trigger (use SlashCommand for that)
 * - NO argument interpolation
 * - Supports multi-file structure with support files
 */
export interface Skill {
    /**
     * Unique identifier (lowercase letters, numbers, hyphens)
     * Max 64 characters. Should match directory name.
     * @example "commit-helper", "pdf-processing"
     */
    name: string;
    /**
     * Semantic description - Claude uses this to decide when to apply the skill
     *
     * Should answer:
     * 1. What does this skill do?
     * 2. When should it be used?
     *
     * Include trigger keywords users would naturally say.
     * Max 1024 characters.
     *
     * @example "Extract text and tables from PDF files, fill forms, merge documents.
     *          Use when working with PDF files or when the user mentions PDFs."
     */
    description: string;
    /**
     * Main skill content (from SKILL.md body)
     * Injected as system prompt when skill is applied
     */
    content: string;
    /**
     * Support file references (Progressive Disclosure)
     *
     * **Claude-compatible**: Only stores file paths, NOT content.
     * Claude reads support files on-demand using the Read tool.
     *
     * @example ["reference.md", "examples.md"]
     */
    supportFileRefs?: string[];
    /**
     * @deprecated Use supportFileRefs instead.
     * Support files content - loaded eagerly (not progressive disclosure)
     */
    supportFiles?: Record<string, string>;
    /**
     * Allowed tools - Restrict which tools Claude can use during skill execution
     * @example ["Read", "Grep", "Bash(git:*)", "Bash(python:*)"]
     */
    allowedTools?: string[];
    /**
     * Tools reference file path (relative to skill directory)
     * Points to a markdown file with tool definitions in YAML frontmatter
     * @example "references/tools.md"
     */
    toolsRef?: string;
    /**
     * Tool definitions - Loaded from tools.md when skill is activated
     * These tools are injected into the AI request when the skill is applied
     */
    toolDefinitions?: SkillToolDefinition[];
    /**
     * Model override for this skill
     * @example "claude-sonnet-4-20250514"
     */
    model?: string;
    /**
     * Skill source (project, personal, builtin)
     */
    source: SkillSource;
    /**
     * Directory path where skill is located
     * @example ".skill/pdf-processing"
     */
    directoryPath?: string;
    /**
     * Icon (emoji or icon name)
     * **UniEdit extension** - Not in Claude spec
     * @example "📄", "🔍"
     */
    icon?: string;
    /**
     * Whether the skill is enabled
     * **UniEdit extension** - Not in Claude spec
     * @default true
     */
    enabled: boolean;
    /**
     * Content configuration (references, scripts, tools)
     * Loaded from skill directory structure for progressive disclosure
     */
    contentConfig?: SkillContentConfig;
}
/**
 * Slash Command - Explicit /command trigger
 *
 * A Slash Command is a single Markdown file that provides instructions
 * to Claude when explicitly invoked with /command.
 *
 * Key characteristics:
 * - Triggered by explicit /command
 * - Supports argument interpolation ($ARGUMENTS, $1, $2, etc.)
 * - Single file structure
 */
export interface SlashCommand {
    /**
     * Command name (without /)
     * @example "commit", "review-pr"
     */
    command: string;
    /**
     * Description shown in autocomplete
     */
    description: string;
    /**
     * Command content with argument placeholders
     * Supports: $ARGUMENTS, $1, $2, ... $99
     */
    content: string;
    /**
     * Argument hint shown in UI
     * @example "[message]", "[pr-number] [priority]"
     */
    argumentHint?: string;
    /**
     * Allowed tools during command execution
     */
    allowedTools?: string[];
    /**
     * Model override
     */
    model?: string;
    /**
     * Source
     */
    source: SkillSource;
    /**
     * File path
     */
    filePath?: string;
    /**
     * Icon
     * **UniEdit extension** - Not in Claude spec
     */
    icon?: string;
    /**
     * Whether enabled
     * **UniEdit extension** - Not in Claude spec
     */
    enabled: boolean;
}
/**
 * Skill match result from semantic matching
 */
export interface SkillMatch {
    /** Matched skill */
    skill: Skill;
    /**
     * Relevance score (0-1)
     * Higher score means better match
     */
    relevance: number;
    /**
     * Reason for the match
     * @example "Matched keyword 'PDF' in description"
     */
    reason: string;
}
/**
 * Skill matcher interface - For semantic skill discovery
 */
export interface ISkillMatcher {
    /**
     * Find skills that match the user's request
     * @param request User's input text
     * @param skills Available skills to search
     * @returns Matched skills sorted by relevance (highest first)
     */
    match(request: string, skills: Skill[]): SkillMatch[];
}
/**
 * Result of skill/command injection into conversation context
 */
export interface SkillInjection {
    /** System prompt to inject (content + support files) */
    systemPrompt: string;
    /** Allowed tools (if restricted) */
    allowedTools?: string[];
    /** Name for tracking */
    name: string;
    /** Model override */
    model?: string;
    /** Type indicator */
    type: 'skill' | 'slash-command';
}
/**
 * Skill injector interface
 */
export interface ISkillInjector {
    /**
     * Inject a skill (no argument interpolation)
     */
    injectSkill(skill: Skill): SkillInjection;
    /**
     * Inject a slash command (with argument interpolation)
     */
    injectCommand(command: SlashCommand, args?: string): SkillInjection;
    /**
     * Interpolate arguments in content (for slash commands only)
     */
    interpolate(content: string, args: string): string;
}
/**
 * Combined registry for skills and slash commands
 */
export interface ISkillRegistry {
    registerSkill(skill: Skill): void;
    unregisterSkill(name: string): void;
    getSkill(name: string): Skill | undefined;
    listSkills(): Skill[];
    listAllSkills(): Skill[];
    registerCommand(command: SlashCommand): void;
    unregisterCommand(name: string): void;
    getCommand(name: string): SlashCommand | undefined;
    listCommands(): SlashCommand[];
    hasCommand(name: string): boolean;
    searchSkills(keyword: string): Skill[];
    readonly skillCount: number;
    readonly commandCount: number;
    clear(): void;
    /** @deprecated Use getCommand() instead */
    getBySlashCommand(command: string): Skill | undefined;
}
/**
 * Skill service interface - Full-featured service for agent runtime
 *
 * Focuses on orchestration: discovery, application, and runtime enforcement.
 * For registry operations, access the registry directly via `skillService.registry`.
 */
export interface ISkillService {
    /**
     * Skill registry - use directly for register/get/list operations
     */
    readonly registry: ISkillRegistry;
    /**
     * Number of registered skills (convenience getter)
     */
    readonly skillCount: number;
    /**
     * Number of registered commands (convenience getter)
     */
    readonly commandCount: number;
    /**
     * Match user input to skills
     */
    match(input: string, limit?: number): SkillMatch[];
    /**
     * Apply a skill (inject into conversation)
     */
    apply(skill: Skill): SkillInjection;
    /**
     * Apply a slash command with arguments
     */
    applyCommand(command: SlashCommand, args?: string): SkillInjection;
    /**
     * Get currently active skill (if any)
     */
    getActiveSkill(): Skill | undefined;
    /**
     * Clear active skill
     */
    clearActiveSkill(): void;
}
/**
 * YAML frontmatter from SKILL.md file
 */
export interface SkillFrontmatter {
    /** Skill name (required) */
    name: string;
    /** Skill description (required) */
    description: string;
    /** Allowed tools */
    'allowed-tools'?: string;
    /**
     * Tools reference file path (relative to skill directory)
     * Points to a markdown file with tool definitions in YAML frontmatter
     * @example "references/tools.md"
     */
    'tools-ref'?: string;
    /** Model override */
    model?: string;
    /** Icon */
    icon?: string;
    /** Enabled state */
    enabled?: boolean;
}
/**
 * YAML frontmatter from slash command .md file
 */
export interface CommandFrontmatter {
    /** Command name (required, without /) */
    command: string;
    /** Description */
    description: string;
    /** Argument hint */
    'argument-hint'?: string;
    /** Allowed tools */
    'allowed-tools'?: string;
    /** Model */
    model?: string;
    /** Icon */
    icon?: string;
    /** Enabled */
    enabled?: boolean;
}
/**
 * Parsed SKILL.md file
 */
export interface ParsedSkillFile {
    frontmatter: SkillFrontmatter;
    content: string;
    /** Referenced support files (relative paths) */
    supportFileRefs: string[];
}
/**
 * Skill load result
 */
export interface SkillLoadResult {
    skills: Skill[];
    commands: SlashCommand[];
    errors: SkillLoadError[];
}
/**
 * Skill load error
 */
export interface SkillLoadError {
    file: string;
    message: string;
    details?: string;
}
/**
 * File system interface for skill loading
 */
export interface ISkillFileSystem {
    exists(path: string): Promise<boolean>;
    readDir(path: string): Promise<string[]>;
    readFile(path: string): Promise<string>;
    isDirectory(path: string): Promise<boolean>;
}
/**
 * Reference document configuration for skill
 */
export interface SkillReference {
    /** Relative path from skill directory */
    path: string;
    /** Display name */
    name: string;
    /** Description of what this reference contains */
    description?: string;
    /** Whether to inject this reference into context */
    inject?: boolean;
}
/**
 * Script configuration for skill
 */
export interface SkillScript {
    /** Relative path from skill directory */
    path: string;
    /** Display name */
    name: string;
    /** Description of what this script does */
    description?: string;
    /** Script language: python, typescript */
    language: 'python' | 'typescript' | 'javascript' | 'shell';
    /** Whether this script is enabled for execution */
    enabled?: boolean;
}
/**
 * Skill content configuration
 * Defines the skill directory structure and what to use
 */
export interface SkillContentConfig {
    /** References in references/ directory */
    references?: SkillReference[];
    /** Scripts in scripts/ directory */
    scripts?: SkillScript[];
    /** Allowed tools (Tool names or patterns like "Bash(git:*)") */
    allowedTools?: string[];
}
/**
 * @deprecated Use SkillContentConfig instead
 * Skill resource injection configuration
 * Defines which external resources a skill can access
 */
export interface SkillResourceConfig {
    /** Allowed tools (Tool names or patterns like "Bash(git:*)") */
    allowedTools?: string[];
    /** MCP servers to enable for this skill (server IDs) */
    mcpServers?: string[];
    /** Workflows to enable for this skill (workflow IDs) */
    workflows?: string[];
    /** Whether to auto-inject MCP tools as allowed tools */
    autoInjectMcpTools?: boolean;
}
/**
 * Configured Skill (with UI/settings extensions)
 */
export interface ConfiguredSkill extends Skill {
    /** Content configuration (references, scripts, tools) */
    contentConfig?: SkillContentConfig;
    /** @deprecated Use contentConfig instead */
    resources?: SkillResourceConfig;
    /** User notes/documentation */
    notes?: string;
    /** Tags for organization */
    tags?: string[];
    /** Last modified timestamp */
    lastModified?: number;
}
/**
 * Configured Slash Command
 */
export interface ConfiguredSlashCommand extends SlashCommand {
    /** Content configuration (references, scripts, tools) */
    contentConfig?: SkillContentConfig;
    /** @deprecated Use contentConfig instead */
    resources?: SkillResourceConfig;
    /** User notes/documentation */
    notes?: string;
    /** Tags for organization */
    tags?: string[];
    /** Last modified timestamp */
    lastModified?: number;
}
/**
 * Skill summary for UI display
 */
export interface SkillSummary {
    name: string;
    description: string;
    icon?: string;
    source: SkillSource;
    enabled: boolean;
    type: 'skill' | 'slash-command';
    /** For slash commands only */
    command?: string;
    argumentHint?: string;
}
export interface SkillValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Convert Skill to SkillSummary
 */
export declare function toSkillSummary(skill: Skill): SkillSummary;
/**
 * Convert SlashCommand to SkillSummary
 */
export declare function toCommandSummary(command: SlashCommand): SkillSummary;
/**
 * Parse allowed-tools string into array
 */
export declare function parseAllowedTools(toolsStr: string | undefined): string[] | undefined;
/**
 * Check if a tool is allowed
 */
export declare function isToolAllowed(tool: string, allowedTools?: string[]): boolean;
/**
 * Validate a skill
 */
export declare function validateSkill(skill: Partial<Skill>): SkillValidationResult;
/**
 * Validate a slash command
 */
export declare function validateCommand(command: Partial<SlashCommand>): SkillValidationResult;
/**
 * Create a Skill from parsed frontmatter
 *
 * @param frontmatter Parsed YAML frontmatter
 * @param content SKILL.md body content
 * @param source Skill source (builtin, personal, project)
 * @param directoryPath Skill directory path
 * @param supportFileRefs Referenced support file paths (progressive disclosure)
 * @param toolDefinitions Tool definitions loaded from tools.md
 */
export declare function createSkill(frontmatter: SkillFrontmatter, content: string, source: SkillSource, directoryPath?: string, supportFileRefs?: string[], toolDefinitions?: SkillToolDefinition[], contentConfig?: SkillContentConfig): Skill;
/**
 * Create a SlashCommand from parsed frontmatter
 */
export declare function createCommand(frontmatter: CommandFrontmatter, content: string, source: SkillSource, filePath?: string): SlashCommand;
/**
 * Extract support file references from markdown content
 * Matches: [Title](file.md) where file.md is a relative path
 */
export declare function extractSupportFileRefs(content: string): string[];
/**
 * OpenAI-compatible function parameter schema
 */
export interface OpenAIFunctionParameter {
    type: string;
    description?: string;
    enum?: (string | number)[];
    minimum?: number;
    maximum?: number;
    default?: unknown;
}
/**
 * OpenAI-compatible function definition
 */
export interface OpenAIFunction {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, OpenAIFunctionParameter>;
            required: string[];
        };
    };
}
/**
 * Convert SkillToolDefinition to OpenAI-compatible function format
 */
export declare function skillToolToOpenAI(tool: SkillToolDefinition): OpenAIFunction;
/**
 * Convert multiple SkillToolDefinitions to OpenAI-compatible format
 */
export declare function skillToolsToOpenAI(tools: SkillToolDefinition[]): OpenAIFunction[];
/**
 * @deprecated Use Skill or SlashCommand instead
 * This type is kept for backward compatibility during migration
 */
export interface LegacySkill extends Skill {
    slashCommand?: string;
    argumentHint?: string;
}
/**
 * @deprecated Use SkillFrontmatter instead
 */
export interface LegacySkillFrontmatter extends SkillFrontmatter {
    'slash-command'?: string;
    'argument-hint'?: string;
}
/**
 * @deprecated Kept for backward compatibility
 */
export interface SkillSlashCommand {
    command: string;
    skill: LegacySkill;
}
//# sourceMappingURL=skill.d.ts.map