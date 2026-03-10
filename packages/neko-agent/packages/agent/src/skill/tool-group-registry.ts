/**
 * ToolGroupRegistry - Manages ToolGroup registration and matching
 *
 * Responsibilities:
 * - Register/unregister ToolGroups
 * - Match user input to relevant ToolGroups
 * - Resolve dependencies between ToolGroups
 * - Provide active tool list based on active groups
 */

import type { ToolGroup, ToolGroupMatch, IToolGroupRegistry } from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('ToolGroupRegistry');

/**
 * ToolGroupRegistry implementation
 */
export class ToolGroupRegistry implements IToolGroupRegistry {
  private groups: Map<string, ToolGroup> = new Map();
  private toolToGroupsMap: Map<string, string[]> = new Map();

  /**
   * Register a ToolGroup
   */
  register(group: ToolGroup): void {
    if (this.groups.has(group.name)) {
      logger.warn('Overwriting existing group', { groupName: group.name });
    }

    this.groups.set(group.name, group);

    // Build reverse mapping: tool -> groups
    for (const tool of group.tools) {
      const existing = this.toolToGroupsMap.get(tool) || [];
      if (!existing.includes(group.name)) {
        existing.push(group.name);
        this.toolToGroupsMap.set(tool, existing);
      }
    }
  }

  /**
   * Unregister a ToolGroup
   */
  unregister(name: string): void {
    const group = this.groups.get(name);
    if (!group) return;

    // Remove from reverse mapping
    for (const tool of group.tools) {
      const groups = this.toolToGroupsMap.get(tool);
      if (groups) {
        const index = groups.indexOf(name);
        if (index !== -1) {
          groups.splice(index, 1);
          if (groups.length === 0) {
            this.toolToGroupsMap.delete(tool);
          }
        }
      }
    }

    this.groups.delete(name);
  }

  /**
   * Get ToolGroup by name
   */
  get(name: string): ToolGroup | undefined {
    return this.groups.get(name);
  }

  /**
   * List all ToolGroups
   */
  list(): ToolGroup[] {
    return Array.from(this.groups.values());
  }

  /**
   * List enabled ToolGroups
   */
  listEnabled(): ToolGroup[] {
    return this.list().filter((g) => g.enabled);
  }

  /**
   * Match ToolGroups by user input
   *
   * Note: triggerKeywords have been removed. This method now always returns an
   * empty array. Tool set discovery is handled by the LLM via SearchToolSets.
   */
  match(_input: string): ToolGroupMatch[] {
    return [];
  }

  /**
   * Get active tools based on active groups
   * Includes default tools and tools from active groups (with dependencies resolved)
   */
  getActiveTools(activeGroups: string[]): string[] {
    const tools = new Set<string>();

    // Add default tools first
    for (const tool of this.getDefaultTools()) {
      tools.add(tool);
    }

    // Process active groups with dependency resolution
    const processedGroups = new Set<string>();
    const groupsToProcess = [...activeGroups];

    while (groupsToProcess.length > 0) {
      const groupName = groupsToProcess.pop()!;

      if (processedGroups.has(groupName)) {
        continue;
      }

      const group = this.groups.get(groupName);
      if (!group || !group.enabled) {
        continue;
      }

      processedGroups.add(groupName);

      // Add dependencies to process queue
      if (group.dependencies) {
        for (const dep of group.dependencies) {
          if (!processedGroups.has(dep)) {
            groupsToProcess.push(dep);
          }
        }
      }

      // Add tools from this group
      for (const tool of group.tools) {
        tools.add(tool);
      }
    }

    return Array.from(tools);
  }

  /**
   * Get default active tools (from groups with alwaysActive: true or defaultActive: true)
   */
  getDefaultTools(): string[] {
    const tools = new Set<string>();

    for (const group of this.listEnabled()) {
      if (group.alwaysActive || group.defaultActive) {
        for (const tool of group.tools) {
          tools.add(tool);
        }
      }
    }

    return Array.from(tools);
  }

  /**
   * Get groups that contain a specific tool
   */
  getGroupsForTool(toolName: string): string[] {
    return this.toolToGroupsMap.get(toolName) || [];
  }

  /**
   * Clear all registered groups
   */
  clear(): void {
    this.groups.clear();
    this.toolToGroupsMap.clear();
  }
}

/**
 * Create a new ToolGroupRegistry instance
 */
export function createToolGroupRegistry(): IToolGroupRegistry {
  return new ToolGroupRegistry();
}
