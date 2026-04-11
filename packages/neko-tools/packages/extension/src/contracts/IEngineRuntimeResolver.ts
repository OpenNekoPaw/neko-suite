import type { EngineClient } from '@neko/neko-client';

export interface IEngineRuntimeResolver {
  ensureClient(): Promise<EngineClient | null>;
}
