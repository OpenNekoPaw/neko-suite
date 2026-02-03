/**
 * Skill Loader - Loads skills and slash commands from .md files
 *
 * Directory structure:
 *
 * Skills (.neko/skills/):
 * - .neko/skills/ (project-level skills)
 *   - skill-name/
 *     - SKILL.md (main skill file)
 *     - reference.md (optional support file)
 *     - examples.md (optional support file)
 *
 * - ~/.neko/skills/ (personal skills)
 *   - Same structure as above
 *
 * Slash Commands (.neko/commands/):
 * - .neko/commands/ (project-level commands)
 *   - command-name.md (single-file slash command)
 *
 * - ~/.neko/commands/ (personal commands)
 *   - Same structure as above
 */

import type {
  Skill,
  SlashCommand,
  SkillSource,
  SkillFrontmatter,
  CommandFrontmatter,
  ParsedSkillFile,
  SkillLoadResult,
  ISkillFileSystem,
  SkillToolDefinition,
  ToolsFileFrontmatter,
  SkillReference,
  SkillScript,
  SkillContentConfig,
} from '@uniedit/shared';
import {
  createSkill,
  createCommand,
  validateSkill,
  validateCommand,
  extractSupportFileRefs,
} from '@uniedit/shared';
import { MarkdownParser, type IMarkdownParser } from './markdown-parser';
import { LazyLoader, type ILazyLoader, type LazySkillLoadResult } from './lazy-loader';
import type { LazySkill, LazyCommand } from './lazy-loader';

/**
 * Skill Loader class
 */
export class SkillLoader {
  private readonly fs: ISkillFileSystem;
  private readonly parser: IMarkdownParser;
  private readonly lazyLoader: ILazyLoader;

  constructor(fs: ISkillFileSystem) {
    this.fs = fs;
    this.parser = new MarkdownParser();
    this.lazyLoader = new LazyLoader(fs, this.parser);
  }

  // ===========================================================================
  // Lazy Loading (Recommended for performance)
  // ===========================================================================

  /**
   * Load skills and commands lazily - Only loads frontmatter initially
   * Content is loaded on-demand when skill/command is applied
   */
  async loadLazyFromDirectory(
    skillsDir: string,
    source: SkillSource = 'project'
  ): Promise<LazySkillLoadResult> {
    return this.lazyLoader.loadLazyFromDirectory(
      skillsDir,
      source,
      (dirPath, src) => this.loadSkillFromDirectory(dirPath, src),
      (filePath, src) => this.loadCommandFile(filePath, src)
    );
  }

  /**
   * Load only frontmatter from a skill directory (lazy loading)
   */
  async loadLazySkill(
    skillFilePath: string,
    directoryPath: string,
    source: SkillSource
  ): Promise<LazySkill | null> {
    return this.lazyLoader.createLazySkill(
      skillFilePath,
      directoryPath,
      source,
      (dirPath, src) => this.loadSkillFromDirectory(dirPath, src)
    );
  }

  /**
   * Load only frontmatter from a command file (lazy loading)
   */
  async loadLazyCommand(
    filePath: string,
    source: SkillSource
  ): Promise<LazyCommand | null> {
    return this.lazyLoader.createLazyCommand(
      filePath,
      source,
      (fp, src) => this.loadCommandFile(fp, src)
    );
  }

  /**
   * Parse only the frontmatter from markdown content (fast path)
   */
  parseFrontmatterOnly(
    content: string
  ): (SkillFrontmatter | CommandFrontmatter) | null {
    return this.parser.parseFrontmatterOnly(content);
  }

  // ===========================================================================
  // Full Loading (Loads entire skill including content and support files)
  // ===========================================================================

