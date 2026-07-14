import { EngineClient } from '@neko/neko-client/EngineClient';
import type { HomeEngineCoreSnapshot } from '../shared/contracts';

export const DEFAULT_ENGINE_PORT = 8765;

export interface EngineHealthClient {
  health(): Promise<boolean>;
}

export function resolveEnginePort(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const configured = environment.NEKO_ENGINE_PORT?.trim();
  if (!configured) return DEFAULT_ENGINE_PORT;
  const port = Number(configured);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid NEKO_ENGINE_PORT: ${configured}`);
  }
  return port;
}

export async function probeHomeEngineCore(options: {
  readonly port?: number;
  readonly createClient?: (port: number) => EngineHealthClient;
} = {}): Promise<HomeEngineCoreSnapshot> {
  const port = options.port ?? resolveEnginePort();
  const createClient = options.createClient ?? ((selectedPort) => new EngineClient(selectedPort));
  try {
    const reachable = await createClient(port).health();
    return {
      port,
      availability: reachable ? 'ready' : 'unavailable',
      diagnostic: reachable
        ? `Neko Engine Core is ready on port ${port}.`
        : `Neko Engine Core is unavailable on port ${port}.`,
    };
  } catch (error: unknown) {
    return {
      port,
      availability: 'unavailable',
      diagnostic: `Neko Engine Core probe failed on port ${port}: ${describeError(error)}`,
    };
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
