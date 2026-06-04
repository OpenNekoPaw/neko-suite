/**
 * Lazy Loader
 *
 * Lazy loading types and implementation for skills and commands.
 * Loads only frontmatter initially, content is loaded on-demand.
 */

import type {
  Skill,
  SlashCommand,
  SkillSource,
  SkillFrontmatter,
  CommandFrontmatter,
  SkillLoadError,
  ISkillFileSystem,
  SkillManifest,
} from '@neko/shared';
import { validateSkillManifest } from '@neko/shared';
import type { IMarkdownParser } from './markdown-parser';
import { getLogger } from '../utils/logger';

const logger = getLogger('LazyLoader');

// =============================================================================
// Lazy Loading Types
// =============================================================================

/**
 * Lazy-loaded skill - Only frontmatter loaded initially
 * Content is loaded on-demand when `loadContent()` is called
 */
export interface LazySkill {
  /** Skill name */
  name: string;
  /** Skill description (for semantic matching) */
  description: string;
  /** Icon */
  icon?: string;
  /** Source */
  source: SkillSource;
  /** Directory path */
  directoryPath: string;
  /** Program-facing metadata loaded from manifest.json without loading SKILL.md body */
  manifest?: SkillManifest;
  /** Whether content has been loaded */
  isLoaded: boolean;
  /** Load full skill content with support files */
  loadContent(): Promise<Skill>;
}

/**
 * Lazy-loaded slash command
 */
export interface LazyCommand {
  /** Command name (without /) */
  command: string;
  /** Description */
  description: string;
  /** Argument hint */
  argumentHint?: string;
  /** Icon */
  icon?: string;
  /** Source */
  source: SkillSource;
  /** File path */
  filePath: string;
  /** Whether content has been loaded */
  isLoaded: boolean;
  /** Load full command content */
  loadContent(): Promise<SlashCommand>;
}

/**
 * Lazy load result
 */
export interface LazySkillLoadResult {
  /** Skills discovered (frontmatter only) */
  skills: LazySkill[];
  /** Commands discovered (frontmatter only) */
  commands: LazyCommand[];
  /** Loading errors */
  errors: SkillLoadError[];
}

// =============================================================================
// Lazy Loader Interface
// =============================================================================

/**
 * Content loader callback type for lazy skills
 */
export type SkillContentLoader = (
  directoryPath: string,
  source: SkillSource,
) => Promise<Skill | null>;

/**
 * Content loader callback type for lazy commands
 */
export type CommandContentLoader = (
  filePath: string,
  source: SkillSource,
) => Promise<SlashCommand | null>;

/**
 * Lazy loader interface
 */
export interface ILazyLoader {
  /**
   * Load skills and commands lazily from a directory
   */
  loadLazyFromDirectory(
    skillsDir: string,
    source: SkillSource,
    skillLoader: SkillContentLoader,
    commandLoader: CommandContentLoader,
  ): Promise<LazySkillLoadResult>;

  /**
   * Create a lazy skill from frontmatter
   */
  createLazySkill(
    skillFilePath: string,
    directoryPath: string,
    source: SkillSource,
    loader: SkillContentLoader,
  ): Promise<LazySkill | null>;

  /**
   * Create a lazy command from frontmatter
   */
  createLazyCommand(
    filePath: string,
    source: SkillSource,
    loader: CommandContentLoader,
  ): Promise<LazyCommand | null>;
}

/**
 * Lazy loader implementation
 */
export class LazyLoader implements ILazyLoader {
  constructor(
    private readonly fs: ISkillFileSystem,
    private readonly parser: IMarkdownParser,
  ) {}

