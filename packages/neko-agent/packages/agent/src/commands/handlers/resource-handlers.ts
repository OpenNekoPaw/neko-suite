/**
 * Resource Command Handlers
 *
 * Handlers for: skills, commands, tools, tasks, mcp
 */

import type { CommandHandler } from '../types';

/**
 * Handle /skills command (CLI only)
 */
export const handleSkills: CommandHandler = (args, context) => {
  const { skillService } = context;

  if (!skillService) {
    return {
      handled: true,
      continueExecution: true,
      error: 'Skill service not available',
    };
  }

  if (args.length === 0) {
    // List all skills
    const skills = skillService.registry.listSkills();
    if (skills.length === 0) {
      return {
        handled: true,
        continueExecution: true,
        output: 'No skills registered.',
      };
    }

    const lines = [
      '',
      'Available Skills:',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ];

    for (const skill of skills) {
      const s = skill as { name: string; description?: string; enabled?: boolean };
      const status = s.enabled === false ? ' (disabled)' : '';
      lines.push(`  ${s.name}${status}`);
      if (s.description) {
        lines.push(`      ${s.description}`);
      }
    }
    lines.push('');

    return {
      handled: true,
      continueExecution: true,
      output: lines.join('\n'),
    };
  }

  const subcommand = args[0]?.toLowerCase();

  switch (subcommand) {
    case 'info': {
      const skillName = args[1];
      if (!skillName) {
        return {
          handled: true,
          continueExecution: true,
          error: 'Usage: /skills info <name>',
        };
      }
      // Would need to get skill details from service
      return {
        handled: true,
        continueExecution: true,
        output: `Skill info for: ${skillName}`,
      };
    }

    case 'active': {
      const activeSkill = skillService.getActiveSkill();
      if (activeSkill) {
        return {
          handled: true,
          continueExecution: true,
          output: `Active skill: ${activeSkill.name}`,
        };
      }
      return {
        handled: true,
        continueExecution: true,
        output: 'No active skill.',
      };
    }

    case 'clear':
      skillService.clearActiveSkill();
      return {
        handled: true,
        continueExecution: true,
        output: 'Active skill cleared.',
      };

    default:
      return {
        handled: true,
        continueExecution: true,
        error: `Unknown subcommand: ${subcommand}. Use /skills, /skills info <name>, /skills active, or /skills clear.`,
      };
  }
};

/**
 * Handle /commands command (CLI only)
 */
export const handleCommands: CommandHandler = (_args, context) => {
  const { skillService } = context;

  if (!skillService) {
    return {
      handled: true,
      continueExecution: true,
      error: 'Skill service not available',
    };
  }

  const commands = skillService.registry.listCommands();
  if (commands.length === 0) {
    return {
      handled: true,
      continueExecution: true,
      output: 'No custom commands registered.',
    };
  }

  const lines = [
    '',
    'Available Commands:',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ];

  for (const cmd of commands) {
    const c = cmd as { command: string; description?: string; enabled?: boolean };
    const status = c.enabled === false ? ' (disabled)' : '';
    lines.push(`  /${c.command}${status}`);
    if (c.description) {
      lines.push(`      ${c.description}`);
    }
  }
  lines.push('');

  return {
    handled: true,
    continueExecution: true,
    output: lines.join('\n'),
  };
};

/**
 * Handle /tools command (CLI only)
 */
export const handleTools: CommandHandler = (args, context) => {
  const { toolRegistry } = context;

  if (!toolRegistry) {
    return {
      handled: true,
      continueExecution: true,
      error: 'Tool registry not available',
    };
  }

  if (args.length === 0) {
    // List all tools
    const tools = toolRegistry.list();
    if (tools.length === 0) {
      return {
        handled: true,
        continueExecution: true,
        output: 'No tools registered.',
      };
    }

    const lines = [
      '',
      `Available Tools (${tools.length}):`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ];

    for (const tool of tools) {
      const t = tool as { name: string; description?: string };
      lines.push(`  ${t.name}`);
      if (t.description) {
        const desc = t.description.length > 60 ? t.description.slice(0, 57) + '...' : t.description;
        lines.push(`      ${desc}`);
      }
    }
    lines.push('');

    return {
      handled: true,
      continueExecution: true,
      output: lines.join('\n'),
    };
  }

  const subcommand = args[0]?.toLowerCase();

  switch (subcommand) {
    case 'info': {
      const toolName = args[1];
      if (!toolName) {
        return {
          handled: true,
          continueExecution: true,
          error: 'Usage: /tools info <name>',
        };
      }
      const tool = toolRegistry.get(toolName);
      if (!tool) {
        return {
          handled: true,
          continueExecution: true,
          error: `Tool not found: ${toolName}`,
        };
      }
      const t = tool as { name: string; description?: string };
      return {
        handled: true,
        continueExecution: true,
        output: `Tool: ${t.name}\n${t.description ?? 'No description'}`,
      };
    }

    case 'search': {
      const query = args.slice(1).join(' ');
      if (!query) {
        return {
          handled: true,
          continueExecution: true,
          error: 'Usage: /tools search <query>',
        };
      }
      const results = toolRegistry.search(query);
      if (results.length === 0) {
        return {
          handled: true,
          continueExecution: true,
          output: `No tools found matching: ${query}`,
        };
      }
      const lines = [`Found ${results.length} tools matching "${query}":\n`];
      for (const tool of results) {
        const t = tool as { name: string };
        lines.push(`  ${t.name}`);
      }
      return {
        handled: true,
        continueExecution: true,
        output: lines.join('\n'),
      };
    }

    default:
      return {
        handled: true,
        continueExecution: true,
        error: `Unknown subcommand: ${subcommand}. Use /tools, /tools info <name>, or /tools search <query>.`,
      };
  }
};

/**
 * Handle /tasks command (extension only)
 */
export const handleTasks: CommandHandler = (_args, _context) => {
  return {
    handled: true,
    continueExecution: true,
    action: 'showTasks',
  };
};

/**
 * Handle /mcp command (extension only)
 */
export const handleMcp: CommandHandler = (_args, _context) => {
  return {
    handled: true,
    continueExecution: true,
    action: 'showMCPServers',
  };
};
