/**
 * PermissionBridge — Routes SubAgent tool confirmations to parent session
 *
 * When a SubAgent encounters a tool that requires confirmation (e.g., expensive
 * generation, destructive operations), the confirmation request is forwarded to
 * the parent session's UI rather than being silently denied or auto-approved.
 *
 * Usage: Create ExecutorHooks via createHooks(), pass to SubAgent executor.
 */

import type { ExecutorHooks, ToolCallInfo, ToolResult, ToolResultWithMeta } from '@neko/shared';
import { getLogger } from '../../utils/logger';

const logger = getLogger('PermissionBridge');

// =============================================================================
// Types
// =============================================================================

/** Configuration for PermissionBridge */
export interface PermissionBridgeConfig {
  /** Callback to route confirmation to parent session */
  onConfirmTool: (toolCall: ToolCallInfo) => Promise<boolean>;
  /** Tool names that require confirmation (empty = check all via callback) */
  confirmPatterns?: string[];
  /** Timeout for confirmation response (ms, default: 60000) */
  confirmTimeout?: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIRM_TIMEOUT = 60_000; // 1 minute

// =============================================================================
// PermissionBridge
// =============================================================================

export class PermissionBridge {
  private _config: PermissionBridgeConfig;

  constructor(config: PermissionBridgeConfig) {
    this._config = config;
  }

  /**
   * Create ExecutorHooks that intercept tool calls requiring confirmation
   * and route them to the parent session.
   */
  createHooks(): ExecutorHooks {
    return {
      name: 'PermissionBridge',

      onToolCall: async (
        info: ToolCallInfo,
        _execute: () => Promise<ToolResult>,
      ): Promise<ToolResultWithMeta | null> => {
        // Check if this tool requires confirmation
        if (!this.requiresConfirmation(info)) {
          return null; // Allow subsequent hooks to handle
        }

        try {
          // Route to parent session
          const approved = await this.requestConfirmation(info);

          if (!approved) {
            return {
              success: false,
              error: `Tool "${info.name}" was denied by user via coordinator permission bridge`,
              callId: info.id,
              name: info.name,
            };
          }

          // Approved — allow execution by returning null
          return null;
        } catch (err) {
          logger.error('Permission bridge error', { toolName: info.name, error: err });
          return {
            success: false,
            error: `Permission bridge error: ${err instanceof Error ? err.message : String(err)}`,
            callId: info.id,
            name: info.name,
          };
        }
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private requiresConfirmation(info: ToolCallInfo): boolean {
    const patterns = this._config.confirmPatterns;
    if (!patterns || patterns.length === 0) {
      // No patterns = delegate all decisions to callback
      return true;
    }
    return patterns.some(
      (pattern) => info.name === pattern || info.name.startsWith(pattern.replace('*', '')),
    );
  }

  private async requestConfirmation(info: ToolCallInfo): Promise<boolean> {
    const timeout = this._config.confirmTimeout ?? DEFAULT_CONFIRM_TIMEOUT;

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        logger.warn('Permission bridge timeout, denying', { toolName: info.name });
        resolve(false);
      }, timeout);

      this._config
        .onConfirmTool(info)
        .then((approved) => {
          clearTimeout(timer);
          resolve(approved);
        })
        .catch((err) => {
          clearTimeout(timer);
          logger.error('Permission bridge callback error', { error: err });
          resolve(false);
        });
    });
  }
}

// =============================================================================
// Factory
// =============================================================================

/** Create a PermissionBridge instance */
export function createPermissionBridge(config: PermissionBridgeConfig): PermissionBridge {
  return new PermissionBridge(config);
}
