/**
 * ToolGroup Types - Dynamic tool injection based on user intent
 *
 * ToolGroup is different from Skill:
 * - Skill: Injects system prompt + optional allowedTools restriction (runtime)
 * - ToolGroup: Controls which tools are visible to LLM (before sending)
 *
 * They work together:
 * - ToolGroup decides which tools to send to LLM (reduces tokens)
 * - Skill's allowedTools acts as secondary guard (runtime interception)
 */

import type { ToolCategory } from './tool';
import type { IToolProvider } from './tool-injection';

/**
 * ToolGroup source
 */
export type ToolGroupSource = 'builtin' | 'project' | 'personal';

/**
 * ToolGroup definition - defines a group of related tools
 */
export interface ToolGroup {
  /** Unique group name */
  name: string;

  /** Description for matching and display */
  description: string;

  /** List of tool names included in this group */
  tools: string[];

  /** Keywords that trigger this group activation */
  triggerKeywords: string[];

  /** Whether this group is active by default */
  defaultActive?: boolean;

  /** Priority for conflict resolution (higher = more important) */
  priority?: number;

  /** Dependencies on other ToolGroups */
  dependencies?: string[];

  /** Source of this group */
  source: ToolGroupSource;

  /** Whether this group is enabled */
  enabled: boolean;

  /** Optional icon for UI */
  icon?: string;
}

/**
 * ToolGroup match result from keyword matching
 */
export interface ToolGroupMatch {
  /** Matched group */
  group: ToolGroup;

  /** Relevance score (0-1) */
  relevance: number;

  /** Keywords that matched */
  matchedKeywords: string[];
}

/**
 * Tool filter options for toToolDefinitions()
 */
export interface ToolFilterOptions {
  /** Include only these tool names */
  include?: string[];

  /** Exclude these tool names */
  exclude?: string[];

  /** Include only tools from these categories */
  categories?: ToolCategory[];
}

/**
 * Configured ToolGroup (with UI/settings extensions)
 */
export interface ConfiguredToolGroup extends ToolGroup {
  /** User notes/documentation */
  notes?: string;

  /** Tags for organization */
  tags?: string[];

  /** Last modified timestamp */
  lastModified?: number;
}

/**
 * ToolGroup registry interface
 *
 * Extends IToolProvider to allow ToolGroupRegistry to be used as a tool provider
 * for ToolInjectionManager.
 */
export interface IToolGroupRegistry extends IToolProvider {
  /** Register a ToolGroup */
  register(group: ToolGroup): void;

  /** Unregister a ToolGroup */
  unregister(name: string): void;

  /** Get ToolGroup by name */
  get(name: string): ToolGroup | undefined;

  /** List all ToolGroups */
  list(): ToolGroup[];

  /** List enabled ToolGroups */
  listEnabled(): ToolGroup[];

  /** Match ToolGroups by user input */
  match(input: string): ToolGroupMatch[];

  /** Get active tools based on active groups */
  getActiveTools(activeGroups: string[]): string[];

  /** Get default active tools */
  getDefaultTools(): string[];

  /** Check if a tool belongs to any group */
  getGroupsForTool(toolName: string): string[];
}
