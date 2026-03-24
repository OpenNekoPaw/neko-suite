/**
 * Pipeline Hook Registry — Maps action strings to executable handlers
 *
 * Enables dynamic pipeline extensibility: new functionality (content filtering,
 * quality checks, multi-language dubbing) can be inserted as before/after hooks
 * on any stage, without modifying flow definitions.
 *
 * Usage:
 *   const registry = createPipelineHookRegistry();
 *   registry.register('contentFilter', async (ctx, stageName, params) => {
 *     // filter content...
 *     return ctx;
 *   });
 */

import type { PipelineContext } from './types';
import { getLogger } from '../utils/logger';

const logger = getLogger('PipelineHookRegistry');

/**
 * Hook handler signature — receives context, returns modified context
 */
export type HookHandler = (
  ctx: PipelineContext,
  stageName: string,
  params?: Record<string, unknown>,
) => Promise<PipelineContext>;

/**
 * Pipeline hook registry — action string → handler mapping
 */
export class PipelineHookRegistry {
  private readonly handlers = new Map<string, HookHandler>();

  /**
   * Register a hook handler for an action
   */
  register(action: string, handler: HookHandler): void {
    if (this.handlers.has(action)) {
      logger.warn('Overwriting existing hook handler', { action });
    }
    this.handlers.set(action, handler);
  }

  /**
   * Unregister a hook handler
   */
  unregister(action: string): void {
    this.handlers.delete(action);
  }

  /**
   * Check if a handler is registered for an action
   */
  has(action: string): boolean {
    return this.handlers.has(action);
  }

  /**
   * Execute a registered hook handler
   * @throws if action is not registered
   */
  async execute(
    action: string,
    ctx: PipelineContext,
    stageName: string,
    params?: Record<string, unknown>,
  ): Promise<PipelineContext> {
    const handler = this.handlers.get(action);
    if (!handler) {
      throw new Error(`Hook action not registered: ${action}`);
    }
    return handler(ctx, stageName, params);
  }

  /**
   * List all registered action names
   */
  listActions(): string[] {
    return [...this.handlers.keys()];
  }
}

/**
 * Create a new pipeline hook registry
 */
export function createPipelineHookRegistry(): PipelineHookRegistry {
  return new PipelineHookRegistry();
}
