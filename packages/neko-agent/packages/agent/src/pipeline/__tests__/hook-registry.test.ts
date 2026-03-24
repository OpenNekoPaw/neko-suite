/**
 * PipelineHookRegistry unit tests
 */

import { describe, it, expect, vi } from 'vitest';
import { PipelineHookRegistry } from '../hook-registry';
import type { PipelineContext } from '../types';

function createCtx(overrides?: Partial<PipelineContext>): PipelineContext {
  return { source: '/test.fountain', ...overrides };
}

describe('PipelineHookRegistry', () => {
  describe('register and execute', () => {
    it('should register and execute a hook handler', async () => {
      const registry = new PipelineHookRegistry();
      const handler = vi.fn().mockImplementation(async (ctx: PipelineContext) => ({
        ...ctx,
        globalStyle: 'anime',
      }));

      registry.register('setStyle', handler);
      const result = await registry.execute('setStyle', createCtx(), 'generatePrompts');

      expect(handler).toHaveBeenCalledOnce();
      expect(result.globalStyle).toBe('anime');
    });

    it('should pass stageName and params to handler', async () => {
      const registry = new PipelineHookRegistry();
      const handler = vi.fn().mockResolvedValue(createCtx());

      registry.register('filter', handler);
      await registry.execute('filter', createCtx(), 'batchGenerate', { level: 'strict' });

      expect(handler).toHaveBeenCalledWith(expect.any(Object), 'batchGenerate', {
        level: 'strict',
      });
    });
  });

  describe('has', () => {
    it('should return true for registered actions', () => {
      const registry = new PipelineHookRegistry();
      registry.register('test', async (ctx) => ctx);
      expect(registry.has('test')).toBe(true);
    });

    it('should return false for unregistered actions', () => {
      const registry = new PipelineHookRegistry();
      expect(registry.has('unknown')).toBe(false);
    });
  });

  describe('unregister', () => {
    it('should remove a registered handler', () => {
      const registry = new PipelineHookRegistry();
      registry.register('test', async (ctx) => ctx);
      registry.unregister('test');
      expect(registry.has('test')).toBe(false);
    });
  });

  describe('execute unregistered action', () => {
    it('should throw for unregistered action', async () => {
      const registry = new PipelineHookRegistry();
      await expect(registry.execute('unknown', createCtx(), 'stage')).rejects.toThrow(
        'Hook action not registered: unknown',
      );
    });
  });

  describe('listActions', () => {
    it('should list all registered actions', () => {
      const registry = new PipelineHookRegistry();
      registry.register('a', async (ctx) => ctx);
      registry.register('b', async (ctx) => ctx);
      expect(registry.listActions()).toEqual(['a', 'b']);
    });
  });

  describe('handler chaining', () => {
    it('should allow chaining handlers by passing modified ctx', async () => {
      const registry = new PipelineHookRegistry();

      registry.register('addStyle', async (ctx) => ({
        ...ctx,
        globalStyle: 'cinematic',
      }));

      const ctx1 = await registry.execute('addStyle', createCtx(), 'stage1');
      expect(ctx1.globalStyle).toBe('cinematic');

      // Second handler can read the previous result
      registry.register('addResolution', async (ctx) => ({
        ...ctx,
        resolution: '1080p',
      }));

      const ctx2 = await registry.execute('addResolution', ctx1, 'stage2');
      expect(ctx2.globalStyle).toBe('cinematic');
      expect(ctx2.resolution).toBe('1080p');
    });
  });
});
