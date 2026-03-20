/**
 * Skill Injector - Prepares skills for injection into conversation
 *
 * Supports:
 * - Progressive disclosure: Only SKILL.md content is injected
 * - Argument interpolation: $ARGUMENTS, $1-$99 (when skill.supportsArguments is true)
 */

import type { Skill, SkillInjection, ISkillInjector } from '@neko/shared';

/**
 * Skill injector implementation
 */
export class SkillInjector implements ISkillInjector {
  /**
   * Inject a skill into the conversation context
   *
   * **Progressive Disclosure**: Only the SKILL.md content is injected.
   * Support files are NOT included - Claude will read them on-demand
   * when it encounters markdown links like [reference.md](reference.md).
   *
   * **Argument Interpolation**: When skill.supportsArguments is true and
   * args are provided, supports $ARGUMENTS and $1-$99 placeholders.
   *
   * @param skill Skill to inject
   * @param args Optional arguments (for skills with command trigger)
   * @returns Injection configuration
   */
  injectSkill(skill: Skill, args?: string): SkillInjection {
    let systemPrompt = skill.content;

    // Argument interpolation (for skills with slash command trigger)
    if (skill.supportsArguments) {
      if (args) {
        systemPrompt = this.interpolate(systemPrompt, args);
      } else {
        systemPrompt = this.cleanPlaceholders(systemPrompt);
      }
    }

    // Add hint about support files location if skill has a directory
    if (skill.directoryPath && skill.supportFileRefs && skill.supportFileRefs.length > 0) {
      systemPrompt += `\n\n---\n_Support files available in: ${skill.directoryPath}_`;
    }

    return {
      systemPrompt,
      allowedTools: skill.allowedTools,
      name: skill.command ?? skill.name,
      model: skill.model,
      type: skill.command ? 'slash-command' : 'skill',
    };
  }

  // ===========================================================================
  // Argument Interpolation
  // ===========================================================================

  /**
   * Interpolate arguments in content
   *
   * Supports:
   * - $ARGUMENTS: Full argument string
   * - $1, $2, $3, ..., $99: Positional arguments (1-indexed)
   */
  interpolate(content: string, args: string): string {
    if (!args) {
      return this.cleanPlaceholders(content);
    }

    const positionalArgs = this.parseArgs(args);

    // Replace $ARGUMENTS with full args string
    let result = content.replace(/\$ARGUMENTS/g, args);

    // Replace positional arguments $1-$99
    result = result.replace(/\$(\d{1,2})(?!\d)/g, (match, index) => {
      const idx = parseInt(index, 10) - 1;
      if (idx >= 0 && idx < positionalArgs.length) {
        return positionalArgs[idx] ?? '';
      }
      return '';
    });

    return result;
  }

  /**
   * Clean unfilled placeholders from content
   */
  private cleanPlaceholders(content: string): string {
    let result = content.replace(/\$ARGUMENTS/g, '');
    result = result.replace(/\$(\d{1,2})(?!\d)/g, '');
    return result;
  }

  /**
   * Parse argument string into positional arguments.
   * Handles quoted strings as single arguments.
   */
  private parseArgs(args: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < args.length; i++) {
      const char = args[i];

      if (!inQuote && (char === '"' || char === "'")) {
        inQuote = true;
        quoteChar = char;
      } else if (inQuote && char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote && /\s/.test(char ?? '')) {
        if (current) {
          result.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      result.push(current);
    }

    return result;
  }
}
