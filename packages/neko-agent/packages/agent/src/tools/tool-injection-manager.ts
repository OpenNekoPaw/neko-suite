/**
 * Tool Injection Manager - Implements two-layer tool injection mechanism
 *
 * Two layers:
 * - always: Core tools always injected — Read, Write, Bash, ListDirectory, Grep + meta-tools
 *           + tools from alwaysActive ToolSets
 * - dynamic: Tools from manually activated ToolSets (via ActivateToolSet or SkillService)
 *
 * Works with ToolCategoryRegistry for categorization and IToolProvider for ToolSet-based tools.
 */

import type {
  ToolInjectionLayer,
  ToolInjectionConfig,
  ToolInjectionState,
  LayerTokenUsage,
  IToolInjectionManager,
  InjectionEvent,
  InjectionEventListener,
  IToolProvider,
  IToolCategoryRegistry,
} from '@neko/shared';
import { DEFAULT_INJECTION_CONFIG, CORE_TOOLS } from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('ToolInjectionManager');

/**
 * Tool Injection Manager implementation
 */
export class ToolInjectionManager implements IToolInjectionManager {
  /** Configuration */
  private config: ToolInjectionConfig;

  /** Current injection state */
  private state: ToolInjectionState;

  /** Category registry for tool categorization */
  private categoryRegistry: IToolCategoryRegistry;

  /** Tool provider for ToolSet-based tools (optional) */
  private toolProvider?: IToolProvider;

  /** Event listeners */
  private listeners: Set<InjectionEventListener> = new Set();

