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
// SDD Skill extensions — see docs/architecture/agent-unified-workflow.md §5.2.1
// =============================================================================

/**
 * A phase inside a multi-stage Skill (ADR §5.2.1 `phases:` + agent-unified-
 * workflow.md §6.5 StageGuardian).
 *
 * Phases describe the Skill's internal orchestration — e.g. a TikTok
 * creation Skill might declare shot-breakdown / shot-generation / export
 * phases with approval gates between them. The fields here are declarative
 * only; the runtime StageGuardian is responsible for honouring them.
 *
 * ## DAG semantics (W1)
 *
 * Phases form a DAG when `dependsOn` is populated. Phases with no
 * `dependsOn` are roots (can start immediately); a phase becomes runnable
 * once all its dependencies are in a terminal state. The scheduler (W3)
 * identifies parallel-runnable batches by topological rank.
 *
 *   phases:
 *     - name: parse-storyboard
 *       tool: parseStoryboard
 *       outputKey: scenes
 *     - name: generate-prompts
 *       dependsOn: [parse-storyboard]
 *       tool: generatePrompts
 *       outputKey: prompts
 *     - name: batch-generate
 *       dependsOn: [generate-prompts]
 *       tool: batchGenerate
 *       parallel: true           # scheduler fans out per-prompt
 *       outputKey: assets
 *     - name: quality-gate
 *       dependsOn: [batch-generate]
 *       approval: true           # StageGuardian halts until ApprovalEngine resolves
 *
 * ## Tool binding (W1)
 *
 * When `tool` is set, the runtime knows which tool implements the phase;
 * phases without `tool` are purely narrative (the Agent executes them by
 * reading the Skill body). `allowedTools` narrows what the Agent may call
 * from inside the phase — useful when the phase is scripted through the
 * model rather than a single tool.
 *
 * ## Output routing (W1)
 *
 * `outputKey` names the slot on the run's shared context where the phase's
 * result lands. Subsequent phases read it via the same key. Keeping this
 * in the manifest (rather than implicit ordering) lets the scheduler
 * build the context object deterministically without asking the Agent to
 * memorise intermediate values.
 */
export interface SkillPhase {
  /** Stable phase identifier, unique within a Skill. */
  name: string;
  /** Human-readable phase label for UI/logs. */
  label: string;
  /** Whether the phase requires user approval before advancing. */
  approval?: boolean;
  /** Whether the phase's work can run in parallel (e.g. per-shot generation). */
  parallel?: boolean;
  /**
   * Names of phases that must reach a terminal state before this phase may
   * run. Each entry must match another phase's `name` within the same
   * Skill; missing references and cycles are rejected by
   * `validateSkillManifest`.
   */
  dependsOn?: string[];
  /**
   * Tool id the scheduler invokes for this phase. Optional — phases
   * without a tool are narrative steps executed by the Agent interpreting
   * the Skill body.
   */
  tool?: string;
  /**
   * Key in the run's shared context under which the phase's output is
   * stored. Downstream phases read by the same key.
   */
  outputKey?: string;
  /**
   * Tool whitelist for Agent-driven (no explicit `tool`) phases. The
   * runtime (StageGuardian) denies tool calls outside this list while the
   * phase is active.
   */
  allowedTools?: string[];
}

/**
 * Subpackage dependency declared by a Skill (ADR §5.2.1 `requiredSubpackages:`).
 *
 * Keeps dependency granularity at the subpackage level rather than the
 * command level (user intuition, low maintenance). Activation-time guard
 * rejects or warns per the strict/optional flag.
 */
export interface RequiredSubpackage {
  /** Subpackage id (e.g. `neko-cut`). */
  id: string;
  /** Required (blocks activation if missing) vs optional (warn + degrade). */
  required: boolean;
  /** Semver constraint the caller's installed version must satisfy. */
  minVersion?: string;
  /** Fallback message / behaviour when the subpackage is absent. */
  fallback?: {
    message: string;
  };
}

