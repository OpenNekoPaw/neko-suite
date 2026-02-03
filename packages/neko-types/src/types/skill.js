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
 * Skill directory locations
 */
export const SKILL_DIRECTORIES = {
    /** Project-level skills: .neko/skills/ in project root */
    project: '.neko/skills',
    /** Personal skills: ~/.neko/skills/ */
    personal: '~/.neko/skills',
};
/**
 * Slash command directory locations (separate from skills)
 */
export const COMMAND_DIRECTORIES = {
    /** Project-level commands: .neko/commands/ in project root */
    project: '.neko/commands',
    /** Personal commands: ~/.neko/commands/ */
    personal: '~/.neko/commands',
};
// =============================================================================
// Utility Functions
// =============================================================================
/**
 * Convert Skill to SkillSummary
 */
export function toSkillSummary(skill) {
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
export function toCommandSummary(command) {
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
export function parseAllowedTools(toolsStr) {
    if (!toolsStr)
        return undefined;
    return toolsStr
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
}
/**
 * Check if a tool is allowed
 */
export function isToolAllowed(tool, allowedTools) {
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
            }
            else if (patternInner.endsWith('*')) {
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
export function validateSkill(skill) {
    const errors = [];
    const warnings = [];
    if (!skill.name) {
        errors.push('Missing required field: name');
    }
    else {
        if (!/^[a-z0-9-]+$/.test(skill.name)) {
            errors.push('Name must contain only lowercase letters, numbers, and hyphens');
        }
        if (skill.name.length > 64) {
            errors.push('Name must be 64 characters or less');
        }
    }
    if (!skill.description) {
        errors.push('Missing required field: description');
    }
    else {
        if (skill.description.length > 2048) {
            errors.push('Description must be 2048 characters or less');
        }
        if (skill.description.length < 20) {
            warnings.push('Description is very short. Consider adding more context for better semantic matching.');
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
export function validateCommand(command) {
    const errors = [];
    const warnings = [];
    if (!command.command) {
        errors.push('Missing required field: command');
    }
    else {
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
export function createSkill(frontmatter, content, source, directoryPath, supportFileRefs, toolDefinitions, contentConfig) {
    return {
        name: frontmatter.name,
        description: frontmatter.description,
        content,
        supportFileRefs,
        allowedTools: parseAllowedTools(frontmatter['allowed-tools']),
        toolsRef: frontmatter['tools-ref'],
        toolDefinitions,
        model: frontmatter.model,
        icon: frontmatter.icon,
        source,
        directoryPath,
        enabled: frontmatter.enabled ?? true,
        contentConfig,
    };
}
/**
 * Create a SlashCommand from parsed frontmatter
 */
export function createCommand(frontmatter, content, source, filePath) {
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
export function extractSupportFileRefs(content) {
    const refs = [];
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
/**
 * Convert SkillToolDefinition to OpenAI-compatible function format
 */
export function skillToolToOpenAI(tool) {
    const properties = {};
    const required = [];
    for (const [name, param] of Object.entries(tool.parameters)) {
        const prop = {
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
export function skillToolsToOpenAI(tools) {
    return tools.map(skillToolToOpenAI);
}
//# sourceMappingURL=skill.js.map