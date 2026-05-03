import type { ConfiguredToolGroup, ToolGroup } from '@neko/shared';

export interface RuntimeToolGroupRegistryView {
  list(): readonly ToolGroup[];
}

export function projectRuntimeToolGroups(
  registry: RuntimeToolGroupRegistryView | null | undefined,
): ConfiguredToolGroup[] {
  if (!registry) {
    return [];
  }

  return registry.list().map(projectRuntimeToolGroup);
}

export function projectRuntimeToolGroup(group: ToolGroup): ConfiguredToolGroup {
  return {
    ...group,
    tools: [...group.tools],
    ...(group.dependencies ? { dependencies: [...group.dependencies] } : {}),
  };
}
