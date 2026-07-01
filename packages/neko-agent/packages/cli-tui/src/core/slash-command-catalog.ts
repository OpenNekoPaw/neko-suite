import { listSlashCommandCatalog } from '@neko/agent';

export interface TuiSlashCommandOption {
  readonly name: string;
  readonly description: string;
}

export interface TuiSkillInvocationOption {
  readonly name: string;
  readonly description: string;
}

const TUI_LOCAL_COMMANDS: readonly TuiSlashCommandOption[] = [
  {
    name: 'mode',
    description: 'Show or switch session mode',
  },
  {
    name: 'model',
    description: 'List or switch the current chat model',
  },
  {
    name: 'media',
    description: 'List or switch image/video/audio models',
  },
  {
    name: 'param',
    description: 'Show or set LLM and media parameters',
  },
  {
    name: 'queue',
    description: 'List, promote, cancel, or edit queued prompts',
  },
  {
    name: 'mcp',
    description: 'Show MCP server status, tools, and connection controls',
  },
  {
    name: 'capability',
    description: 'Show TUI capability providers, diagnostics, and tools',
  },
  {
    name: 'artifact',
    description: 'List, show, open, or send terminal artifact references',
  },
  {
    name: 'compact',
    description: 'Compact the current Agent context',
  },
  {
    name: 'status',
    description: 'Show mode, model, queue, Skill, task, and context state',
  },
  {
    name: 'auto',
    description: 'Switch to auto execution mode',
  },
  {
    name: 'ask',
    description: 'Switch to ask-before-action execution mode',
  },
  {
    name: 'skill',
    description: 'Activate or deactivate a Skill lifecycle record',
  },
  {
    name: 'idc',
    description: 'Explicitly start, resume, or stop the IDC workflow',
  },
];

export function createTuiSlashCommandCatalog(
  skills?: ReadonlyArray<{
    entryPointKind?: 'skill' | 'command-artifact';
    command?: string;
    description?: string;
    enabled?: boolean;
    supportsArguments?: boolean;
    argumentHint?: string;
  }>,
): TuiSlashCommandOption[] {
  const commands = listSlashCommandCatalog({
    surface: 'cli',
    skills,
  }).map((command) => ({
    name: command.name,
    description: command.description,
  }));
  const names = new Set(commands.map((command) => command.name));
  for (const command of TUI_LOCAL_COMMANDS) {
    if (!names.has(command.name)) {
      commands.push(command);
    }
  }
  return commands;
}

export function createTuiSkillInvocationCatalog(
  skills?: ReadonlyArray<{
    name: string;
    description?: string;
    enabled?: boolean;
  }>,
): TuiSkillInvocationOption[] {
  return (skills ?? [])
    .filter((skill) => skill.enabled !== false)
    .map((skill) => ({
      name: `$${skill.name}`,
      description: skill.description ?? '',
    }));
}
