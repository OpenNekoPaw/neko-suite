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

// =============================================================================
// Tool Definition Types (for skills that inject tools)
// =============================================================================

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

// =============================================================================
// Source Types
// =============================================================================

/**
 * Where the skill/command comes from
 */
export type SkillSource = 'builtin' | 'personal' | 'project' | 'market';

/**
 * Skill directory locations
 */
export const SKILL_DIRECTORIES = {
  /** Project-level skills: .neko/skills/ in project root */
  project: '.neko/skills',
  /** Personal skills: ~/.neko/skills/ */
  personal: '~/.neko/skills',
} as const;

/**
 * Slash command directory locations (separate from skills)
 */
export const COMMAND_DIRECTORIES = {
  /** Project-level commands: .neko/commands/ in project root */
  project: '.neko/commands',
  /** Personal commands: ~/.neko/commands/ */
  personal: '~/.neko/commands',
} as const;

// =============================================================================
// Skill Types (Semantic Discovery)
// =============================================================================

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
   * File path patterns that trigger this skill on save.
   * Uses glob syntax (e.g. "**\/*.fountain", "src/**\/*.ts").
   * When a file matching these patterns is saved, the skill is auto-activated.
   */
  paths?: string[];

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
   * **Neko Suite extension** - Not in Claude spec
   * @example "📄", "🔍"
   */
  icon?: string;

  /**
   * Whether the skill is enabled
   * **Neko Suite extension** - Not in Claude spec
   * @default true
   */
  enabled: boolean;

  // ===========================================================================
  // Pipeline Configuration (Neko Suite extension)
  // ===========================================================================

  /**
   * Pipeline flow ID to execute when this skill is activated
   * @example "flowF", "flowA"
   */
  pipelineFlowId?: string;

  /**
   * Stages to skip in the pipeline
   */
  pipelineSkipStages?: string[];

  /**
   * Per-stage parameter overrides
   */
  pipelineParams?: Record<string, Record<string, unknown>>;

  /**
   * Pipeline hook configurations
   */
  pipelineHooks?: Array<{
    stageName: string;
    timing: 'before' | 'after';
    action: string;
    params?: Record<string, unknown>;
  }>;

  // ===========================================================================
  // Optional Slash Command Integration
  // ===========================================================================

  /**
   * Optional slash command trigger (without /).
   * When set, this skill is also registered as a slash command.
   * @example "commit", "review-pr"
   */
  command?: string;

  /**
   * Argument hint shown in slash command autocomplete.
   * Only meaningful when `command` is set.
   * @example "[message]", "[pr-number] [priority]"
   */
  argumentHint?: string;

  /**
   * Whether content supports argument interpolation ($ARGUMENTS, $1-$99).
   * Only meaningful when `command` is set.
   * @default false
   */
  supportsArguments?: boolean;
}

// =============================================================================
// Slash Command Types (Explicit Trigger)
// =============================================================================

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
   * **Neko Suite extension** - Not in Claude spec
   */
  icon?: string;

  /**
   * Whether enabled
   * **Neko Suite extension** - Not in Claude spec
   */
  enabled: boolean;
}

// =============================================================================
// Skill Matching (Semantic Discovery)
// =============================================================================

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

// =============================================================================
// Injection
// =============================================================================

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
   * Inject a skill (with optional argument interpolation and shell execution)
   */
  injectSkill(skill: Skill, args?: string): Promise<SkillInjection>;

  /**
   * Interpolate arguments in content
   */
  interpolate(content: string, args: string): string;
}

// =============================================================================
// Registry
// =============================================================================

/**
 * Skill registry — unified storage for skills (including command-enabled skills)
 */
export interface ISkillRegistry {
  // Skill operations
  registerSkill(skill: Skill): void;
  unregisterSkill(name: string): void;
  getSkill(name: string): Skill | undefined;
  listSkills(): Skill[];
  listAllSkills(): Skill[];

