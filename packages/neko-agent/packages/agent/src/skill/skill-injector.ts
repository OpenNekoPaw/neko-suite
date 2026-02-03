/**
 * Skill Injector - Prepares skills and commands for injection into conversation
 *
 * Key differences between Skill and SlashCommand:
 * - Skill: No argument interpolation, progressive disclosure for support files
 * - SlashCommand: Supports $ARGUMENTS, $1, $2, $3, etc. interpolation
 *
 * Progressive Disclosure (Claude-compatible):
 * - Only SKILL.md content is injected into the system prompt
 * - Support files are referenced via markdown links [file.md](file.md)
 * - Claude reads support files on-demand using the Read tool
 * - This keeps the initial context small and loads details as needed
 */

import type { Skill, SlashCommand, SkillInjection, ISkillInjector } from '@uniedit/shared';

/**
 * Skill injector implementation
 */
export class SkillInjector implements ISkillInjector {
  // ===========================================================================
  // Skill Injection (No Argument Interpolation)
  // ===========================================================================

  /**
   * Inject a skill (semantic discovery)
   *
   * Skills do NOT support argument interpolation.
   *
   * **Progressive Disclosure**: Only the SKILL.md content is injected.
   * Support files are NOT included - Claude will read them on-demand
   * when it encounters markdown links like [reference.md](reference.md).
   *
   * @param skill Skill to inject
   * @returns Injection configuration
   */
  injectSkill(skill: Skill): SkillInjection {
    // Progressive Disclosure: Only inject SKILL.md content
    // Support files are read on-demand by Claude via Read tool
    let systemPrompt = skill.content;

    // Add hint about support files location if skill has a directory
    if (skill.directoryPath && skill.supportFileRefs && skill.supportFileRefs.length > 0) {
      systemPrompt += `\n\n---\n_Support files available in: ${skill.directoryPath}_`;
    }

    return {
      systemPrompt,
      allowedTools: skill.allowedTools,
      name: skill.name,
      model: skill.model,
      type: 'skill',
    };
  }

  // ===========================================================================
  // Slash Command Injection (With Argument Interpolation)
  // ===========================================================================

  /**
   * Inject a slash command (explicit trigger)
   *
   * Slash commands support argument interpolation:
   * - $ARGUMENTS: Full argument string
   * - $1, $2, $3, ...: Positional arguments (1-indexed)
   *
   * @param command Slash command to inject
   * @param args Arguments passed to the command
   * @returns Injection configuration
   */
  injectCommand(command: SlashCommand, args?: string): SkillInjection {
    let systemPrompt = command.content;

    // Interpolate arguments if provided
    if (args) {
      systemPrompt = this.interpolate(systemPrompt, args);
    } else {
      // Remove unfilled placeholders
      systemPrompt = this.cleanPlaceholders(systemPrompt);
    }

    return {
      systemPrompt,
      allowedTools: command.allowedTools,
      name: command.command,
      model: command.model,
      type: 'slash-command',
    };
  }

  // ===========================================================================
  // Argument Interpolation (For Slash Commands Only)
  // ===========================================================================

  /**
   * Interpolate arguments in content
   *
   * Supports:
   * - $ARGUMENTS: Full argument string
   * - $1, $2, $3, ..., $99: Positional arguments (1-indexed)
   *
   * @param content Content with placeholders
   * @param args Argument string (e.g., "123 high-priority alice")
   * @returns Content with placeholders replaced
   *
   * @example
   * interpolate("Review PR $1 with priority $2", "123 high")
   * // Returns: "Review PR 123 with priority high"
   */
  interpolate(content: string, args: string): string {
    if (!args) {
      return this.cleanPlaceholders(content);
    }

    // Split args by whitespace, respecting quoted strings
    const positionalArgs = this.parseArgs(args);

    // Replace $ARGUMENTS with full args string
    let result = content.replace(/\$ARGUMENTS/g, args);

    // Replace positional arguments $1, $2, $3, etc.
    // Match $1 through $99 (not followed by another digit)
    result = result.replace(/\$(\d{1,2})(?!\d)/g, (match, index) => {
      const idx = parseInt(index, 10) - 1; // Convert to 0-indexed
      if (idx >= 0 && idx < positionalArgs.length) {
        return positionalArgs[idx] ?? '';
      }
      return ''; // Return empty string for missing args
    });

    return result;
  }

  /**
   * Clean unfilled placeholders from content
   */
  private cleanPlaceholders(content: string): string {
    // Remove $ARGUMENTS placeholder
    let result = content.replace(/\$ARGUMENTS/g, '');

    // Remove positional argument placeholders $1-$99
    result = result.replace(/\$(\d{1,2})(?!\d)/g, '');

    return result;
  }

  /**
   * Parse argument string into positional arguments
   * Handles quoted strings as single arguments
   *
   * @example
   * parseArgs("foo bar") → ["foo", "bar"]
   * parseArgs('foo "bar baz" qux') → ["foo", "bar baz", "qux"]
   * parseArgs("foo 'bar baz' qux") → ["foo", "bar baz", "qux"]
   */
  private parseArgs(args: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < args.length; i++) {
      const char = args[i];

      if (!inQuote && (char === '"' || char === "'")) {
        // Start of quoted string
        inQuote = true;
        quoteChar = char;
      } else if (inQuote && char === quoteChar) {
        // End of quoted string
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote && /\s/.test(char ?? '')) {
        // Whitespace outside quotes - end of argument
        if (current) {
          result.push(current);
          current = '';
        }
      } else {
        // Regular character
        current += char;
      }
    }

    // Don't forget the last argument
    if (current) {
      result.push(current);
    }

    return result;
  }

  // ===========================================================================
  // Legacy Compatibility (Deprecated)
  // ===========================================================================

  /**
   * @deprecated Use injectSkill() or injectCommand() instead
   *
   * This method assumes it's injecting a skill but also supports
   * argument interpolation for backward compatibility.
   */
  inject(skill: Skill, args?: string): SkillInjection {
    let systemPrompt = skill.content;

    // Interpolate arguments if provided (legacy behavior)
    if (args) {
      systemPrompt = this.interpolate(systemPrompt, args);
    }

    return {
      systemPrompt,
      allowedTools: skill.allowedTools,
      name: skill.name,
      model: skill.model,
      type: 'skill',
    };
  }
}
