/**
 * Inochi2DController — drives 2D puppet rendering via neko-engine HTTP API
 *
 * Loads INP files through the engine backend (native-puppet crate),
 * manages parameter-driven deformation, and provides vertex data
 * for WebGL2 rendering in the sketch canvas.
 *
 * Data flow:
 *   INP file → EngineClient.loadPuppet() → PuppetSnapshot (textures, meshes, params)
 *   Parameter change → EngineClient.setPuppetParameter() → recomputed vertices
 *   Tick → EngineClient.tickPuppet() → PuppetDelta (deformed meshes)
 */

import type { EngineClient } from '@neko/neko-client';
import type { PuppetSnapshot, PuppetDelta, DeformedMesh, ParameterInfo } from './types';

/** Interface for puppet controller (enables testing/mocking) */
export interface IInochi2DController {
  /** Load an INP puppet file */
  load(data: ArrayBuffer): Promise<PuppetSnapshot>;

  /** Set a parameter value (triggers deformation) */
  setParameter(name: string, value: number): Promise<void>;

  /** Get all parameter definitions */
  getParameters(): Promise<ParameterInfo[]>;

  /** Advance physics and get deformed mesh data */
  tick(deltaMs?: number): Promise<DeformedMesh[]>;

  /** Get current deformed meshes without advancing physics */
  getMeshes(): Promise<DeformedMesh[]>;

  /** Get the last loaded snapshot */
  getSnapshot(): PuppetSnapshot | null;

  /** Whether a puppet is currently loaded */
  isLoaded(): boolean;
}

/** Concrete implementation using EngineClient HTTP dispatch */
export class Inochi2DController implements IInochi2DController {
  private snapshot: PuppetSnapshot | null = null;

  constructor(private readonly engine: EngineClient) {}

  async load(data: ArrayBuffer): Promise<PuppetSnapshot> {
    const raw = await this.engine.loadPuppet(data);
    this.snapshot = raw as unknown as PuppetSnapshot;
    return this.snapshot;
  }

  async setParameter(name: string, value: number): Promise<void> {
    await this.engine.setPuppetParameter(name, value);
  }

  async getParameters(): Promise<ParameterInfo[]> {
    const raw = await this.engine.getPuppetParameters();
    return raw as unknown as ParameterInfo[];
  }

  async tick(deltaMs?: number): Promise<DeformedMesh[]> {
    const raw = await this.engine.tickPuppet(deltaMs);
    const delta = raw as unknown as PuppetDelta;
    return delta.deformed_meshes;
  }

  async getMeshes(): Promise<DeformedMesh[]> {
    const raw = await this.engine.getPuppetMeshes();
    return raw as unknown as DeformedMesh[];
  }

  getSnapshot(): PuppetSnapshot | null {
    return this.snapshot;
  }

  isLoaded(): boolean {
    return this.snapshot !== null;
  }
}