  /**
   * Find a skill by its command trigger name.
   * Only returns skills that have the `command` field set.
   */
  getSkillByCommand(commandName: string): Skill | undefined;

  // Search
  searchSkills(keyword: string): Skill[];

  // Counts
  readonly skillCount: number;

  // Clear
  clear(): void;
}

/**
 * Result of discovering skills matching user input
 */
export interface SkillDiscoveryResult {
  /** Whether any skills were matched */
  found: boolean;
  /** Matched skills (sorted by relevance) */
  matches: SkillMatch[];
  /** Top match (if any) */
  topMatch?: SkillMatch;
  /** Whether confirmation is required */
  requiresConfirmation: boolean;
}

/**
 * Result of applying a skill or slash command
 */
export interface SkillApplicationResult {
  /** Whether skill was applied */
  applied: boolean;
  /** Injection result (if applied) */
  injection?: SkillInjection;
  /** Applied skill */
  skill?: Skill;
  /** Error message if failed */
  error?: string;
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
   * Apply a skill (inject into conversation).
   * @param skill Skill to apply
   * @param args Optional arguments (for skills with command trigger)
   */
  apply(skill: Skill, args?: string): SkillInjection;

  /**
   * Discover skills matching user input
   */
  discover(input: string, limit?: number): SkillDiscoveryResult;

  /**
   * Discover and apply a matching skill, with optional confirmation callback
   */
  discoverAndApply(
    userInput: string,
    onConfirm?: (skill: Skill) => Promise<boolean>,
  ): Promise<SkillApplicationResult | null>;

  /**
   * Get currently active skill (if any)
   */
  getActiveSkill(): Skill | undefined;

  /**
   * Clear active skill and remove all injected prompts/permissions
   */
  clearActiveSkill(): void;

  /**
   * Check whether a tool is allowed under the current active skill's restrictions
   */
  isToolAllowed(toolName: string): boolean;
}

// =============================================================================
// Loading
// =============================================================================

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

  // ===========================================================================
  // Shell & Conditional Trigger (Claude Code compatible)
  // ===========================================================================

  /**
   * Whether to execute embedded shell commands (!`command`) in skill content.
   * Default true for file-based skills, false for MCP-sourced skills.
   * Set to false to disable shell execution for security.
   */
  shell?: boolean;

  /**
   * File glob patterns that conditionally trigger this skill.
   * When a file matching these patterns is saved, the skill is auto-activated.
   * @example ["**\/*.fountain", "**\/*.fdx"]
   */
  paths?: string[];

  // ===========================================================================
  // Pipeline Configuration (Neko Suite extension)
  // ===========================================================================

  /**
   * Pipeline flow to execute when this skill is activated
   * @example "flowF", "flowA"
   */
  pipeline?: string;

  /**
   * Stages to skip in the pipeline
   * Comma-separated or YAML list
   * @example "generateMusic,addSubtitles"
   */
  'pipeline-skip'?: string;

  /**
   * Per-stage parameter overrides (JSON string in simple YAML)
   * @example "batchGenerate.style=anime,batchGenerate.resolution=1080p"
   */
  'pipeline-params'?: string;

  /**
   * Hook configurations (JSON string in simple YAML)
   */
  'pipeline-hooks'?: string;

  // ===========================================================================
  // Marketplace (injected by market install)
  // ===========================================================================

  /**
   * Market package identifier (injected during marketplace install)
   * @example "@publisher/skill-name"
   */
  'market-id'?: string;
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

// =============================================================================
// Resource Injection Types
// =============================================================================

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
 * Configured Skill (with UI/settings extensions)
 */
export interface ConfiguredSkill extends Skill {
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
  /** User notes/documentation */
  notes?: string;

  /** Tags for organization */
  tags?: string[];

  /** Last modified timestamp */
  lastModified?: number;
}

// =============================================================================
// UI Types
// =============================================================================

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

// =============================================================================
// Validation
// =============================================================================

