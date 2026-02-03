/**
 * GPU Texture Pool
 *
 * Manages a pool of GPU textures for reuse, reducing memory allocation overhead.
 * Uses LRU eviction strategy when pool is full.
 *
 * Benefits:
 * - Reduces GPU memory allocation/deallocation overhead
 * - Improves frame rendering performance
 * - Provides predictable memory usage
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Texture pool configuration
 */
export interface TexturePoolConfig {
  /** Maximum number of textures to keep in pool */
  maxSize: number;
  /** Texture format */
  format: GPUTextureFormat;
  /** Texture usage flags */
  usage: GPUTextureUsageFlags;
}

/**
 * Pooled texture entry
 */
interface PooledTexture {
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
  height: number;
  lastUsed: number;
  inUse: boolean;
}

/**
 * Texture key for lookup
 */
type TextureKey = `${number}x${number}`;

// =============================================================================
// TexturePool Implementation
// =============================================================================

/**
 * GPU Texture Pool
 *
 * Example usage:
 * ```typescript
 * const pool = new TexturePool(device, { maxSize: 32, format: 'rgba8unorm', usage: ... });
 *
 * // Acquire a texture
 * const { texture, view } = pool.acquire(1920, 1080);
 *
 * // Use texture for rendering...
 *
 * // Release back to pool
 * pool.release(texture);
 *
 * // Cleanup
 * pool.dispose();
 * ```
 */
export class TexturePool {
  private _device: GPUDevice;
  private _config: TexturePoolConfig;
  private _pool: Map<TextureKey, PooledTexture[]> = new Map();
  private _allTextures: Set<GPUTexture> = new Set();
  private _totalCount = 0;

  constructor(device: GPUDevice, config: TexturePoolConfig) {
    this._device = device;
    this._config = config;
  }

  /**
   * Update texture format
   */
  get format(): GPUTextureFormat {
    return this._config.format;
  }

  /**
   * Acquire a texture from the pool or create a new one
   */
  acquire(width: number, height: number): { texture: GPUTexture; view: GPUTextureView } {
    const key: TextureKey = `${width}x${height}`;
    const pooledList = this._pool.get(key);

    // Try to find an available texture in the pool
    if (pooledList) {
      for (const entry of pooledList) {
        if (!entry.inUse) {
          entry.inUse = true;
          entry.lastUsed = performance.now();
          return { texture: entry.texture, view: entry.view };
        }
      }
    }

    // Need to create a new texture
    // First, check if we need to evict
    if (this._totalCount >= this._config.maxSize) {
      this._evictLRU();
    }

    // Create new texture
    const texture = this._device.createTexture({
      size: { width, height },
      format: this._config.format,
      usage: this._config.usage,
    });

    const view = texture.createView();

    const entry: PooledTexture = {
      texture,
      view,
      width,
      height,
      lastUsed: performance.now(),
      inUse: true,
    };

    // Add to pool
    if (!this._pool.has(key)) {
      this._pool.set(key, []);
    }
    this._pool.get(key)!.push(entry);
    this._allTextures.add(texture);
    this._totalCount++;

    return { texture, view };
  }

  /**
   * Release a texture back to the pool
   */
  release(texture: GPUTexture): void {
    // Find the texture in the pool
    let found = false;
    this._pool.forEach((pooledList) => {
      if (found) return;
      for (const entry of pooledList) {
        if (entry.texture === texture) {
          entry.inUse = false;
          entry.lastUsed = performance.now();
          found = true;
          return;
        }
      }
    });

    // If not found in pool, it was created outside the pool
    if (!found) {
      console.warn('[TexturePool] Attempted to release unknown texture');
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): { total: number; inUse: number; available: number; bySize: Map<string, number> } {
    let inUse = 0;
    let available = 0;
    const bySize = new Map<string, number>();

    this._pool.forEach((pooledList, key) => {
      bySize.set(key, pooledList.length);
      for (const entry of pooledList) {
        if (entry.inUse) {
          inUse++;
        } else {
          available++;
        }
      }
    });

    return {
      total: this._totalCount,
      inUse,
      available,
      bySize,
    };
  }

  /**
   * Clear all unused textures from the pool
   */
  clearUnused(): number {
    let cleared = 0;
    const keysToDelete: TextureKey[] = [];

    this._pool.forEach((pooledList, key) => {
      const remaining: PooledTexture[] = [];

      for (const entry of pooledList) {
        if (entry.inUse) {
          remaining.push(entry);
        } else {
          entry.texture.destroy();
          this._allTextures.delete(entry.texture);
          this._totalCount--;
          cleared++;
        }
      }

      if (remaining.length === 0) {
        keysToDelete.push(key);
      } else {
        this._pool.set(key, remaining);
      }
    });

    // Delete empty keys after iteration
    for (const key of keysToDelete) {
      this._pool.delete(key);
    }

    return cleared;
  }

  /**
   * Dispose of all textures and cleanup
   */
  dispose(): void {
    this._allTextures.forEach((texture) => {
      try {
        texture.destroy();
      } catch {
        // Ignore errors during cleanup
      }
    });

    this._pool.clear();
    this._allTextures.clear();
    this._totalCount = 0;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Evict least recently used texture
   */
  private _evictLRU(): void {
    // Find the oldest unused texture using explicit iteration
    let oldestEntry: PooledTexture | undefined;
    let oldestKey: TextureKey | undefined;
    let oldestTime = Infinity;

    const keys = Array.from(this._pool.keys());
    for (const key of keys) {
      const pooledList = this._pool.get(key);
      if (!pooledList) continue;

      for (const entry of pooledList) {
        if (!entry.inUse && entry.lastUsed < oldestTime) {
          oldestEntry = entry;
          oldestKey = key;
          oldestTime = entry.lastUsed;
        }
      }
    }

    if (oldestEntry && oldestKey) {
      // Remove from pool
      const pooledList = this._pool.get(oldestKey);
      if (pooledList) {
        const index = pooledList.indexOf(oldestEntry);
        if (index >= 0) {
          pooledList.splice(index, 1);
          if (pooledList.length === 0) {
            this._pool.delete(oldestKey);
          }
        }
      }

      // Destroy texture
      oldestEntry.texture.destroy();
      this._allTextures.delete(oldestEntry.texture);
      this._totalCount--;
    }
  }

  /**
   * Find existing entry for a GPUTexture
   * Returns the PooledTexture entry if found
   */
  findEntry(texture: GPUTexture): PooledTexture | undefined {
    for (const pooledList of this._pool.values()) {
      for (const entry of pooledList) {
        if (entry.texture === texture) {
          return entry;
        }
      }
    }
    return undefined;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a texture pool with default settings for video compositing
 */
export function createTexturePool(
  device: GPUDevice,
  options?: Partial<TexturePoolConfig>
): TexturePool {
  const config: TexturePoolConfig = {
    maxSize: options?.maxSize ?? 32,
    format: options?.format ?? 'rgba8unorm',
    usage:
      options?.usage ??
      (GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.RENDER_ATTACHMENT),
  };

  return new TexturePool(device, config);
}
