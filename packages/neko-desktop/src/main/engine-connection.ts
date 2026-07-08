import { EngineClient } from '@neko/neko-client/EngineClient';
import type {
  EngineViewportSummary,
  ViewportIntent,
  ViewportIntentAck,
} from '../shared/contracts';
import { createDesktopEngineViewportSessionContract } from '../shared/engine-viewport-session';

export const DEFAULT_ENGINE_PORT = 8765;

export type EngineEnvironment = Readonly<Record<string, string | undefined>>;

export interface EngineHealthClient {
  health(): Promise<boolean>;
}

export interface EngineConnectionStatus {
  readonly port: number;
  readonly reachable: boolean;
  readonly diagnostic: string;
}

export interface EngineProbeOptions {
  readonly port?: number;
  readonly createClient?: (port: number) => EngineHealthClient;
}

export function resolveEnginePort(environment: EngineEnvironment = process.env): number {
  const configuredPort = environment.NEKO_ENGINE_PORT?.trim();
  if (!configuredPort) {
    return DEFAULT_ENGINE_PORT;
  }

  const port = Number(configuredPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid NEKO_ENGINE_PORT: ${configuredPort}`);
  }
  return port;
}

export async function probeEngineConnection(
  options: EngineProbeOptions = {},
): Promise<EngineConnectionStatus> {
  const port = options.port ?? resolveEnginePort();
  const createClient = options.createClient ?? createDefaultEngineHealthClient;

  try {
    const reachable = await createClient(port).health();
    return reachable
      ? {
          port,
          reachable: true,
          diagnostic: `neko-engine health check passed at http://127.0.0.1:${port}/health.`,
        }
      : {
          port,
          reachable: false,
          diagnostic: `neko-engine is not reachable at http://127.0.0.1:${port}/health. Start neko-engine with: neko-engine serve -p ${port}.`,
        };
  } catch (error: unknown) {
    return {
      port,
      reachable: false,
      diagnostic: `neko-engine health check failed at http://127.0.0.1:${port}/health: ${describeUnknownError(error)}. Start neko-engine with: neko-engine serve -p ${port}.`,
    };
  }
}

export function createEngineViewportSummary(
  status: EngineConnectionStatus,
): EngineViewportSummary {
  const availability = status.reachable ? 'ready' : 'unavailable';
  const session = createDesktopEngineViewportSessionContract({
    availability,
    diagnostic: status.diagnostic,
  });
  return {
    id: session.id,
    owner: 'neko-engine',
    availability,
    label: session.label,
    diagnostic: status.diagnostic,
    session,
    capabilities: session.capabilities,
    nonAuthoritativeWebSurfaces: session.nonAuthoritativeProjections.map(
      (projection) => projection.id,
    ),
  };
}

export function createViewportIntentAck(
  intent: ViewportIntent,
  viewport: EngineViewportSummary,
): ViewportIntentAck {
  if (viewport.availability !== 'ready') {
    return {
      accepted: false,
      viewportId: intent.viewportId,
      action: intent.action,
      reason: 'engine-unavailable',
      diagnostic: viewport.diagnostic,
    };
  }

  return {
    accepted: false,
    viewportId: intent.viewportId,
    action: intent.action,
    reason: 'viewport-intent-unimplemented',
    diagnostic:
      'neko-engine is reachable, but desktop native viewport command routing is not implemented yet.',
  };
}

function createDefaultEngineHealthClient(port: number): EngineHealthClient {
  return new EngineClient(port);
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