export interface SkillValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert Skill to SkillSummary
 */
export function toSkillSummary(skill: Skill): SkillSummary {
  return {
    name: skill.name,
    description: skill.description,
    icon: skill.icon,
    source: skill.source,
    enabled: skill.enabled,
    type: 'skill',
  };
}

/**
 * Convert SlashCommand to SkillSummary
 */
export function toCommandSummary(command: SlashCommand): SkillSummary {
  return {
    name: command.command,
    description: command.description,
    icon: command.icon,
    source: command.source,
    enabled: command.enabled,
    type: 'slash-command',
    command: command.command,
    argumentHint: command.argumentHint,
  };
}

/**
 * Parse allowed-tools string into array
 */
export function parseAllowedTools(toolsStr: string | undefined): string[] | undefined {
  if (!toolsStr) return undefined;
  return toolsStr
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Check if a tool is allowed (Bash patterns only).
 *
 * @deprecated Use `matchesPattern` + `normalizeToolCall` from `@neko/agent/tools/tool-pattern-matcher`
 * for full pattern support including path globs, domain matching, and MCP tools.
 */
export function isToolAllowed(tool: string, allowedTools?: string[]): boolean {
  if (!allowedTools || allowedTools.length === 0) {
    return true;
  }

  for (const pattern of allowedTools) {
    // Exact match
    if (pattern === tool) {
      return true;
    }

    // Bash pattern matching
    if (pattern.startsWith('Bash(') && tool.startsWith('Bash(')) {
      const patternInner = pattern.slice(5, -1);
      const toolInner = tool.slice(5, -1);

      // "git:*" matches "git status", "git commit"
      if (patternInner.endsWith(':*')) {
        const cmdPrefix = patternInner.slice(0, -2);
        if (toolInner === cmdPrefix || toolInner.startsWith(cmdPrefix + ' ')) {
          return true;
        }
      } else if (patternInner.endsWith('*')) {
        const prefix = patternInner.slice(0, -1);
        if (toolInner.startsWith(prefix)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Validate a skill
 */
export function validateSkill(skill: Partial<Skill>): SkillValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!skill.name) {
    errors.push('Missing required field: name');
  } else {
    if (!/^[a-z0-9-]+$/.test(skill.name)) {
      errors.push('Name must contain only lowercase letters, numbers, and hyphens');
    }
    if (skill.name.length > 64) {
      errors.push('Name must be 64 characters or less');
    }
  }

  if (!skill.description) {
    errors.push('Missing required field: description');
  } else {
    if (skill.description.length > 2048) {
      errors.push('Description must be 2048 characters or less');
    }
    if (skill.description.length < 20) {
      warnings.push(
        'Description is very short. Consider adding more context for better semantic matching.',
      );
    }
  }

  if (!skill.content) {
    errors.push('Missing required field: content');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a slash command
 */
export function validateCommand(command: Partial<SlashCommand>): SkillValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!command.command) {
    errors.push('Missing required field: command');
  } else {
    if (!/^[a-z0-9-]+$/.test(command.command)) {
      errors.push('Command must contain only lowercase letters, numbers, and hyphens');
    }
  }

  if (!command.description) {
    errors.push('Missing required field: description');
  }

  if (!command.content) {
    errors.push('Missing required field: content');
  }

  return { valid: errors.length === 0, errors, warnings };
}

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
export function createSkill(
  frontmatter: SkillFrontmatter,
  content: string,
  source: SkillSource,
  directoryPath?: string,
  supportFileRefs?: string[],
  toolDefinitions?: SkillToolDefinition[],
): Skill {
  return {
    name: frontmatter.name,
    description: frontmatter.description,
    content,
    supportFileRefs,
    allowedTools: parseAllowedTools(frontmatter['allowed-tools']),
    toolsRef: frontmatter['tools-ref'],
    toolDefinitions,
    paths: frontmatter.paths,
    model: frontmatter.model,
    icon: frontmatter.icon,
    source,
    directoryPath,
    enabled: frontmatter.enabled ?? true,
    // Pipeline fields
    pipelineFlowId: frontmatter.pipeline,
    pipelineSkipStages: parsePipelineSkip(frontmatter['pipeline-skip']),
    pipelineParams: parsePipelineParams(frontmatter['pipeline-params']),
  };
}

/**
 * Create a SlashCommand from parsed frontmatter
 */
export function createCommand(
  frontmatter: CommandFrontmatter,
  content: string,
  source: SkillSource,
  filePath?: string,
): SlashCommand {
  return {
    command: frontmatter.command,
    description: frontmatter.description,
    content,
    argumentHint: frontmatter['argument-hint'],
    allowedTools: parseAllowedTools(frontmatter['allowed-tools']),
    model: frontmatter.model,
    icon: frontmatter.icon,
    source,
    filePath,
    enabled: frontmatter.enabled ?? true,
  };
}

/**
 * Parse pipeline-skip string into array
 * Accepts comma-separated values: "generateMusic,addSubtitles"
 */
export function parsePipelineSkip(skipStr: string | undefined): string[] | undefined {
  if (!skipStr) return undefined;
  const items = skipStr
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : undefined;
}

/**
 * Parse pipeline-params string into nested Record
 * Accepts dot-notation: "batchGenerate.style=anime,batchGenerate.resolution=1080p"
 */
export function parsePipelineParams(
  paramsStr: string | undefined,
): Record<string, Record<string, unknown>> | undefined {
  if (!paramsStr) return undefined;

  const result: Record<string, Record<string, unknown>> = {};
  const pairs = paramsStr.split(',').map((s) => s.trim());

  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;

    const key = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    const dotIdx = key.indexOf('.');

    if (dotIdx === -1) continue;

    const stageName = key.slice(0, dotIdx);
    const paramName = key.slice(dotIdx + 1);

    if (!result[stageName]) {
      result[stageName] = {};
    }
    // Try to parse as number/boolean
    if (value === 'true') {
      result[stageName][paramName] = true;
    } else if (value === 'false') {
      result[stageName][paramName] = false;
    } else if (!isNaN(Number(value)) && value !== '') {
      result[stageName][paramName] = Number(value);
    } else {
      result[stageName][paramName] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Extract support file references from markdown content
 * Matches: [Title](file.md) where file.md is a relative path
 */
export function extractSupportFileRefs(content: string): string[] {
  const refs: string[] = [];
  // Match markdown links: [text](path.md)
  const linkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const path = match[2];
    // Only include relative paths (not URLs or absolute paths)
    if (path && !path.startsWith('http') && !path.startsWith('/')) {
      refs.push(path);
    }
  }

  return [...new Set(refs)]; // Remove duplicates
}

// =============================================================================
// Tool Definition Conversion
// =============================================================================

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
export function skillToolToOpenAI(tool: SkillToolDefinition): OpenAIFunction {
  const properties: Record<string, OpenAIFunctionParameter> = {};
  const required: string[] = [];

  for (const [name, param] of Object.entries(tool.parameters)) {
    const prop: OpenAIFunctionParameter = {
      type: param.type,
    };

    if (param.description) {
      prop.description = param.description;
    }
    if (param.enum) {
      prop.enum = param.enum;
    }
    if (param.min !== undefined) {
      prop.minimum = param.min;
    }
    if (param.max !== undefined) {
      prop.maximum = param.max;
    }
    if (param.default !== undefined) {
      prop.default = param.default;
    }

    properties[name] = prop;

    if (param.required) {
      required.push(name);
    }
  }

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  };
}

/**
 * Convert multiple SkillToolDefinitions to OpenAI-compatible format
 */
export function skillToolsToOpenAI(tools: SkillToolDefinition[]): OpenAIFunction[] {
  return tools.map(skillToolToOpenAI);
}
