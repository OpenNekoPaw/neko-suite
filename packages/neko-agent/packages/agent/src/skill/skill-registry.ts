/**
 * Skill Registry - Manages skills and slash commands separately
 *
 * Claude-compatible implementation that supports:
 * - Skills: Semantic discovery, no slash command, no argument interpolation
 * - Slash Commands: Explicit /command trigger with argument support
 */

import type { Skill, SlashCommand, ISkillRegistry } from '@neko/shared';

/**
 * Skill registry implementation - Manages both skills and slash commands
 */
export class SkillRegistry implements ISkillRegistry {
  /** Skills indexed by name (semantic discovery) */
  private skills: Map<string, Skill> = new Map();

  /** Slash commands indexed by command name */
  private commands: Map<string, SlashCommand> = new Map();

  // ===========================================================================
  // Skill Operations (Semantic Discovery)
  // ===========================================================================

  /**
   * Register a skill for semantic discovery
   */
  registerSkill(skill: Skill): void {
    if (!skill.name) {
      throw new Error('Skill must have a name');
    }

    if (this.skills.has(skill.name)) {
      console.warn(`[SkillRegistry] Skill '${skill.name}' already registered, overwriting`);
    }

    this.skills.set(skill.name, skill);
  }

  /**
   * Unregister a skill by name
   */
  unregisterSkill(name: string): void {
    this.skills.delete(name);
  }

  /**
   * Get skill by name
   */
  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * List all enabled skills
   */
  listSkills(): Skill[] {
    return Array.from(this.skills.values()).filter((s) => s.enabled);
  }

  /**
   * List all skills (including disabled)
   */
  listAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Search skills by keyword (in name and description)
   */
  searchSkills(keyword: string): Skill[] {
    const lower = keyword.toLowerCase();
    return this.listSkills().filter(
      (s) =>
        s.name.toLowerCase().includes(lower) || s.description.toLowerCase().includes(lower)
    );
  }

  // ===========================================================================
  // Slash Command Operations (Explicit Trigger)
  // ===========================================================================

  /**
   * Register a slash command
   */
  registerCommand(command: SlashCommand): void {
    if (!command.command) {
      throw new Error('SlashCommand must have a command name');
    }

    // Remove leading / if present
    const cmdName = command.command.startsWith('/')
      ? command.command.slice(1)
      : command.command;

    if (this.commands.has(cmdName)) {
      console.warn(
        `[SkillRegistry] Slash command '/${cmdName}' already registered, overwriting`
      );
    }

    this.commands.set(cmdName, { ...command, command: cmdName });
  }

  /**
   * Unregister a slash command
   */
  unregisterCommand(command: string): void {
    const cmdName = command.startsWith('/') ? command.slice(1) : command;
    this.commands.delete(cmdName);
  }

  /**
   * Get slash command by name
   */
  getCommand(command: string): SlashCommand | undefined {
    const cmdName = command.startsWith('/') ? command.slice(1) : command;
    return this.commands.get(cmdName);
  }

  /**
   * List all enabled slash commands
   */
  listCommands(): SlashCommand[] {
    return Array.from(this.commands.values()).filter((c) => c.enabled);
  }

  /**
   * Check if a slash command exists
   */
  hasCommand(command: string): boolean {
    const cmdName = command.startsWith('/') ? command.slice(1) : command;
    return this.commands.has(cmdName);
  }

  // ===========================================================================
  // Registry Statistics
  // ===========================================================================

  /**
   * Get skill count
   */
  get skillCount(): number {
    return this.skills.size;
  }

  /**
   * Get command count
   */
  get commandCount(): number {
    return this.commands.size;
  }

  /**
   * Clear all skills and commands
   */
  clear(): void {
    this.skills.clear();
    this.commands.clear();
  }

  // ===========================================================================
  // Legacy Compatibility (Deprecated)
  // ===========================================================================

  /**
   * @deprecated Use registerSkill() instead
   */
  register(skill: Skill): void {
    this.registerSkill(skill);
  }

  /**
   * @deprecated Use unregisterSkill() instead
   */
  unregister(name: string): void {
    this.unregisterSkill(name);
  }

  /**
   * @deprecated Use getSkill() instead
   */
  get(name: string): Skill | undefined {
    return this.getSkill(name);
  }

  /**
   * @deprecated Use listSkills() instead
   */
  list(): Skill[] {
    return this.listSkills();
  }

  /**
   * @deprecated Use listAllSkills() instead
   */
  listAll(): Skill[] {
    return this.listAllSkills();
  }

  /**
   * @deprecated Use searchSkills() instead
   */
  search(keyword: string): Skill[] {
    return this.searchSkills(keyword);
  }

  /**
   * @deprecated Skills no longer have slash commands
   */
  getBySlashCommand(command: string): Skill | undefined {
    // For backward compatibility, check if there's a command that matches
    const cmd = this.getCommand(command);
    if (cmd) {
      // Try to find a skill with the same name as the command
      return this.getSkill(cmd.command);
    }
    return undefined;
  }

  /**
   * @deprecated Use listCommands() instead
   */
  getSlashCommands(): Array<{ command: string; skill: Skill }> {
    // Legacy format - return commands as skill-like objects
    return this.listCommands().map((cmd) => ({
      command: cmd.command,
      skill: {
        name: cmd.command,
        description: cmd.description,
        content: cmd.content,
        allowedTools: cmd.allowedTools,
        model: cmd.model,
        source: cmd.source,
        icon: cmd.icon,
        enabled: cmd.enabled,
      } as Skill,
    }));
  }

  /**
   * @deprecated Use hasCommand() instead
   */
  hasSlashCommand(command: string): boolean {
    return this.hasCommand(command);
  }

  /**
   * @deprecated Use skillCount instead
   */
  get size(): number {
    return this.skills.size;
  }
}
