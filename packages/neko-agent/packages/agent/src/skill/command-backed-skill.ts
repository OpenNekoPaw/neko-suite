import type { Skill, SlashCommand } from '@neko/shared';
import type { LazyCommand, LazySkill } from './lazy-loader';

/**
 * Adapt a single-file slash command artifact into the runtime's Skill shape.
 *
 * This lets `.neko/commands/*.md` reuse the existing SkillRegistry /
 * SkillService / slash-activation path instead of requiring a parallel
 * command-only execution lane.
 */
export function createCommandBackedSkill(command: SlashCommand): Skill {
  return {
    name: command.command,
    description: command.description,
    content: command.content,
    allowedTools: command.allowedTools,
    model: command.model,
    source: command.source,
    directoryPath: toCommandDirectoryPath(command.filePath),
    icon: command.icon,
    enabled: command.enabled,
    command: command.command,
    argumentHint: command.argumentHint,
    supportsArguments: supportsCommandArguments(command.content),
    autoInvoke: false,
  };
}

export function createLazyCommandBackedSkill(command: LazyCommand): LazySkill {
  let cachedSkill: Skill | null = null;

  const lazySkill: LazySkill = {
    name: command.command,
    description: command.description,
    icon: command.icon,
    source: command.source,
    directoryPath: toCommandDirectoryPath(command.filePath) ?? command.filePath,
    isLoaded: false,
    async loadContent(): Promise<Skill> {
      if (cachedSkill) {
        return cachedSkill;
      }

      const loadedCommand = await command.loadContent();
      cachedSkill = createCommandBackedSkill(loadedCommand);
      lazySkill.isLoaded = true;
      return cachedSkill;
    },
  };

  return lazySkill;
}

function supportsCommandArguments(content: string): boolean {
  return /\$ARGUMENTS|\$\d{1,2}\b/.test(content);
}

function toCommandDirectoryPath(filePath?: string): string | undefined {
  if (!filePath) {
    return undefined;
  }

  const normalized = filePath.replace(/\\/g, '/');
  const slashIndex = normalized.lastIndexOf('/');
  return slashIndex >= 0 ? normalized.slice(0, slashIndex) : undefined;
}
