/**
 * Capability Bootstrap — Initialize the AgentCapabilityProvider discovery system.
 *
 * Sets up the CapabilityDiscoveryService which allows sub-packages to register
 * their AI capabilities (Tools, Skills, ToolGroups) via:
 * - Static manifest in package.json `contributes.neko.agentCapabilities`
 * - Dynamic registration via `neko.agent.registerCapabilities` Command
 *
 * Platform services (media, config, embedFn) are injected into the capability
 * context so sub-packages can use them without depending on @neko/platform.
 */

import * as vscode from 'vscode';
import type { ICapabilityMediaService, ICapabilityConfigManager } from '@neko/shared';
import {
  CapabilityDiscoveryService,
  type CapabilityDiscoveryDeps,
} from '../services/capabilityDiscoveryService';

let _instance: CapabilityDiscoveryService | undefined;

export interface CapabilityBootstrapOptions extends CapabilityDiscoveryDeps {
  /** Media generation service from Platform */
  mediaService?: ICapabilityMediaService;
  /** Config manager from Platform */
  configManager?: ICapabilityConfigManager;
  /** Embedding function for semantic search */
  embedFn?: (texts: string[]) => Promise<number[][]>;
}

/**
 * Initialize and activate the capability discovery system.
 * Returns the service instance for query access.
 */
export function bootstrapCapabilities(
  options: CapabilityBootstrapOptions,
  context: vscode.ExtensionContext,
): CapabilityDiscoveryService {
  _instance = new CapabilityDiscoveryService(options);
  _instance.activate(context, {
    mediaService: options.mediaService,
    configManager: options.configManager,
    embedFn: options.embedFn,
  });
  context.subscriptions.push(_instance);
  return _instance;
}

/**
 * Get the capability discovery service instance.
 * Throws if not yet bootstrapped.
 */
export function getCapabilityDiscoveryService(): CapabilityDiscoveryService {
  if (!_instance) {
    throw new Error(
      'CapabilityDiscoveryService not initialized — call bootstrapCapabilities first',
    );
  }
  return _instance;
}
