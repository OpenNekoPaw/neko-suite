import {
  NEKO_EXTENSION_IDS,
  TOOL_NAMES_SYSTEM,
  createTool,
  type SkillDef,
  type Tool,
  type ToolResult,
} from '@neko/shared';

export interface PluginSkillCatalogueEntry {
  readonly extensionId: string;
  readonly skills: readonly SkillDef[];
}

export interface PluginSkillCatalogue {
  readonly catalogue: readonly PluginSkillCatalogueEntry[];
  readonly totalSkills: number;
}

export interface PluginSkillCatalogueSource {
  listPluginSkills(): Promise<readonly PluginSkillCatalogueEntry[]>;
}

export const DEFAULT_PLUGIN_SKILL_PROVIDER_EXTENSION_IDS = [
  NEKO_EXTENSION_IDS.NEKO_CUT,
  NEKO_EXTENSION_IDS.NEKO_CANVAS,
  NEKO_EXTENSION_IDS.NEKO_STORY,
  NEKO_EXTENSION_IDS.NEKO_SKETCH,
  NEKO_EXTENSION_IDS.NEKO_AUTH,
] as const;

export interface PluginSkillDiscoveryLogger {
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
}

const noopLogger: PluginSkillDiscoveryLogger = {
  info: () => undefined,
  warn: () => undefined,
};

export function createPluginSkillDiscoveryTools(
  source: PluginSkillCatalogueSource,
  logger: PluginSkillDiscoveryLogger = noopLogger,
): Tool[] {
  return [
    createTool({
      name: TOOL_NAMES_SYSTEM.LIST_PLUGIN_SKILLS,
      description:
        'List all AI capabilities (skills) advertised by installed Neko suite plugins. ' +
        'Returns a catalogue of skills grouped by extension, each with an id, name, description, ' +
        'tags, and the command identifier used by the host to invoke it. Use this to discover what plugins can do ' +
        'before recommending or invoking a workflow.',
      category: 'system',
      isReadOnly: true,
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          tag: {
            type: 'string',
            description: 'Optional tag filter (e.g. "generation", "image", "timeline")',
          },
        },
      },
      execute: async (args) => listPluginSkills(source, logger, args),
    }),
  ];
}

async function listPluginSkills(
  source: PluginSkillCatalogueSource,
  logger: PluginSkillDiscoveryLogger,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const tagFilter = readTagFilter(args.tag);

  try {
    const rawCatalogue = await source.listPluginSkills();
    const catalogue = filterCatalogue(rawCatalogue, tagFilter);
    const totalSkills = catalogue.reduce((total, entry) => total + entry.skills.length, 0);

    logger.debug('ListPluginSkills completed', {
      totalSkills,
      extensionCount: catalogue.length,
      tagFilter,
    });

    return {
      success: true,
      data: {
        catalogue,
        totalSkills,
      } satisfies PluginSkillCatalogue,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('ListPluginSkills failed', { error: message });
    return {
      success: false,
      error: message,
    };
  }
}

function filterCatalogue(
  catalogue: readonly PluginSkillCatalogueEntry[],
  tagFilter: string | undefined,
): PluginSkillCatalogueEntry[] {
  return catalogue
    .map((entry) => {
      const skills = tagFilter
        ? entry.skills.filter((skill) => skill.tags?.includes(tagFilter))
        : [...entry.skills];
      return {
        extensionId: entry.extensionId,
        skills,
      };
    })
    .filter((entry) => entry.skills.length > 0);
}

function readTagFilter(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