/**
 * Asset reference declared by a Skill (ADR §5.2.1 `referencedAssets:`).
 *
 * Assets live in the media library, not inside the Skill folder, so the
 * Skill only carries an `asset://` URI. Absent required assets block
 * activation; absent optional ones just log a warning.
 */
export interface SkillAssetReference {
  /** `asset://{type}/{id}` URI resolved by PathResolver. */
  uri: string;
  /** Whether the asset is required for the Skill to function. */
  required?: boolean;
  /** Short note explaining what the asset is used for. */
  purpose?: string;
}

/**
 * Cross-Skill reference (ADR §5.2.1 `referencedSkills:`).
 *
 * Declares collaboration or delegation relationships so runtime tooling
 * (e.g. auto-suggesting a collaborator mid-flow) can surface the link
 * without scanning the registry.
 *
 * Distinct from the existing `SkillReference` (a support-document
 * reference defined below) — this type names a related *Skill*, not a
 * support file.
 */
export interface RelatedSkill {
  /** Referenced Skill name. */
  id: string;
  /** Nature of the relationship. */
  relationship: 'collaborator' | 'delegator';
}

/**
 * Compliance metadata (ADR §5.2.1 / §9.6 `compliance:`).
 *
 * Purely declarative. Audit pipelines read this block to decide
 * whether a Skill's execution must be recorded with extra evidence
 * (e.g. the skillSha chain in audits.jsonl).
 */
export interface SkillCompliance {
  /** Named compliance framework (SOC2, GDPR, "creator-standard", …). */
  framework?: string;
  /** Whether audit capture is mandatory when this Skill runs. */
  auditRequired?: boolean;
  /** Reviewer roles that signed off on the Skill definition. */
  reviewedBy?: string[];
  /** ISO date of the last compliance review. */
  reviewDate?: string;
}

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

  // ===========================================================================
  // SDD metadata (agent-unified-workflow.md §5.2.1)
  //
  // These fields capture the Skill's contract beyond "what tools it may
  // call". They are declarative: runtime components (StageGuardian,
  // subpackage-dependency guard, compliance audit) consume them. See
  // docs/architecture/agent-unified-workflow.md §5.2.1 for the authoritative
  // schema.
  // ===========================================================================

  /**
   * Semver version string. Required by the SDD spec so audit / compatibility
   * tooling can pin to a specific Skill revision.
   * @example "1.0.0"
   */
  version?: string;

  /**
   * Domain identifier — groups Skills by creative vertical (cut / story /
   * canvas / …). Free-form for now so new domains can be added without a
   * schema bump.
   * @example "cut"
   */
  domain?: string;

  /**
   * Subpackages the Skill depends on. Activation-time guard enforces the
   * `required` flag and optionally the `minVersion` constraint.
   */
  requiredSubpackages?: RequiredSubpackage[];

  /**
   * Whether AutoMode may auto-select this Skill based on description
   * matching. Falls back to true when omitted; set false for high-risk or
   * test Skills that should only activate on explicit user intent.
   * @default true
   */
  autoInvoke?: boolean;

  /**
   * Multi-stage orchestration embedded in the Skill. Each phase is a
   * logical checkpoint; StageGuardian can enforce ordering and approval
   * gates at runtime.
   */
  phases?: SkillPhase[];

  /**
   * Assets (characters, styles, LoRAs, …) the Skill relies on. Resolved
   * through PathResolver against the configured media library.
   */
  referencedAssets?: SkillAssetReference[];

  /**
   * Related Skills — collaborators the runtime can surface when the user
   * crosses domain boundaries, or delegators the Skill hands off to.
   */
  referencedSkills?: RelatedSkill[];

  /**
   * Compliance metadata. Consumed by audit tooling; does not change
   * runtime behaviour on its own.
   */
  compliance?: SkillCompliance;
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

  /**
   * Ensure a skill's content is fully loaded (tiered loading support).
   * For lazy skills, triggers deferred content load.
   * For eager skills, returns immediately.
   */
  ensureLoaded(name: string): Promise<Skill | undefined>;

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
  // Marketplace (injected by market install)
  // ===========================================================================

  /**
   * Market package identifier (injected during marketplace install)
   * @example "@publisher/skill-name"
   */
  'market-id'?: string;

  // Note: SDD metadata (version, domain, requiredSubpackages, autoInvoke,
  // phases, pipelines, referencedAssets, referencedSkills, compliance) lives
  // in a sibling `manifest.json` file — see SkillManifest below. SKILL.md
  // frontmatter is reserved for document metadata only (fields that also
  // shape how Claude / Agent reads the document). Rationale: Skill body is
  // consumed by the LLM as natural language; structural configuration that
  // only the runtime cares about should not clutter the prompt window nor
  // the author-facing YAML block.
}