  constructor(
    categoryRegistry: IToolCategoryRegistry,
    toolProvider?: IToolProvider,
    config?: Partial<ToolInjectionConfig>,
  ) {
    this.categoryRegistry = categoryRegistry;
    this.toolProvider = toolProvider;
    this.config = { ...DEFAULT_INJECTION_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  /**
   * Create initial injection state
   */
  private createInitialState(): ToolInjectionState {
    return {
      injectedTools: new Map<ToolInjectionLayer, string[]>([
        ['always', [...CORE_TOOLS]],
        ['dynamic', []],
      ]),
      activeToolSets: [],
      tokenUsage: new Map<ToolInjectionLayer, number>([
        ['always', 0],
        ['dynamic', 0],
      ]),
    };
  }

  /**
   * Configure injection settings
   */
  configure(config: Partial<ToolInjectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current injection state
   */
  getState(): ToolInjectionState {
    return {
      injectedTools: new Map(this.state.injectedTools),
      activeToolSets: [...this.state.activeToolSets],
      tokenUsage: new Map(this.state.tokenUsage),
    };
  }

  /**
   * Get tools to inject for current turn
   */
  getToolsForTurn(_input: string): string[] {
    const tools: string[] = [];

    // Always layer: core tools (always present)
    const alwaysTools = this.getAlwaysTools();
    tools.push(...alwaysTools);

    // Dynamic layer: tools from activated ToolSets + alwaysActive ToolSets
    const dynamicTools = this.getDynamicTools();
    tools.push(...dynamicTools);

    // Deduplicate and update state
    const uniqueTools = [...new Set(tools)];
    this.updateInjectedTools(uniqueTools);

    return uniqueTools;
  }

  /**
   * Get always-layer tools (core tools that are always injected)
   */
  private getAlwaysTools(): string[] {
    const alwaysTools = this.state.injectedTools.get('always') ?? [];
    return alwaysTools.slice(0, this.config.maxToolsPerLayer.always);
  }

  /**
   * Get dynamic-layer tools based on active ToolSets
   *
   * Note: We rely on LLM to use SearchToolSets and ActivateToolSet to
   * discover and activate tool sets as needed. This approach:
   * - Leverages LLM's semantic understanding
   * - Avoids false positives from keyword matching
   */
  private getDynamicTools(): string[] {
    if (!this.toolProvider) {
      return [];
    }

    // Get tools from manually activated tool sets
    const activeTools = this.toolProvider.getActiveTools(this.state.activeToolSets);

    // Also include tools from alwaysActive ToolSets
    const defaultTools = this.toolProvider.getDefaultTools();

    const allDynamicTools = [...new Set([...activeTools, ...defaultTools])];
    return allDynamicTools.slice(0, this.config.maxToolsPerLayer.dynamic);
  }

  /**
   * Update injected tools state by classifying each tool into its layer
   */
  private updateInjectedTools(tools: string[]): void {
    const alwaysTools: string[] = [];
    const dynamicTools: string[] = [];

    for (const toolName of tools) {
      const info = this.categoryRegistry.getToolInfo(toolName);
      const layer = info?.layer ?? 'dynamic';

      if (layer === 'always') {
        alwaysTools.push(toolName);
      } else {
        dynamicTools.push(toolName);
      }
    }

    this.state.injectedTools.set('always', alwaysTools);
    this.state.injectedTools.set('dynamic', dynamicTools);

    // Update token usage
    this.updateTokenUsage();
  }

  /**
   * Update token usage for each layer
   */
  private updateTokenUsage(): void {
    for (const [layer, tools] of this.state.injectedTools) {
      const tokenCost = this.categoryRegistry.calculateTokenCost(tools);
      this.state.tokenUsage.set(layer, tokenCost);
    }
  }

  /**
   * Activate a tool set (adds its tools to the dynamic layer)
   */
  activateToolSet(toolSetName: string): void {
    this.activateToolSetInternal(toolSetName);
  }

  /**
   * Deactivate a tool set
   */
  deactivateToolSet(toolSetName: string): void {
    const index = this.state.activeToolSets.indexOf(toolSetName);
    if (index === -1) {
      return;
    }

    this.state.activeToolSets.splice(index, 1);

    this.emitEvent({
      type: 'skill_deactivated',
      timestamp: Date.now(),
      skillName: toolSetName,
      layer: 'dynamic',
    });
  }

  /**
   * Get active tool set names
   */
  getActiveToolSets(): string[] {
    return [...this.state.activeToolSets];
  }

  /**
   * @deprecated Use activateToolSet
   */
  activateSkill(skillName: string): void {
    this.activateToolSetInternal(skillName);
  }

  /**
   * @deprecated Use deactivateToolSet
   */
  deactivateSkill(skillName: string): void {
    this.deactivateToolSet(skillName);
  }

  /**
   * @deprecated Use getActiveToolSets
   */
  getActiveSkills(): string[] {
    return this.getActiveToolSets();
  }

  /**
   * Internal tool set activation
   */
  private activateToolSetInternal(toolSetName: string): void {
    if (this.state.activeToolSets.includes(toolSetName)) {
      return;
    }

    this.state.activeToolSets.push(toolSetName);

    this.emitEvent({
      type: 'skill_activated',
      timestamp: Date.now(),
      skillName: toolSetName,
      layer: 'dynamic',
    });
  }

  /**
   * Reset injection state
   */
  reset(): void {
    this.state = this.createInitialState();

    this.emitEvent({
      type: 'state_reset',
      timestamp: Date.now(),
    });
  }

  /**
   * Get token usage summary by layer
   */
  getTokenUsage(): LayerTokenUsage[] {
    const result: LayerTokenUsage[] = [];

    for (const layer of ['always', 'dynamic'] as ToolInjectionLayer[]) {
      const tools = this.state.injectedTools.get(layer) ?? [];
      const used = this.state.tokenUsage.get(layer) ?? 0;
      const budget = this.config.tokenBudgetPerLayer[layer];

      result.push({
        layer,
        used,
        budget,
        toolCount: tools.length,
      });
    }

    return result;
  }

  /**
   * Check if a tool is currently injected
   */
  isToolInjected(toolName: string): boolean {
    for (const tools of this.state.injectedTools.values()) {
      if (tools.includes(toolName)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the layer a tool belongs to
   */
  getToolLayer(toolName: string): ToolInjectionLayer | undefined {
    for (const [layer, tools] of this.state.injectedTools) {
      if (tools.includes(toolName)) {
        return layer;
      }
    }
    return undefined;
  }

  /**
   * Check if budget is exceeded for a layer
   */
  isBudgetExceeded(layer: ToolInjectionLayer): boolean {
    const used = this.state.tokenUsage.get(layer) ?? 0;
    const budget = this.config.tokenBudgetPerLayer[layer];
    return used > budget;
  }

  /**
   * Get total token usage
   */
  getTotalTokenUsage(): number {
    let total = 0;
    for (const usage of this.state.tokenUsage.values()) {
      total += usage;
    }
    return total;
  }

  /**
   * Get total token budget
   */
  getTotalTokenBudget(): number {
    return this.config.tokenBudgetPerLayer.always + this.config.tokenBudgetPerLayer.dynamic;
  }

  /**
   * Add event listener
   */
  addEventListener(listener: InjectionEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit event to all listeners
   */
  private emitEvent(event: InjectionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        logger.error('Event listener error', { error });
      }
    }
  }
}

/**
 * Create a tool injection manager instance
 */
export function createToolInjectionManager(
  categoryRegistry: IToolCategoryRegistry,
  toolProvider?: IToolProvider,
  config?: Partial<ToolInjectionConfig>,
): ToolInjectionManager {
  return new ToolInjectionManager(categoryRegistry, toolProvider, config);
}
