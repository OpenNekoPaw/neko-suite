/**
 * Tool Injection Manager - Implements three-layer tool injection mechanism
 *
 * Three layers:
 * - L1 Core: Always injected (~5 tools) - Read, Write, Bash, ListDirectory, Grep
 * - L2 Skill: Injected when skill is active (~20 tools)
 * - L3 On-demand: Injected on LLM request (~10 tools)
 *
 * Works with ToolCategoryRegistry for categorization and IToolProvider for skill-based tools.
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

  /** Tool provider for skill-based tools (optional) */
  private toolProvider?: IToolProvider;

  /** Event listeners */
  private listeners: Set<InjectionEventListener> = new Set();

  constructor(
    categoryRegistry: IToolCategoryRegistry,
    toolProvider?: IToolProvider,
    config?: Partial<ToolInjectionConfig>
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
      injectedTools: new Map([
        ['core', [...CORE_TOOLS]],
        ['skill', []],
        ['ondemand', []],
      ]),
      activeSkills: [],
      pendingOnDemand: [],
      tokenUsage: new Map([
        ['core', 0],
        ['skill', 0],
        ['ondemand', 0],
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
      activeSkills: [...this.state.activeSkills],
      pendingOnDemand: [...this.state.pendingOnDemand],
      tokenUsage: new Map(this.state.tokenUsage),
    };
  }

  /**
   * Get tools to inject for current turn
   */
  getToolsForTurn(input: string): string[] {
    const tools: string[] = [];

    // L1: Core tools (always injected)
    const coreTools = this.getCoreTools();
    tools.push(...coreTools);

    // L2: Skill tools (based on active skills + auto-activation)
    const skillTools = this.getSkillTools(input);
    tools.push(...skillTools);

    // L3: On-demand tools (if enabled)
    if (this.config.enableOnDemand) {
      const onDemandTools = this.getOnDemandTools();
      tools.push(...onDemandTools);
    }

    // Deduplicate and update state
    const uniqueTools = [...new Set(tools)];
    this.updateInjectedTools(uniqueTools);

    return uniqueTools;
  }

  /**
   * Get core tools (L1)
   */
  private getCoreTools(): string[] {
    const coreTools = this.state.injectedTools.get('core') ?? [];
    return coreTools.slice(0, this.config.maxToolsPerLayer.core);
  }

  /**
   * Get skill tools (L2) based on active skills
   *
   * Note: We no longer auto-activate skills based on keyword matching.
   * Instead, we rely on LLM to use SearchTools and ActivateSkill to
   * discover and activate skills as needed. This approach:
   * - Leverages LLM's semantic understanding
   * - Reduces maintenance of keyword lists
   * - Avoids false positives from keyword matching
   */
  private getSkillTools(_input: string): string[] {
    if (!this.toolProvider) {
      return [];
    }

    // Get tools from manually activated skills
    const skillTools = this.toolProvider.getActiveTools(this.state.activeSkills);

    // Also include default active tools
    const defaultTools = this.toolProvider.getDefaultTools();

    // Combine and limit
    const allSkillTools = [...new Set([...skillTools, ...defaultTools])];
    return allSkillTools.slice(0, this.config.maxToolsPerLayer.skill);
  }

  /**
   * Get on-demand tools (L3)
   */
  private getOnDemandTools(): string[] {
    const onDemandTools = this.state.injectedTools.get('ondemand') ?? [];
    return onDemandTools.slice(0, this.config.maxToolsPerLayer.ondemand);
  }

  /**
   * Update injected tools state
   */
  private updateInjectedTools(tools: string[]): void {
    const coreTools: string[] = [];
    const skillTools: string[] = [];
    const onDemandTools: string[] = [];

    for (const toolName of tools) {
      const info = this.categoryRegistry.getToolInfo(toolName);
      const layer = info?.layer ?? 'skill';

      switch (layer) {
        case 'core':
          coreTools.push(toolName);
          break;
        case 'skill':
          skillTools.push(toolName);
          break;
        case 'ondemand':
          onDemandTools.push(toolName);
          break;
      }
    }

    this.state.injectedTools.set('core', coreTools);
    this.state.injectedTools.set('skill', skillTools);
    this.state.injectedTools.set('ondemand', onDemandTools);

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
   * Activate a skill (adds its tools to L2)
   */
  activateSkill(skillName: string): void {
    this.activateSkillInternal(skillName, true);
  }

  /**
   * Internal skill activation
   */
  private activateSkillInternal(skillName: string, emitEvent: boolean): void {
    if (this.state.activeSkills.includes(skillName)) {
      return;
    }

    this.state.activeSkills.push(skillName);

    if (emitEvent) {
      this.emitEvent({
        type: 'skill_activated',
        timestamp: Date.now(),
        skillName,
        layer: 'skill',
      });
    }
  }

  /**
   * Deactivate a skill
   */
  deactivateSkill(skillName: string): void {
    const index = this.state.activeSkills.indexOf(skillName);
    if (index === -1) {
      return;
    }

    this.state.activeSkills.splice(index, 1);

    this.emitEvent({
      type: 'skill_deactivated',
      timestamp: Date.now(),
      skillName,
      layer: 'skill',
    });
  }

  /**
   * Add tool to on-demand layer
   */
  addOnDemandTool(toolName: string): void {
    const onDemandTools = this.state.injectedTools.get('ondemand') ?? [];
    if (!onDemandTools.includes(toolName)) {
      onDemandTools.push(toolName);
      this.state.injectedTools.set('ondemand', onDemandTools);

      this.emitEvent({
        type: 'tool_injected',
        timestamp: Date.now(),
        toolName,
        layer: 'ondemand',
      });
    }
  }

  /**
   * Remove tool from on-demand layer
   */
  removeOnDemandTool(toolName: string): void {
    const onDemandTools = this.state.injectedTools.get('ondemand') ?? [];
    const index = onDemandTools.indexOf(toolName);
    if (index !== -1) {
      onDemandTools.splice(index, 1);
      this.state.injectedTools.set('ondemand', onDemandTools);

      this.emitEvent({
        type: 'tool_removed',
        timestamp: Date.now(),
        toolName,
        layer: 'ondemand',
      });
    }
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

    for (const layer of ['core', 'skill', 'ondemand'] as ToolInjectionLayer[]) {
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
   * Get active skill names
   */
  getActiveSkills(): string[] {
    return [...this.state.activeSkills];
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
    return (
      this.config.tokenBudgetPerLayer.core +
      this.config.tokenBudgetPerLayer.skill +
      this.config.tokenBudgetPerLayer.ondemand
    );
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
        console.error('[ToolInjectionManager] Event listener error:', error);
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
  config?: Partial<ToolInjectionConfig>
): ToolInjectionManager {
  return new ToolInjectionManager(categoryRegistry, toolProvider, config);
}