// =============================================================================
// SkillManifest — sibling `manifest.json` for SDD configuration
// =============================================================================

/**
 * Configuration metadata that lives in `{skill-dir}/manifest.json`, not in
 * SKILL.md frontmatter. The manifest is the program-facing contract — only
 * runtime code (loader / marketplace installer / activation guard) reads it.
 *
 * See agent-unified-workflow.md §5.2.1. The split between manifest and
 * SKILL.md matches the division of labour:
 *
 *   - **manifest.json** (this type): fields the runtime must inspect before
 *     running the Skill — version compatibility, subpackage dependencies,
 *     autoInvoke flag, compliance rules. Machine-readable JSON; validated
 *     at market install time and at Skill activation.
 *   - **SKILL.md body**: fields the Agent needs to understand semantically
 *     — description, persona, phases narrative, pipeline instructions.
 *     Natural language; consumed as a system prompt.
 *
 * Optional so older skills (manifest-less) keep loading; the validator
 * emits warnings rather than errors for missing fields.
 */
export interface SkillManifest {
  /** Semver version string. Required by the SDD spec for audit tracing. */
  version?: string;

  /** Domain identifier (cut / story / canvas / ...). Free-form. */
  domain?: string;

  /** Subpackage dependencies enforced at activation time. */
  requiredSubpackages?: RequiredSubpackage[];

  /**
   * Whether AutoMode may auto-select this Skill. Defaults to true when
   * omitted; set false for high-risk or test-only Skills.
   */
  autoInvoke?: boolean;

  /**
   * Multi-stage orchestration. Declares phase ordering and approval
   * gates; StageGuardian enforces them at runtime.
   */
  phases?: SkillPhase[];

  /** Assets the Skill depends on (resolved via PathResolver). */
  referencedAssets?: SkillAssetReference[];

  /** Cross-Skill relationships surfaced by the runtime. */
  referencedSkills?: RelatedSkill[];

  /** Compliance metadata consumed by audit tooling. */
  compliance?: SkillCompliance;
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
 * DAG validator for SkillPhase[]. Checks that every `dependsOn` entry
 * names a known phase and that the resulting graph has no cycles. Kept
 * module-private because the only caller is validateSkillManifest, and
 * it mutates the shared `errors` array instead of returning a result so
 * error messages stay in phase-declaration order.
 */
function validatePhaseDag(phases: readonly SkillPhase[], errors: string[]): void {
  const byName: Record<string, SkillPhase> = {};
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    if (p && typeof p.name === 'string' && p.name.length > 0 && !byName[p.name]) {
      byName[p.name] = p;
    }
  }

  // Reference check.
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    if (!p || !Array.isArray(p.dependsOn)) continue;
    for (const dep of p.dependsOn) {
      if (typeof dep !== 'string' || dep.length === 0) continue;
      if (!byName[dep]) {
        errors.push(`phases[${i}].dependsOn references unknown phase "${dep}"`);
      }
    }
  }

  // Cycle check via iterative DFS. `state` tracks: 'visiting' means on
  // the current path; 'done' means fully explored.
  const state: Record<string, 'visiting' | 'done'> = {};
  const phaseNames = Object.keys(byName);
  for (let i = 0; i < phaseNames.length; i++) {
    const start = phaseNames[i]!;
    if (state[start]) continue;
    const stack: Array<{ name: string; depIdx: number }> = [{ name: start, depIdx: 0 }];
    state[start] = 'visiting';
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const phase = byName[top.name];
      const deps = phase && Array.isArray(phase.dependsOn) ? phase.dependsOn : [];
      if (top.depIdx >= deps.length) {
        state[top.name] = 'done';
        stack.pop();
        continue;
      }
      const dep = deps[top.depIdx]!;
      top.depIdx++;
      if (!byName[dep]) continue; // already reported by the reference check
      if (state[dep] === 'visiting') {
        errors.push(`phases cycle detected through "${dep}" — dependsOn graph must be acyclic`);
        // Abort this traversal; the rest of the graph will be checked
        // on subsequent start points (cycle already reported).
        while (stack.length > 0) {
          state[stack[stack.length - 1]!.name] = 'done';
          stack.pop();
        }
        break;
      }
      if (state[dep] !== 'done') {
        state[dep] = 'visiting';
        stack.push({ name: dep, depIdx: 0 });
      }
    }
  }
}

