/**
 * LibavCore - libav.js Instance Manager (Singleton)
 *
 * Responsibilities:
 * - Load libav.js from statically bundled asm.js factory
 * - Manage libav instance lifecycle
 * - Provide shared instance to avoid repeated initialization
 *
 * Uses @wcpeter/libav.js-h264-aac-wav variant with AAC encoder/decoder support
 *
 * NOTE: We use static import of the asm.js factory to avoid dynamic import issues
 * in VSCode Webview. VSCode Webview blocks dynamic import() of external scripts.
 */

import type { LibAV as LibAVType } from 'libav.js';

// Static import of libav.js main module and asm.js factory
// This bundles the factory directly into the main bundle, avoiding dynamic import
import libavModule from '@wcpeter/libav.js-h264-aac-wav';
// @ts-expect-error - asm.mjs exports LibAVFactory as default
import LibAVFactory from '@wcpeter/libav.js-h264-aac-wav/dist/libav-6.4.7.1-h264-aac-wav.asm.mjs';

// Re-export LibAV type for convenience
export type LibAV = LibAVType;

// =============================================================================
// LibavCore Singleton
// =============================================================================

export class LibavCore {
  private static _instance: LibavCore | null = null;
  private _libav: LibAV | null = null;
  private _initPromise: Promise<LibAV> | null = null;
  private _disposed = false;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): LibavCore {
    if (!LibavCore._instance) {
      LibavCore._instance = new LibavCore();
    }
    return LibavCore._instance;
  }

  /**
   * Get libav instance (lazy initialization)
   */
  async getLibav(): Promise<LibAV> {
    if (this._disposed) {
      throw new Error('LibavCore has been disposed');
    }

    if (this._libav) {
      return this._libav;
    }

    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = this._initialize();
    return this._initPromise;
  }

  /**
   * Check if libav is initialized
   */
  get isInitialized(): boolean {
    return this._libav !== null;
  }

  /**
   * Initialize libav.js using statically bundled asm.js factory
   */
  private async _initialize(): Promise<LibAV> {
    console.log('[LibavCore] Initializing libav.js from statically bundled factory...');
    const startTime = performance.now();

    try {
      // libavModule is the LibAVWrapper which has LibAV function directly
      const libav = libavModule as unknown as { LibAV: (opts?: Record<string, unknown>) => Promise<LibAVType> };

      console.log('[LibavCore] Creating libav instance with:');
      console.log('  factory: statically bundled LibAVFactory');
      console.log('  noworker: true (VSCode Webview compatibility)');
      console.log('  nowasm: true (force asm.js mode)');
      console.log('  LibAVFactory type:', typeof LibAVFactory);

      // Use the statically imported factory to avoid any dynamic loading
      // This completely bypasses the dynamic import() that VSCode Webview blocks
      this._libav = await libav.LibAV({
        factory: LibAVFactory,  // Use statically bundled factory
        noworker: true,         // Disable worker for VSCode Webview compatibility
        nowasm: true,           // Force asm.js mode, don't try to load WASM files
      }) as unknown as LibAV;

      const elapsed = performance.now() - startTime;
      console.log(`[LibavCore] Initialized successfully in ${elapsed.toFixed(0)}ms (static bundle)`);

      return this._libav!;
    } catch (error) {
      console.error('[LibavCore] Initialization failed:', error);
      this._initPromise = null;
      throw new Error(
        `libav.js 初始化失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    if (this._libav) {
      try {
        this._libav.terminate();
      } catch {
        // Ignore termination errors
      }
      this._libav = null;
    }

    this._initPromise = null;
    console.log('[LibavCore] Disposed');
  }

  /**
   * Reset singleton (for testing)
   */
  static reset(): void {
    if (LibavCore._instance) {
      LibavCore._instance.dispose();
      LibavCore._instance = null;
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * Shared LibavCore instance
 */
export const libavCore = LibavCore.getInstance();

/**
 * Check if libav.js is available
 */
export async function isLibavAvailable(): Promise<boolean> {
  try {
    await libavCore.getLibav();
    return true;
  } catch {
    return false;
  }
}

// Legacy exports for backward compatibility (no longer needed but kept for safety)
export function setLibavBaseUrl(_url: string): void {
  // No-op: no longer needed with static bundling
}
