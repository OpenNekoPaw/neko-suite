/**
 * Tool Traits Registry — Static metadata for creative permission decisions
 *
 * Maps tool names to their behavioral traits (cost, reversibility, locality, impact).
 * Used by PermissionRuleMatcher to make conditional decisions in auto mode.
 *
 * Decoupled from Tool definitions so that:
 * 1. Extension tools without traits can still be covered
 * 2. MCP tools can have inferred traits
 * 3. Traits can be overridden per-session
 */

import type { ToolTraits } from '@neko/shared';
import { DEFAULT_TOOL_TRAITS } from '@neko/shared';

/**
 * Tool traits registry
 */
export class ToolTraitsRegistry {
  private traits = new Map<string, ToolTraits>();

  /**
   * Register traits for a tool by name
   */
  register(toolName: string, traits: ToolTraits): void {
    this.traits.set(toolName, traits);
  }

  /**
   * Bulk register traits
   */
  registerMany(entries: ReadonlyArray<{ name: string; traits: ToolTraits }>): void {
    for (const { name, traits } of entries) {
      this.traits.set(name, traits);
    }
  }

  /**
   * Get traits for a tool, falling back to DEFAULT_TOOL_TRAITS
   */
  get(toolName: string): ToolTraits {
    return this.traits.get(toolName) ?? DEFAULT_TOOL_TRAITS;
  }

  /**
   * Check if explicit traits are registered for a tool
   */
  has(toolName: string): boolean {
    return this.traits.has(toolName);
  }

  /**
   * Get all registered tool names
   */
  keys(): string[] {
    return Array.from(this.traits.keys());
  }

  /**
   * Get the number of registered tools
   */
  get size(): number {
    return this.traits.size;
  }
}

/**
 * Default creative tool traits for known neko-suite tools.
 *
 * Categorization:
 * - Timeline/Canvas/Effects tools: free, local, reversible
 * - AI generation tools: moderate-expensive, network, irreversible
 */
export const DEFAULT_CREATIVE_TOOL_TRAITS: ReadonlyArray<{ name: string; traits: ToolTraits }> = [
  // ── Timeline tools (NekoCut) — free, local, reversible ──
  {
    name: 'GetTimelineInfo',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' },
  },
  {
    name: 'ListTimelineElements',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' },
  },
  {
    name: 'AddTimelineElement',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'low' },
  },
  {
    name: 'UpdateTimelineElement',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'low' },
  },
  {
    name: 'DeleteTimelineElement',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'low' },
  },

  // ── Canvas tools (NekoCanvas) — free, local, reversible ──
  {
    name: 'canvas_list_nodes',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' },
  },
  {
    name: 'canvas_get_node',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' },
  },
  {
    name: 'canvas_update_node',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'low' },
  },
  {
    name: 'canvas_create_node',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'low' },
  },

  // ── Effects discovery — free, local, read-only ──
  {
    name: 'ListVideoEffects',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' },
  },
  {
    name: 'GetVideoEffectInfo',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' },
  },

  // ── AI generation — network, irreversible, costs API credits ──
  {
    name: 'GenerateImage',
    traits: { cost: 'moderate', reversible: false, locality: 'network', impactLevel: 'high' },
  },
  {
    name: 'TransformImage',
    traits: { cost: 'moderate', reversible: false, locality: 'network', impactLevel: 'high' },
  },
  {
    name: 'GenerateVideo',
    traits: { cost: 'expensive', reversible: false, locality: 'network', impactLevel: 'high' },
  },
  {
    name: 'GenerateMusic',
    traits: { cost: 'moderate', reversible: false, locality: 'network', impactLevel: 'high' },
  },
  {
    name: 'GenerateTTS',
    traits: { cost: 'cheap', reversible: false, locality: 'network', impactLevel: 'low' },
  },

  // ── Canvas AI generation — network, irreversible ──
  {
    name: 'canvas_generate_image',
    traits: { cost: 'moderate', reversible: false, locality: 'network', impactLevel: 'high' },
  },
  {
    name: 'canvas_generate_video_with_keyframes',
    traits: { cost: 'expensive', reversible: false, locality: 'network', impactLevel: 'high' },
  },
  {
    name: 'GenerateVideoForClip',
    traits: { cost: 'expensive', reversible: false, locality: 'network', impactLevel: 'high' },
  },

  // ── Core tools — free, local ──
  {
    name: 'Read',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' },
  },
  {
    name: 'ReadDocument',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' },
  },
  {
    name: 'ReadImage',
    traits: { cost: 'cheap', reversible: true, locality: 'hybrid', impactLevel: 'none' },
  },
  {
    name: 'Write',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'low' },
  },
  {
    name: 'Glob',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' },
  },
  {
    name: 'Grep',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' },
  },
  {
    name: 'ListDirectory',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' },
  },
  {
    name: 'Bash',
    traits: { cost: 'free', reversible: false, locality: 'hybrid', impactLevel: 'high' },
  },
  {
    name: 'GetContext',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' },
  },
  {
    name: 'ActivateSkill',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' },
  },
  {
    name: 'DeactivateSkill',
    traits: { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' },
  },
];
