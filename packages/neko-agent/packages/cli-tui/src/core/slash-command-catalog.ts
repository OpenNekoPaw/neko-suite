import { listSlashCommandCatalog } from '@neko/agent';

export interface TuiSlashCommandOption {
  readonly name: string;
  readonly description: string;
}

export interface TuiSkillInvocationOption {
  readonly name: string;
  readonly description: string;
}

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
  return listSlashCommandCatalog({
    surface: 'cli',
    skills,
  }).map((command) => ({
    name: command.name,
    description: command.description,
  }));
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
