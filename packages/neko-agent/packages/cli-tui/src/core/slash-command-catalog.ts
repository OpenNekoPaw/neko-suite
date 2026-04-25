import { listSlashCommandCatalog } from '@neko/agent';

export interface TuiSlashCommandOption {
  readonly name: string;
  readonly description: string;
}

export function createTuiSlashCommandCatalog(
  skills?: ReadonlyArray<{
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