  /**
   * Load skills and commands lazily from a directory
   */
  async loadLazyFromDirectory(
    skillsDir: string,
    source: SkillSource,
    skillLoader: SkillContentLoader,
    commandLoader: CommandContentLoader,
  ): Promise<LazySkillLoadResult> {
    const result: LazySkillLoadResult = {
      skills: [],
      commands: [],
      errors: [],
    };

    // Check if directory exists
    const exists = await this.fs.exists(skillsDir);
    if (!exists) {
      return result;
    }

    // Read directory contents
    let entries: string[];
    try {
      entries = await this.fs.readDir(skillsDir);
    } catch (error) {
      result.errors.push({
        file: skillsDir,
        message: 'Failed to read skills directory',
        details: error instanceof Error ? error.message : String(error),
      });
      return result;
    }

    // Process each entry
    for (const entry of entries) {
      const entryPath = `${skillsDir}/${entry}`;

      try {
        const isDir = await this.fs.isDirectory(entryPath);

        if (isDir) {
          // Directory-based skill: look for SKILL.md
          const skillFilePath = `${entryPath}/SKILL.md`;
          const skillFileExists = await this.fs.exists(skillFilePath);

          if (skillFileExists) {
            const lazySkill = await this.createLazySkill(
              skillFilePath,
              entryPath,
              source,
              skillLoader,
            );
            if (lazySkill) {
              result.skills.push(lazySkill);
            }
          }
        } else if (entry.endsWith('.md') && entry !== 'README.md') {
          // Single file: could be skill or slash command
          const content = await this.fs.readFile(entryPath);
          const frontmatter = this.parser.parseFrontmatterOnly(content);

          if (frontmatter) {
            if ('command' in frontmatter && frontmatter.command) {
              // It's a slash command
              const lazyCommand = await this.createLazyCommand(entryPath, source, commandLoader);
              if (lazyCommand) {
                result.commands.push(lazyCommand);
              }
            } else if ('name' in frontmatter && frontmatter.name && frontmatter.description) {
              // It's a skill (but single-file skills are discouraged)
              logger.warn('Single-file skill detected, consider using directory structure', {
                path: entryPath,
              });
            }
          }
        }
      } catch (error) {
        result.errors.push({
          file: entryPath,
          message: 'Failed to load skill/command frontmatter',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Create a lazy skill from frontmatter
   */
  async createLazySkill(
    skillFilePath: string,
    directoryPath: string,
    source: SkillSource,
    loader: SkillContentLoader,
  ): Promise<LazySkill | null> {
    const content = await this.fs.readFile(skillFilePath);
    const frontmatter = this.parser.parseFrontmatterOnly(content);

    if (!frontmatter || !('name' in frontmatter) || 'command' in frontmatter) {
      return null;
    }

    // Now we know it's a SkillFrontmatter
    const skillFrontmatter = frontmatter as SkillFrontmatter;
    if (!skillFrontmatter.name || !skillFrontmatter.description) {
      return null;
    }
    const manifest = await this.loadSkillManifest(directoryPath);

    // Create lazy skill with deferred content loading
    let cachedSkill: Skill | null = null;

    const lazySkill: LazySkill = {
      name: skillFrontmatter.name,
      description: skillFrontmatter.description,
      icon: skillFrontmatter.icon,
      source,
      directoryPath,
      manifest,
      isLoaded: false,

      async loadContent(): Promise<Skill> {
        if (cachedSkill) {
          return cachedSkill;
        }

        // Load full skill with support files
        const skill = await loader(directoryPath, source);
        if (!skill) {
          throw new Error(`Failed to load skill content: ${directoryPath}`);
        }

        cachedSkill = skill;
        lazySkill.isLoaded = true;
        return skill;
      },
    };

    return lazySkill;
  }

  private async loadSkillManifest(directoryPath: string): Promise<SkillManifest | undefined> {
    const manifestPath = `${directoryPath}/manifest.json`;
    const exists = await this.fs.exists(manifestPath);
    if (!exists) return undefined;

    const raw = await this.fs.readFile(manifestPath);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `Failed to parse skill manifest.json: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const manifest = parsed as SkillManifest;
    const validation = validateSkillManifest(manifest);
    if (!validation.valid) {
      throw new Error(`Invalid skill manifest.json: ${validation.errors.join(', ')}`);
    }
    return manifest;
  }

  /**
   * Create a lazy command from frontmatter
   */
  async createLazyCommand(
    filePath: string,
    source: SkillSource,
    loader: CommandContentLoader,
  ): Promise<LazyCommand | null> {
    const content = await this.fs.readFile(filePath);
    const frontmatter = this.parser.parseFrontmatterOnly(content) as CommandFrontmatter | null;

    if (!frontmatter || !frontmatter.command || !frontmatter.description) {
      return null;
    }

    // Create lazy command with deferred content loading
    let cachedCommand: SlashCommand | null = null;

    const lazyCommand: LazyCommand = {
      command: frontmatter.command,
      description: frontmatter.description,
      argumentHint: frontmatter['argument-hint'],
      icon: frontmatter.icon,
      source,
      filePath,
      isLoaded: false,

      async loadContent(): Promise<SlashCommand> {
        if (cachedCommand) {
          return cachedCommand;
        }

        // Load full command
        const command = await loader(filePath, source);
        if (!command) {
          throw new Error(`Failed to load command content: ${filePath}`);
        }

        cachedCommand = command;
        lazyCommand.isLoaded = true;
        return command;
      },
    };

    return lazyCommand;
  }
}

/**
 * Create a lazy loader instance
 */
export function createLazyLoader(fs: ISkillFileSystem, parser: IMarkdownParser): ILazyLoader {
  return new LazyLoader(fs, parser);
}