/**
 * Semver-ish regex: major.minor.patch with optional pre-release and build
 * metadata. Deliberately not importing a full semver library — Skills
 * author-input versions are validated to catch typos, not to run complex
 * range queries.
 */
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

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

  // Runtime Skill objects carry the merged manifest + frontmatter view, so
  // a single Skill snapshot is validated against both contracts here. The
  // manifest validator takes the shared error/warning arrays so its
  // findings are reported alongside content-level errors.
  validateSkillManifest(skill, errors, warnings);

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate the SDD manifest fields (agent-unified-workflow.md §5.2.1).
 *
 * Accepts either a runtime `Skill` (where the manifest has been merged in)
 * or a standalone `SkillManifest` loaded from `manifest.json`. All fields
 * are optional for backwards compatibility; missing `version` / `domain`
 * only warn so legacy skills keep loading.
 *
 * This function is called by both the Skill loader (runtime snapshot) and
 * the marketplace installer (pre-install audit of the manifest alone).
 */
export function validateSkillManifest(
  manifest: Partial<SkillManifest>,
  errors: string[] = [],
  warnings: string[] = [],
): SkillValidationResult {
  // version: warn if missing, error if malformed.
  if (manifest.version === undefined) {
    warnings.push('Missing SDD metadata field: version (recommended, semver string)');
  } else if (typeof manifest.version !== 'string' || !SEMVER_RE.test(manifest.version)) {
    errors.push(`Invalid version "${manifest.version}" — must be a semver string (e.g. "1.0.0")`);
  }

  // domain: warn if missing, error if empty string.
  if (manifest.domain === undefined) {
    warnings.push('Missing SDD metadata field: domain (recommended, e.g. "cut" / "story")');
  } else if (typeof manifest.domain !== 'string' || manifest.domain.trim().length === 0) {
    errors.push('Field "domain" must be a non-empty string');
  }

  // requiredSubpackages: shape check. Duplicate ids are an error.
  if (manifest.requiredSubpackages !== undefined) {
    if (!Array.isArray(manifest.requiredSubpackages)) {
      errors.push('Field "requiredSubpackages" must be an array');
    } else {
      const seenIds: Record<string, true> = {};
      for (let idx = 0; idx < manifest.requiredSubpackages.length; idx++) {
        const dep = manifest.requiredSubpackages[idx];
        if (!dep || typeof dep !== 'object') {
          errors.push(`requiredSubpackages[${idx}] must be an object`);
          continue;
        }
        if (typeof dep.id !== 'string' || dep.id.length === 0) {
          errors.push(`requiredSubpackages[${idx}].id must be a non-empty string`);
        } else if (seenIds[dep.id]) {
          errors.push(`Duplicate requiredSubpackages entry for id "${dep.id}"`);
        } else {
          seenIds[dep.id] = true;
        }
        if (typeof dep.required !== 'boolean') {
          errors.push(`requiredSubpackages[${idx}].required must be a boolean`);
        }
        if (dep.minVersion !== undefined && !SEMVER_RE.test(String(dep.minVersion))) {
          errors.push(`requiredSubpackages[${idx}].minVersion must be a semver string`);
        }
      }
    }
  }

  // autoInvoke: boolean if present.
  if (manifest.autoInvoke !== undefined && typeof manifest.autoInvoke !== 'boolean') {
    errors.push('Field "autoInvoke" must be a boolean');
  }

  // phases: shape + unique names.
  if (manifest.phases !== undefined) {
    if (!Array.isArray(manifest.phases)) {
      errors.push('Field "phases" must be an array');
    } else {
      const seenNames: Record<string, true> = {};
      for (let idx = 0; idx < manifest.phases.length; idx++) {
        const phase = manifest.phases[idx];
        if (!phase || typeof phase !== 'object') {
          errors.push(`phases[${idx}] must be an object`);
          continue;
        }
        if (typeof phase.name !== 'string' || phase.name.length === 0) {
          errors.push(`phases[${idx}].name must be a non-empty string`);
        } else if (seenNames[phase.name]) {
          errors.push(`Duplicate phase name "${phase.name}" — phase names must be unique`);
        } else {
          seenNames[phase.name] = true;
        }
        if (typeof phase.label !== 'string' || phase.label.length === 0) {
          errors.push(`phases[${idx}].label must be a non-empty string`);
        }
        if (phase.approval !== undefined && typeof phase.approval !== 'boolean') {
          errors.push(`phases[${idx}].approval must be a boolean`);
        }
        if (phase.parallel !== undefined && typeof phase.parallel !== 'boolean') {
          errors.push(`phases[${idx}].parallel must be a boolean`);
        }
        if (phase.dependsOn !== undefined) {
          if (!Array.isArray(phase.dependsOn)) {
            errors.push(`phases[${idx}].dependsOn must be an array of phase names`);
          } else {
            for (let depIdx = 0; depIdx < phase.dependsOn.length; depIdx++) {
              const dep = phase.dependsOn[depIdx];
              if (typeof dep !== 'string' || dep.length === 0) {
                errors.push(`phases[${idx}].dependsOn[${depIdx}] must be a non-empty string`);
              } else if (dep === phase.name) {
                errors.push(
                  `phases[${idx}].dependsOn cannot reference the phase itself ("${dep}")`,
                );
              }
            }
          }
        }
        if (
          phase.tool !== undefined &&
          (typeof phase.tool !== 'string' || phase.tool.length === 0)
        ) {
          errors.push(`phases[${idx}].tool must be a non-empty string`);
        }
        if (
          phase.outputKey !== undefined &&
          (typeof phase.outputKey !== 'string' || phase.outputKey.length === 0)
        ) {
          errors.push(`phases[${idx}].outputKey must be a non-empty string`);
        }
        if (phase.allowedTools !== undefined) {
          if (!Array.isArray(phase.allowedTools)) {
            errors.push(`phases[${idx}].allowedTools must be an array of tool ids`);
          } else {
            for (let toolIdx = 0; toolIdx < phase.allowedTools.length; toolIdx++) {
              const tool = phase.allowedTools[toolIdx];
              if (typeof tool !== 'string' || tool.length === 0) {
                errors.push(`phases[${idx}].allowedTools[${toolIdx}] must be a non-empty string`);
              }
            }
          }
        }
      }

      // DAG validation: every dependsOn must reference a known phase,
      // and the graph must be acyclic. Running after the shape loop so
      // we already know which names are valid.
      validatePhaseDag(manifest.phases, errors);
    }
  }

  // Note: pipeline definitions live inside subpackages that own the
  // underlying atomic tools. Skills are orchestration prompts, not
  // pipeline definitions — the Agent drives execution via TOOL_NAMES.
  // If a real cross-Skill sharing need emerges, introduce a
  // `pipelineRefs` pointer field, not inline op definitions.

  // referencedAssets: require asset:// URI.
  if (manifest.referencedAssets !== undefined) {
    if (!Array.isArray(manifest.referencedAssets)) {
      errors.push('Field "referencedAssets" must be an array');
    } else {
      for (let idx = 0; idx < manifest.referencedAssets.length; idx++) {
        const ref = manifest.referencedAssets[idx];
        if (!ref || typeof ref !== 'object') {
          errors.push(`referencedAssets[${idx}] must be an object`);
          continue;
        }
        if (typeof ref.uri !== 'string' || !ref.uri.startsWith('asset://')) {
          errors.push(`referencedAssets[${idx}].uri must start with "asset://"`);
        }
      }
    }
  }

  // referencedSkills: require relationship enum.
  if (manifest.referencedSkills !== undefined) {
    if (!Array.isArray(manifest.referencedSkills)) {
      errors.push('Field "referencedSkills" must be an array');
    } else {
      for (let idx = 0; idx < manifest.referencedSkills.length; idx++) {
        const ref = manifest.referencedSkills[idx];
        if (!ref || typeof ref !== 'object') {
          errors.push(`referencedSkills[${idx}] must be an object`);
          continue;
        }
        if (typeof ref.id !== 'string' || ref.id.length === 0) {
          errors.push(`referencedSkills[${idx}].id must be a non-empty string`);
        }
        if (ref.relationship !== 'collaborator' && ref.relationship !== 'delegator') {
          errors.push(
            `referencedSkills[${idx}].relationship must be "collaborator" or "delegator"`,
          );
        }
      }
    }
  }

  // compliance: light shape check; semantics are caller-defined.
  if (manifest.compliance !== undefined) {
    if (typeof manifest.compliance !== 'object' || Array.isArray(manifest.compliance)) {
      errors.push('Field "compliance" must be an object');
    } else {
      const c = manifest.compliance;
      if (c.framework !== undefined && typeof c.framework !== 'string') {
        errors.push('compliance.framework must be a string');
      }
      if (c.auditRequired !== undefined && typeof c.auditRequired !== 'boolean') {
        errors.push('compliance.auditRequired must be a boolean');
      }
      if (c.reviewedBy !== undefined && !Array.isArray(c.reviewedBy)) {
        errors.push('compliance.reviewedBy must be an array of strings');
      }
      if (c.reviewDate !== undefined && typeof c.reviewDate !== 'string') {
        errors.push('compliance.reviewDate must be an ISO date string');
      }
    }
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
 * Create a Skill from its sources.
 *
 * SKILL.md frontmatter is the document-facing surface (name, description,
 * persona fields that also shape the prompt). SDD configuration fields
 * live in a sibling `manifest.json` loaded separately and merged here —
 * keeping the prompt-visible YAML lean while still giving the runtime a
 * single `Skill` snapshot to reason about.
 *
 * @param frontmatter Parsed YAML frontmatter from SKILL.md
 * @param content SKILL.md body content
 * @param source Skill source (builtin, personal, project)
 * @param directoryPath Skill directory path
 * @param supportFileRefs Referenced support file paths (progressive disclosure)
 * @param toolDefinitions Tool definitions loaded from tools.md
 * @param manifest Optional manifest.json contents (SDD metadata)
 */
export function createSkill(
  frontmatter: SkillFrontmatter,
  content: string,
  source: SkillSource,
  directoryPath?: string,
  supportFileRefs?: string[],
  toolDefinitions?: SkillToolDefinition[],
  manifest?: SkillManifest,
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
    // SDD metadata (§5.2.1) — pulled from manifest.json, not frontmatter.
    version: manifest?.version,
    domain: manifest?.domain,
    requiredSubpackages: manifest?.requiredSubpackages,
    autoInvoke: manifest?.autoInvoke,
    phases: manifest?.phases,
    referencedAssets: manifest?.referencedAssets,
    referencedSkills: manifest?.referencedSkills,
    compliance: manifest?.compliance,
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
 * Extract support file references from markdown content
 * Matches: [Title](file.md) where file.md is a relative path
 */
export function extractSupportFileRefs(content: string): string[] {
  const refs: string[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const path = match[2];
    if (path && !path.startsWith('http') && !path.startsWith('/')) {
      refs.push(path);
    }
  }

  const seen: Record<string, boolean> = {};
  const unique: string[] = [];
  for (const r of refs) {
    if (!seen[r]) {
      seen[r] = true;
      unique.push(r);
    }
  }
  return unique;
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
