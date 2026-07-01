/**
 * NekoAssets Agent Capability Provider
 *
 * Compatibility entry for VSCode extension registration. The implementation is
 * shared with CLI/TUI through the VSCode-free headless provider factory.
 */

import type { AgentCapabilityProvider, NekoAssetsAPI } from '@neko/shared';
import { createNekoAssetsHeadlessCapabilityProvider } from './agentHeadlessCapabilityProvider';

export { createNekoAssetsHeadlessCapabilityProvider } from './agentHeadlessCapabilityProvider';

export function createNekoAssetsCapabilityProvider(api: NekoAssetsAPI): AgentCapabilityProvider {
  return createNekoAssetsHeadlessCapabilityProvider(api);
}
