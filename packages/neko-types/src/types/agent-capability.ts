/**
 * Agent Capability Provider Protocol
 *
 * Defines the contract for sub-packages to provide AI capabilities to neko-agent.
 * Uses a hybrid discovery mechanism:
 * - Static: Sub-packages declare capabilities in package.json `contributes.neko.agentCapabilities`
 * - Dynamic: Sub-packages register providers at runtime via VSCode Command
 *
 * This protocol replaces the centralized `createXxxTools()` pattern where neko-agent
 * manually imports and registers tools from every sub-package.
 */

import type { Tool, ToolCategory } from './tool';
import type { ToolGroup } from './tool-group';
import type { Skill } from './skill';
import type { LoadingTier } from './loading-tier';

// =============================================================================
// Static Manifest (package.json contributes)
// =============================================================================

/**
 * Declared in a sub-package's package.json under `contributes.neko.agentCapabilities`.
 * Used by neko-agent for static discovery at startup — before the sub-package activates.
 */
export interface AgentCapabilityManifest {
  /** Unique provider ID matching the extension's short name (e.g. "neko-cut") */
  id: string;

  /** Semantic version of the capability set */
  version: string;

  /** Human-readable display name */
  displayName: string;

  /** Static capability declarations (for AI tool discovery metadata) */
  capabilities: CapabilityDeclaration[];
}

/**
 * Static declaration of a single capability.
 * Only metadata — the actual Tool/Skill implementation is provided at runtime.
 */
export interface CapabilityDeclaration {
  /** Capability type */
  type: 'tool' | 'skill' | 'toolGroup';

  /** Name (must match the runtime Tool.name / Skill.name / ToolGroup.name) */
  name: string;

  /** Tool category for filtering */
  category?: ToolCategory;

  /** Human-readable description */
  description: string;

  /** Loading tier for tiered lazy loading */
  loadingTier?: LoadingTier;
}

// =============================================================================
// Runtime Provider (dynamic registration)
// =============================================================================

/**
 * Context passed to providers when requesting tools.
 * Keeps the provider decoupled from VSCode API at the type level.
 */
export interface AgentCapabilityContext {
  /**
   * Extension context handle (opaque at L0; sub-packages cast to vscode.ExtensionContext at L1).
   * Provides access to workspace state, secrets, extension storage, etc.
   */
  extensionContext: unknown;
}

/**
 * Runtime capability provider implemented by each sub-package.
 *
 * Sub-packages export a class implementing this interface and register it
 * via `vscode.commands.executeCommand('neko.agent.registerCapabilities', provider)`.
 *
 * neko-agent discovers providers through:
 * 1. Static manifest scan → identifies which extensions have capabilities
 * 2. Dynamic registration → receives the provider instance at runtime
 */
export interface AgentCapabilityProvider {
  /** Provider ID (must match manifest.id) */
  readonly id: string;

  /** Provider version (must match manifest.version) */
  readonly version: string;

  /**
   * Return tools provided by this sub-package.
   * Called once during registration; returned tools are registered in the ToolRegistry.
   */
  getTools(context: AgentCapabilityContext): Tool[];

  /**
   * Optional: Return skills provided by this sub-package.
   * Skills are workflow templates that reference tools from getTools().
   */
  getSkills?(): Skill[];

  /**
   * Optional: Return tool groups for tiered lazy loading.
   * Groups organize tools by domain for selective activation.
   */
  getToolGroups?(): ToolGroup[];

  /**
   * Optional: Cleanup when the provider is unregistered (extension deactivated).
   */
  dispose?(): void;
}
