/**
 * Path Matcher — Match file paths against Skill path patterns
 *
 * Pure function that checks if a saved file path matches any Skill's
 * `paths` glob patterns, returning the names of matching skills.
 *
 * Implements basic glob matching (*, **, ?) without external dependencies.
 */

/** Minimal skill info needed for path matching */
export interface SkillPathInfo {
  name: string;
  paths?: string[];
}

/**
 * Find skills whose `paths` patterns match the given file path.
 *
 * @param filePath - Absolute or relative path of the saved file
 * @param skills - Skills with optional paths patterns
 * @returns Names of skills whose patterns match
 */
export function matchSkillPaths(filePath: string, skills: SkillPathInfo[]): string[] {
  const matched: string[] = [];

  for (const skill of skills) {
    if (!skill.paths || skill.paths.length === 0) {
      continue;
    }

    for (const pattern of skill.paths) {
      if (globMatch(filePath, pattern)) {
        matched.push(skill.name);
        break; // One match is enough per skill
      }
    }
  }

  return matched;
}

/**
 * Simple glob pattern matcher.
 *
 * Supports:
 * - `*` matches any characters except path separator
 * - `**` matches any characters including path separator (directory traversal)
 * - `?` matches exactly one character (not path separator)
 * - Literal characters match themselves
 */
export function globMatch(path: string, pattern: string): boolean {
  // Normalize path separators
  const normalizedPath = path.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  const regex = globToRegex(normalizedPattern);
  return regex.test(normalizedPath);
}

/**
 * Convert a glob pattern to a regular expression.
 */
function globToRegex(pattern: string): RegExp {
  let regexStr = '^';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i]!;

    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches anything including path separators
        if (pattern[i + 2] === '/') {
          regexStr += '(?:.*/)?'; // **/ matches zero or more directory segments
          i += 3;
        } else {
          regexStr += '.*'; // ** at end matches everything
          i += 2;
        }
      } else {
        regexStr += '[^/]*'; // * matches anything except /
        i++;
      }
    } else if (char === '?') {
      regexStr += '[^/]'; // ? matches one non-separator char
      i++;
    } else if (char === '.') {
      regexStr += '\\.';
      i++;
    } else if (
      char === '(' ||
      char === ')' ||
      char === '[' ||
      char === ']' ||
      char === '{' ||
      char === '}' ||
      char === '+' ||
      char === '^' ||
      char === '$' ||
      char === '|'
    ) {
      regexStr += '\\' + char;
      i++;
    } else {
      regexStr += char;
      i++;
    }
  }

  regexStr += '$';
  return new RegExp(regexStr);
}
