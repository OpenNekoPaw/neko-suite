/**
 * Tool Injection Types - Three-layer tool injection mechanism
 */

import type { ToolInjectionLayer } from './tool-category';

/**
 * Tool injection configuration
 */
export interface ToolInjectionConfig {
  /** Maximum tools per layer */
  maxToolsPerLayer: {
    core: number;
    skill: number;
    ondemand: number;
  };

  /** Token budget per layer */
  tokenBudgetPerLayer: {
    core: number;
    skill: number;
    ondemand: number;
  };

  /** Enable on-demand tool loading */
  enableOnDemand: boolean;
}

/**
 * Default injection configuration
 */
export const DEFAULT_INJECTION_CONFIG: ToolInjectionConfig = {
  maxToolsPerLayer: {
    core: 10, // Core tools: Read, Write, Bash, ListDirectory, Grep, SearchTools, etc.
    skill: 20,
    ondemand: 10,
  },
  tokenBudgetPerLayer: {
    core: 3000, // Increased for SearchTools
    skill: 8000,
    ondemand: 4000,
  },
  enableOnDemand: true,
};

/**
 * Tool injection state
 */
export interface ToolInjectionState {
  /** Currently injected tools by layer */
  injectedTools: Map<ToolInjectionLayer, string[]>;

  /** Active tool set names */
  activeToolSets: string[];

  /**
   * @deprecated Use activeToolSets
   * Pending on-demand tool requests — will be removed in Track C
   */
  pendingOnDemand: string[];

  /** Token usage by layer */
  tokenUsage: Map<ToolInjectionLayer, number>;
}

/**
 * Token usage summary for a layer
 */
export interface LayerTokenUsage {
  /** Layer name */
  layer: ToolInjectionLayer;
  /** Tokens used */
  used: number;
  /** Token budget */
  budget: number;
  /** Number of tools */
  toolCount: number;
}

/**
 * Tool injection manager interface
 */
export interface IToolInjectionManager {
  /**
   * Configure injection settings
   */
  configure(config: Partial<ToolInjectionConfig>): void;

  /**
   * Get current injection state
   */
  getState(): ToolInjectionState;

  /**
   * Get tools to inject for current turn
   * @param input User input for skill matching
   * @returns Array of tool names to inject
   */
  getToolsForTurn(input: string): string[];

  /**
   * Activate a tool set (adds its tools to the dynamic layer)
   */
  activateToolSet(toolSetName: string): void;

  /**
   * Deactivate a tool set
   */
  deactivateToolSet(toolSetName: string): void;

  /**
   * Get active tool set names
   */
  getActiveToolSets(): string[];

  /**
   * @deprecated Use activateToolSet
   */
  activateSkill(skillName: string): void;

  /**
   * @deprecated Use deactivateToolSet
   */
  deactivateSkill(skillName: string): void;

  /**
   * @deprecated Use getActiveToolSets
   */
  getActiveSkills(): string[];

  /**
   * Reset injection state
   */
  reset(): void;

  /**
   * Get token usage summary by layer
   */
  getTokenUsage(): LayerTokenUsage[];

  /**
   * Check if a tool is currently injected
   */
  isToolInjected(toolName: string): boolean;

  /**
   * Get the layer a tool belongs to
   */
  getToolLayer(toolName: string): ToolInjectionLayer | undefined;
}

/**
 * Injection event types
 */
export type InjectionEventType =
  | 'tool_injected'
  | 'tool_removed'
  | 'skill_activated'
  | 'skill_deactivated'
  | 'budget_exceeded'
  | 'state_reset';

/**
 * Injection event
 */
export interface InjectionEvent {
  /** Event type */
  type: InjectionEventType;
  /** Event timestamp */
  timestamp: number;
  /** Layer affected */
  layer?: ToolInjectionLayer;
  /** Tool name (for tool events) */
  toolName?: string;
  /** Skill name (for skill events) */
  skillName?: string;
  /** Additional data */
  data?: Record<string, unknown>;
}

/**
 * Injection event listener
 */
export type InjectionEventListener = (event: InjectionEvent) => void;

/**
 * Tool provider interface - Provides tools based on active skills/groups
 *
 * This interface decouples ToolInjectionManager from specific implementations
 * like ToolGroupRegistry. Any class that can provide tools based on active
 * skill/group names can implement this interface.
 */
export interface IToolProvider {
  /**
   * Get tools for the given active skill/group names
   * @param activeNames Names of active skills/groups
   * @returns Array of tool names
   */
  getActiveTools(activeNames: string[]): string[];

  /**
   * Get default tools that should always be included
   * @returns Array of tool names
   */
  getDefaultTools(): string[];
}
