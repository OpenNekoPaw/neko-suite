import type {
  IToolRegistry,
  Tool,
  ToolCategory,
  ToolDefinitionProjectionOptions,
  ToolExecuteOptions,
  ToolFilterOptions,
  ToolResult,
} from '@neko/shared';
import { ToolRegistry } from '../tools/tool-registry';

/**
 * Keeps conversation-bound Tool instances local while delegating stateless
 * Host capabilities to the shared registry.
 */
export class SessionToolRegistryView implements IToolRegistry {
  private readonly local = new ToolRegistry();
  private readonly ownedNames = new Set<string>();

  constructor(
    private readonly shared: IToolRegistry,
    localTools: readonly Tool[],
  ) {
    for (const tool of localTools) {
      this.register(tool);
    }
  }

  register(tool: Tool): void {
    this.ownedNames.add(tool.name);
    this.local.register(tool);
  }

  unregister(name: string): void {
    this.local.unregister(name);
  }

  get(name: string): Tool | undefined {
    return this.ownedNames.has(name) ? this.local.get(name) : this.shared.get(name);
  }

  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  list(): Tool[] {
    const localTools = this.local.list();
    const localByName = new Map(localTools.map((tool) => [tool.name, tool]));
    const merged = this.shared
      .list()
      .filter((tool) => !this.ownedNames.has(tool.name))
      .concat(localTools);
    return merged.map((tool) => localByName.get(tool.name) ?? tool);
  }

  listByCategory(category: ToolCategory): Tool[] {
    return this.list().filter((tool) => tool.category === category);
  }

  execute(
    name: string,
    args: Record<string, unknown>,
    options?: ToolExecuteOptions,
  ): Promise<ToolResult> {
    return this.ownedNames.has(name)
      ? this.local.execute(name, args, options)
      : this.shared.execute(name, args, options);
  }

  toToolDefinitions(
    filter?: ToolFilterOptions,
    options?: ToolDefinitionProjectionOptions,
  ): ReturnType<IToolRegistry['toToolDefinitions']> {
    const localNames = this.ownedNames;
    const sharedDefinitions = this.shared
      .toToolDefinitions(filter, options)
      .filter((definition) => !localNames.has(definition.function.name));
    return [...sharedDefinitions, ...this.local.toToolDefinitions(filter, options)];
  }

  get size(): number {
    return this.list().length;
  }
}

export function createSessionToolRegistryView(
  shared: IToolRegistry,
  localTools: readonly Tool[],
): IToolRegistry {
  return new SessionToolRegistryView(shared, localTools);
}
