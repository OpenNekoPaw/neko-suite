/**
 * Markdown Parser
 *
 * Parses Markdown files with YAML frontmatter for skills and commands
 */

import type {
  SkillFrontmatter,
  CommandFrontmatter,
  ParsedSkillFile,
} from '@uniedit/shared';
import { extractSupportFileRefs } from '@uniedit/shared';

/**
 * Parsed YAML value types
 */
export type YamlValue = string | boolean | undefined;

/**
 * Markdown parser interface
 */
export interface IMarkdownParser {
  /**
   * Parse full markdown with frontmatter and content
   */
  parseMarkdown(content: string): ParsedSkillFile | null;

  /**
   * Parse only the frontmatter (fast path for lazy loading)
   */
  parseFrontmatterOnly(content: string): (SkillFrontmatter | CommandFrontmatter) | null;

  /**
   * Parse simple YAML key-value pairs
   */
  parseSimpleYaml(yamlStr: string): Record<string, YamlValue>;
}

/**
 * Markdown parser implementation
 */
export class MarkdownParser implements IMarkdownParser {
  /**
   * Parse full markdown with frontmatter and content
   */
  parseMarkdown(content: string): ParsedSkillFile | null {
    // Check for frontmatter delimiter
    if (!content.startsWith('---')) {
      return null;
    }

    // Find closing delimiter
    const endIndex = content.indexOf('---', 3);
    if (endIndex === -1) {
      return null;
    }

    // Extract frontmatter and content
    const frontmatterStr = content.slice(3, endIndex).trim();
    const markdownContent = content.slice(endIndex + 3).trim();

    // Parse YAML frontmatter
    const frontmatter = this.parseSimpleYaml(frontmatterStr);

    // Support file refs are extracted lazily when needed
    const supportFileRefs = extractSupportFileRefs(markdownContent);

    return {
      frontmatter: frontmatter as unknown as SkillFrontmatter,
      content: markdownContent,
      supportFileRefs,
    };
  }

  /**
   * Parse only the frontmatter (fast path for lazy loading)
   */
  parseFrontmatterOnly(content: string): (SkillFrontmatter | CommandFrontmatter) | null {
    // Check for frontmatter delimiter
    if (!content.startsWith('---')) {
      return null;
    }

    // Find closing delimiter
    const endIndex = content.indexOf('---', 3);
    if (endIndex === -1) {
      return null;
    }

    // Extract and parse frontmatter only
    const frontmatterStr = content.slice(3, endIndex).trim();
    const parsed = this.parseSimpleYaml(frontmatterStr);

    // Check if it's a command or skill
    if ('command' in parsed && parsed.command) {
      return parsed as unknown as CommandFrontmatter;
    }

    if (parsed.name && parsed.description) {
      return parsed as unknown as SkillFrontmatter;
    }

    return null;
  }

  /**
   * Simple YAML parser for frontmatter
   * Handles key: value pairs, quoted strings, booleans, and multiline strings (| and >)
   */
  parseSimpleYaml(yamlStr: string): Record<string, YamlValue> {
    const result: Record<string, YamlValue> = {};

    const lines = yamlStr.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        i++;
        continue;
      }

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) {
        i++;
        continue;
      }

      const key = trimmed.slice(0, colonIndex).trim();
      let value: string | boolean = trimmed.slice(colonIndex + 1).trim();

      // Handle multiline string indicators (| or >)
      if (value === '|' || value === '>' || value === '|-' || value === '>-') {
        const keepNewlines = value.startsWith('|');
        const multilineContent: string[] = [];
        i++;

        // Collect indented lines
        while (i < lines.length) {
          const nextLine = lines[i];
          // Check if line is indented (part of multiline) or empty
          if (nextLine.match(/^\s+/) || nextLine.trim() === '') {
            // For empty lines, only include if we already have content
            if (nextLine.trim() === '' && multilineContent.length === 0) {
              i++;
              continue;
            }
            multilineContent.push(nextLine.replace(/^\s{2}/, '')); // Remove 2-space indent
            i++;
          } else {
            // Non-indented line means end of multiline block
            break;
          }
        }

        // Join lines based on style
        if (keepNewlines) {
          // Literal style (|): preserve newlines
          result[key] = multilineContent.join('\n').trim();
        } else {
          // Folded style (>): replace newlines with spaces
          result[key] = multilineContent.join(' ').replace(/\s+/g, ' ').trim();
        }
        continue;
      }

      // Handle quoted strings
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Handle boolean values
      if (value.toLowerCase() === 'true') {
        result[key] = true;
      } else if (value.toLowerCase() === 'false') {
        result[key] = false;
      } else {
        result[key] = value;
      }

      i++;
    }

    return result;
  }
}

/**
 * Create a markdown parser instance
 */
export function createMarkdownParser(): IMarkdownParser {
  return new MarkdownParser();
}
