/**
 * ExecutorHooksFactory Tests
 *
 * Verifies that the factory creates a correctly composed hooks chain.
 */

import { describe, it, expect, vi } from 'vitest';
import { createExecutorHooks } from '../executor-hooks-factory';
import type { ExecutorHooks } from '@neko/shared';

// =============================================================================
// Helpers
// =============================================================================

function createMockCompressor() {
  return {
    compress: vi.fn().mockResolvedValue({ messages: [] }),
    estimateTokens: vi.fn().mockReturnValue(0),
  } as unknown as import('../../context').ConversationCompressor;
}

// =============================================================================
// Tests
// =============================================================================

describe('createExecutorHooks', () => {
  it('should return hooks array with 4 built-in hooks', () => {
    const result = createExecutorHooks({
      compressor: createMockCompressor(),
      permissionMode: 'auto',
    });

    // memory + validation + permission + retry = 4
    expect(result.hooks.length).toBe(4);
  });

  it('should return permissionHooks reference', () => {
    const result = createExecutorHooks({
      compressor: createMockCompressor(),
      permissionMode: 'auto',
    });

    expect(result.permissionHooks).toBeDefined();
    // The returned IPermissionManager is also an ExecutorHooks (PermissionHooks class)
    expect((result.permissionHooks as unknown as { name: string }).name).toBe('permission');
  });

  it('should place hooks in correct order: memory → validation → permission → retry', () => {
    const result = createExecutorHooks({
      compressor: createMockCompressor(),
      permissionMode: 'auto',
    });

    const names = result.hooks.map((h) => h.name);
    expect(names).toEqual(['memory', 'validation', 'permission', 'retry']);
  });

  it('should append custom hooks after built-in hooks', () => {
    const customHook: ExecutorHooks = { name: 'custom' };
    const result = createExecutorHooks({
      compressor: createMockCompressor(),
      permissionMode: 'auto',
      customHooks: [customHook],
    });

    expect(result.hooks.length).toBe(5);
    expect(result.hooks[4]!.name).toBe('custom');
  });

  it('should set permission mode on created permission hooks', () => {
    const result = createExecutorHooks({
      compressor: createMockCompressor(),
      permissionMode: 'ask',
    });

    expect(result.permissionHooks.getMode()).toBe('ask');
  });

  it('should handle empty custom hooks', () => {
    const result = createExecutorHooks({
      compressor: createMockCompressor(),
      permissionMode: 'auto',
      customHooks: [],
    });

    expect(result.hooks.length).toBe(4);
  });

  it('should exclude hooks listed in disableHooks', () => {
    const result = createExecutorHooks({
      compressor: createMockCompressor(),
      permissionMode: 'auto',
      disableHooks: ['validation', 'retry'],
    });

    const names = result.hooks.map((h) => h.name);
    expect(names).toEqual(['memory', 'permission']);
  });

  it('should not filter hooks when disableHooks is undefined', () => {
    const result = createExecutorHooks({
      compressor: createMockCompressor(),
      permissionMode: 'auto',
    });

    expect(result.hooks.length).toBe(4);
  });
});