  /**
   * Load all skills and commands from a directory
   */
  async loadFromDirectory(
    skillsDir: string,
    source: SkillSource = 'project'
  ): Promise<SkillLoadResult> {
    const result: SkillLoadResult = {
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
            const skill = await this.loadSkillFromDirectory(entryPath, source);
            if (skill) {
              result.skills.push(skill);
            }
          }
        } else if (entry.endsWith('.md') && entry !== 'README.md') {
          // Single file: check if it's a slash command
          const content = await this.fs.readFile(entryPath);
          const frontmatter = this.parser.parseFrontmatterOnly(content);

          if (frontmatter && 'command' in frontmatter) {
            const command = await this.loadCommandFile(entryPath, source);
            if (command) {
              result.commands.push(command);
            }
          }
        }
      } catch (error) {
        result.errors.push({
          file: entryPath,
          message: 'Failed to load skill/command',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Load a skill from a directory (including support files)
   */
  async loadSkillFromDirectory(
    directoryPath: string,
    source: SkillSource
  ): Promise<Skill | null> {
    const skillFilePath = `${directoryPath}/SKILL.md`;
    const content = await this.fs.readFile(skillFilePath);
    const parsed = this.parser.parseMarkdown(content);

    if (!parsed || !parsed.frontmatter.name) {
      throw new Error('Failed to parse SKILL.md: Invalid frontmatter');
    }

    // Check if it's actually a skill (not a command)
    if ('command' in parsed.frontmatter) {
      return null;
    }

    const frontmatter = parsed.frontmatter as SkillFrontmatter;

    // Progressive Disclosure: Only extract support file references
    const supportFileRefs = extractSupportFileRefs(parsed.content);

    // Validate that referenced files exist
    const validRefs: string[] = [];
    for (const ref of supportFileRefs) {
      const supportFilePath = `${directoryPath}/${ref}`;
      try {
        const fileExists = await this.fs.exists(supportFilePath);
        if (fileExists) {
          validRefs.push(ref);
        } else {
          console.warn(`[SkillLoader] Support file not found: ${supportFilePath}`);
        }
      } catch {
        // Ignore errors, file just won't be in validRefs
      }
    }

    // Load tool definitions from tools-ref if specified
    let toolDefinitions: SkillToolDefinition[] | undefined;
    if (frontmatter['tools-ref']) {
      const toolsFilePath = `${directoryPath}/${frontmatter['tools-ref']}`;
      try {
        toolDefinitions = await this.loadToolDefinitions(toolsFilePath);
      } catch (error) {
        console.warn(
          `[SkillLoader] Failed to load tools file ${toolsFilePath}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // Progressive Disclosure: Load references and scripts metadata (not content)
    const references = await this.loadReferences(directoryPath);
    const scripts = await this.loadScripts(directoryPath);

    // Parse allowed tools from frontmatter
    const parsedAllowedTools = frontmatter['allowed-tools']
      ? (Array.isArray(frontmatter['allowed-tools'])
          ? frontmatter['allowed-tools']
          : [frontmatter['allowed-tools']])
      : undefined;

    // Build content config if any content exists
    let contentConfig: SkillContentConfig | undefined;
    if (references.length > 0 || scripts.length > 0 || parsedAllowedTools) {
      contentConfig = {
        references: references.length > 0 ? references : undefined,
        scripts: scripts.length > 0 ? scripts : undefined,
        allowedTools: parsedAllowedTools,
      };
    }

    const skill = createSkill(
      frontmatter,
      parsed.content,
      source,
      directoryPath,
      validRefs.length > 0 ? validRefs : undefined,
      toolDefinitions,
      contentConfig
    );

    // Validate
    const validation = validateSkill(skill);
    if (!validation.valid) {
      throw new Error(`Invalid skill: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      console.warn(
        `[SkillLoader] Warnings for ${skill.name}: ${validation.warnings.join(', ')}`
      );
    }

    return skill;
  }

  /**
   * Load tool definitions from a tools.md file
   * The file should have YAML frontmatter with a 'tools' array
   */
  async loadToolDefinitions(filePath: string): Promise<SkillToolDefinition[]> {
    const exists = await this.fs.exists(filePath);
    if (!exists) {
      throw new Error(`Tools file not found: ${filePath}`);
    }

    const content = await this.fs.readFile(filePath);
    const parsed = this.parser.parseMarkdown(content);

    if (!parsed) {
      throw new Error(`Failed to parse tools file: ${filePath}`);
    }

    const frontmatter = parsed.frontmatter as unknown as ToolsFileFrontmatter;
    if (!frontmatter.tools || !Array.isArray(frontmatter.tools)) {
      throw new Error(`Tools file missing 'tools' array in frontmatter: ${filePath}`);
    }

    // Validate and normalize tool definitions
    const tools: SkillToolDefinition[] = [];
    for (const tool of frontmatter.tools) {
      if (!tool.name || !tool.description) {
        console.warn(`[SkillLoader] Skipping invalid tool definition (missing name or description)`);
        continue;
      }

      tools.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || {},
      });
    }

    return tools;
  }

  /**
   * Load references from skill's references/ directory
   * Progressive Disclosure: Only loads metadata, not file content
   */
  async loadReferences(directoryPath: string): Promise<SkillReference[]> {
    const referencesDir = `${directoryPath}/references`;
    const references: SkillReference[] = [];

    try {
      const exists = await this.fs.exists(referencesDir);
      if (!exists) {
        return references;
      }

      const entries = await this.fs.readDir(referencesDir);

      for (const entry of entries) {
        // Only include markdown files
        if (!entry.endsWith('.md')) {
          continue;
        }

        const filePath = `${referencesDir}/${entry}`;
        const isDir = await this.fs.isDirectory(filePath);
        if (isDir) {
          continue;
        }

        // Extract name from filename (remove .md extension)
        const name = entry.replace(/\.md$/, '');

        // Try to read first line as description (optional)
        let description: string | undefined;
        try {
          const content = await this.fs.readFile(filePath);
          const firstLine = content.split('\n')[0];
          // If first line is a markdown heading, use it as description
          if (firstLine?.startsWith('# ')) {
            description = firstLine.substring(2).trim();
          }
        } catch {
          // Ignore read errors, description is optional
        }

        references.push({
          path: entry, // Relative path from skill directory
          name,
          description,
          inject: false, // Default: not auto-injected
        });
      }
    } catch (error) {
      console.warn(
        `[SkillLoader] Failed to load references from ${referencesDir}:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    return references;
  }

  /**
   * Load scripts from skill's scripts/ directory
   * Progressive Disclosure: Only loads metadata, not file content
   */
  async loadScripts(directoryPath: string): Promise<SkillScript[]> {
    const scriptsDir = `${directoryPath}/scripts`;
    const scripts: SkillScript[] = [];

    try {
      const exists = await this.fs.exists(scriptsDir);
      if (!exists) {
        return scripts;
      }

      const entries = await this.fs.readDir(scriptsDir);

      for (const entry of entries) {
        const filePath = `${scriptsDir}/${entry}`;
        const isDir = await this.fs.isDirectory(filePath);
        if (isDir) {
          continue;
        }

        // Determine language from extension
        let language: SkillScript['language'];
        if (entry.endsWith('.py')) {
          language = 'python';
        } else if (entry.endsWith('.ts')) {
          language = 'typescript';
        } else if (entry.endsWith('.js')) {
          language = 'javascript';
        } else if (entry.endsWith('.sh') || entry.endsWith('.bash')) {
          language = 'shell';
        } else {
          // Skip unsupported file types
          continue;
        }

        // Extract name from filename (remove extension)
        const name = entry.replace(/\.(py|ts|js|sh|bash)$/, '');

        // Try to read first comment as description (optional)
        let description: string | undefined;
        try {
          const content = await this.fs.readFile(filePath);
          const firstLine = content.split('\n')[0];
          // Check for common comment patterns
          if (firstLine?.startsWith('# ') && language !== 'typescript' && language !== 'javascript') {
            description = firstLine.substring(2).trim();
          } else if (firstLine?.startsWith('// ')) {
            description = firstLine.substring(3).trim();
          } else if (firstLine?.startsWith('"""') || firstLine?.startsWith("'''")) {
            // Python docstring - try to get first line
            const match = content.match(/^(?:"""|''')(.*?)(?:"""|''')/s);
            if (match?.[1]) {
              description = match[1].split('\n')[0]?.trim();
            }
          }
        } catch {
          // Ignore read errors, description is optional
        }

        scripts.push({
          path: entry, // Relative path from skill directory
          name,
          description,
          language,
          enabled: true, // Default: enabled
        });
      }
    } catch (error) {
      console.warn(
        `[SkillLoader] Failed to load scripts from ${scriptsDir}:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    return scripts;
  }

  /**
   * Load a slash command from a single file
   */
  async loadCommandFile(
    filePath: string,
    source: SkillSource
  ): Promise<SlashCommand | null> {
    const content = await this.fs.readFile(filePath);
    const parsed = this.parser.parseMarkdown(content);

    if (!parsed) {
      throw new Error('Failed to parse command file: Invalid frontmatter');
    }

    // Check if it's actually a command
    const frontmatter = parsed.frontmatter as unknown as CommandFrontmatter;
    if (!frontmatter.command) {
      return null;
    }

    const command = createCommand(frontmatter, parsed.content, source, filePath);

    // Validate
    const validation = validateCommand(command);
    if (!validation.valid) {
      throw new Error(`Invalid command: ${validation.errors.join(', ')}`);
    }

    return command;
  }

  /**
   * Load skill from content string
   */
  loadSkillFromContent(
    content: string,
    source: SkillSource = 'project',
    directoryPath?: string
  ): Skill {
    const parsed = this.parser.parseMarkdown(content);

    if (!parsed) {
      throw new Error('Failed to parse skill content: Invalid frontmatter');
    }

    const supportFileRefs =
      parsed.supportFileRefs.length > 0 ? parsed.supportFileRefs : undefined;

    const skill = createSkill(
      parsed.frontmatter as SkillFrontmatter,
      parsed.content,
      source,
      directoryPath,
      supportFileRefs
    );

    const validation = validateSkill(skill);
    if (!validation.valid) {
      throw new Error(`Invalid skill: ${validation.errors.join(', ')}`);
    }

    return skill;
  }

  /**
   * Load command from content string
   */
  loadCommandFromContent(
    content: string,
    source: SkillSource = 'project',
    filePath?: string
  ): SlashCommand {
    const parsed = this.parser.parseMarkdown(content);

    if (!parsed) {
      throw new Error('Failed to parse command content: Invalid frontmatter');
    }

    const frontmatter = parsed.frontmatter as unknown as CommandFrontmatter;
    if (!frontmatter.command) {
      throw new Error('Not a slash command: missing "command" field');
    }

    const command = createCommand(frontmatter, parsed.content, source, filePath);

    const validation = validateCommand(command);
    if (!validation.valid) {
      throw new Error(`Invalid command: ${validation.errors.join(', ')}`);
    }

    return command;
  }

  /**
   * Parse Markdown with YAML frontmatter
   */
  parseMarkdown(content: string): ParsedSkillFile | null {
    return this.parser.parseMarkdown(content);
  }

  // ===========================================================================
  // Legacy Compatibility
  // ===========================================================================

  /**
   * @deprecated Use loadSkillFromDirectory() instead
   */
  async loadSkillFile(
    filePath: string,
    source: SkillSource
  ): Promise<Skill | null> {
    const parts = filePath.split('/');
    parts.pop(); // Remove SKILL.md
    const directoryPath = parts.join('/');
    return this.loadSkillFromDirectory(directoryPath, source);
  }

  /**
   * @deprecated Use loadSkillFromContent() instead
   */
  loadFromContent(
    content: string,
    source: SkillSource = 'project',
    filePath?: string
  ): Skill {
    return this.loadSkillFromContent(content, source, filePath);
  }
}

/**
 * Create a skill loader with Node.js fs
 */
export function createNodeSkillLoader(
  fs: typeof import('fs/promises'),
  path: typeof import('path')
): SkillLoader {
  const nodeFs: ISkillFileSystem = {
    exists: async (p: string) => {
      try {
        await fs.access(p);
        return true;
      } catch {
        return false;
      }
    },
    readDir: (p: string) => fs.readdir(p),
    readFile: (p: string) => fs.readFile(p, 'utf-8'),
    isDirectory: async (p: string) => {
      try {
        const stat = await fs.stat(p);
        return stat.isDirectory();
      } catch {
        return false;
      }
    },
  };

  return new SkillLoader(nodeFs);
}
