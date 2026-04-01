/**
 * PermissionBridge Tests — SubAgent confirmation routing to parent
 */

import { describe, it, expect, vi } from 'vitest';
import { createPermissionBridge } from '../permission-bridge';
import type { ToolCallInfo } from '@neko/shared';

// =============================================================================
// Helpers
// =============================================================================

function makeToolCall(name: string): ToolCallInfo {
  return { id: `call-${name}`, name, arguments: {}, index: 0 };
}

const mockExecute = vi.fn().mockResolvedValue({ success: true });

// =============================================================================
// Tests
// =============================================================================

describe('PermissionBridge', () => {
  describe('createHooks', () => {
    it('should return hooks with onToolCall', () => {
      const bridge = createPermissionBridge({
        onConfirmTool: vi.fn().mockResolvedValue(true),
      });
      const hooks = bridge.createHooks();
      expect(hooks.name).toBe('PermissionBridge');
      expect(hooks.onToolCall).toBeDefined();
    });
  });

  describe('confirmation routing', () => {
    it('should approve when callback returns true', async () => {
      const onConfirm = vi.fn().mockResolvedValue(true);
      const bridge = createPermissionBridge({ onConfirmTool: onConfirm });
      const hooks = bridge.createHooks();

      const result = await hooks.onToolCall!(makeToolCall('GenerateVideo'), mockExecute);

      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ name: 'GenerateVideo' }));
      expect(result).toBeNull(); // null = allow execution
    });

    it('should deny when callback returns false', async () => {
      const onConfirm = vi.fn().mockResolvedValue(false);
      const bridge = createPermissionBridge({ onConfirmTool: onConfirm });
      const hooks = bridge.createHooks();

      const result = await hooks.onToolCall!(makeToolCall('DeleteTrack'), mockExecute);

      expect(result).not.toBeNull();
      expect(result!.success).toBe(false);
      expect(result!.error).toContain('denied by user');
    });

    it('should deny on callback error', async () => {
      const onConfirm = vi.fn().mockRejectedValue(new Error('Connection lost'));
      const bridge = createPermissionBridge({ onConfirmTool: onConfirm });
      const hooks = bridge.createHooks();

      const result = await hooks.onToolCall!(makeToolCall('SomeAction'), mockExecute);

      // Callback rejection → resolve(false) → denied
      expect(result).not.toBeNull();
      expect(result!.success).toBe(false);
      expect(result!.error).toContain('denied by user');
    });
  });

  describe('confirmPatterns', () => {
    it('should only intercept matching tools', async () => {
      const onConfirm = vi.fn().mockResolvedValue(true);
      const bridge = createPermissionBridge({
        onConfirmTool: onConfirm,
        confirmPatterns: ['GenerateVideo', 'Delete*'],
      });
      const hooks = bridge.createHooks();

      // Non-matching tool — should pass through (return null without calling callback)
      const result = await hooks.onToolCall!(makeToolCall('ReadFile'), mockExecute);
      expect(result).toBeNull();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('should intercept exact match', async () => {
      const onConfirm = vi.fn().mockResolvedValue(false);
      const bridge = createPermissionBridge({
        onConfirmTool: onConfirm,
        confirmPatterns: ['GenerateVideo'],
      });
      const hooks = bridge.createHooks();

      await hooks.onToolCall!(makeToolCall('GenerateVideo'), mockExecute);
      expect(onConfirm).toHaveBeenCalled();
    });

    it('should intercept prefix pattern match', async () => {
      const onConfirm = vi.fn().mockResolvedValue(true);
      const bridge = createPermissionBridge({
        onConfirmTool: onConfirm,
        confirmPatterns: ['Delete*'],
      });
      const hooks = bridge.createHooks();

      await hooks.onToolCall!(makeToolCall('DeleteTrack'), mockExecute);
      expect(onConfirm).toHaveBeenCalled();
    });
  });

  describe('timeout', () => {
    it('should deny on timeout', async () => {
      const onConfirm = vi.fn().mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );
      const bridge = createPermissionBridge({
        onConfirmTool: onConfirm,
        confirmTimeout: 50, // 50ms timeout for test
      });
      const hooks = bridge.createHooks();

      const result = await hooks.onToolCall!(makeToolCall('SlowTool'), mockExecute);

      // Timeout → resolve(false) → deny
      expect(result).not.toBeNull();
      expect(result!.success).toBe(false);
      expect(result!.error).toContain('denied by user');
    }, 5000);
  });
});
