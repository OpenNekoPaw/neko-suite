import type { EngineClient, SilenceAnalysis } from '@neko/neko-client';
import type { EngineDiffResult } from '@neko/shared';

export interface IEngineMediaService {
  ensureClient(): Promise<EngineClient | null>;
  diff(
    group: string,
    sourceA: string,
    sourceB: string,
    options?: Record<string, unknown>,
  ): Promise<EngineDiffResult | null>;
  detectSilence(
    source: string,
    thresholdDbfs?: number,
    minDuration?: number,
  ): Promise<SilenceAnalysis | null>;
  probe(group: 'videos' | 'audios', source: string): Promise<unknown | null>;
}
