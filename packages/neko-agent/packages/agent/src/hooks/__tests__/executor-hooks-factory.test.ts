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
  it('should return hooks array with 3 built-in hooks', () => {
    const result = createExecutorHooks({
      compressor: createMockCompressor(),
      permissionMode: 'auto',
    });

    // memory + validation + permission = 3
    expect(result.hooks.length).toBe(3);
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

  it('should place hooks in correct order: memory → validation → permission', () => {
    const result = createExecutorHooks({
      compressor: createMockCompressor(),
      permissionMode: 'auto',
    });

    const names = result.hooks.map((h) => h.name);
    expect(names).toEqual(['memory', 'validation', 'permission']);
  });

  it('should append custom hooks after built-in hooks', () => {
    const customHook: ExecutorHooks = { name: 'custom' };
    const result = createExecutorHooks({
      compressor: createMockCompressor(),
      permissionMode: 'auto',
      customHooks: [customHook],
    });

    expect(result.hooks.length).toBe(4);
    expect(result.hooks[3]!.name).toBe('custom');
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

    expect(result.hooks.length).toBe(3);
  });
});
