import type {
  AgentHostRuntimeAdapter,
  AgentHostRuntimeSubscription,
} from '@neko-agent/types/agent-host-runtime-adapter';
import type {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from '@neko-agent/types';
import {
  HOME_AGENT_RUNTIME_IDS,
  type HomeAgentRuntimeId,
  type NekoHomeBridge,
} from '../shared/contracts';
import { getHomeBridge } from './home-bridge';

export interface ElectronAgentHostRuntimeAdapterOptions {
  readonly runtimeId?: HomeAgentRuntimeId;
  readonly bridge?: NekoHomeBridge;
}

export function createElectronAgentHostRuntimeAdapter(
  options: ElectronAgentHostRuntimeAdapterOptions = {},
): AgentHostRuntimeAdapter {
  const runtimeId = options.runtimeId ?? HOME_AGENT_RUNTIME_IDS.agentWebview;
  const bridge = options.bridge ?? getHomeBridge();
  const listeners = new Set<(message: ExtensionToWebviewMessage) => void>();
  let runtimeState: unknown;

  function emit(message: ExtensionToWebviewMessage): void {
    for (const listener of listeners) {
      listener(message);
    }
  }

  return {
    hostKind: 'electron',
    runtimeId,
    send(message: WebviewToExtensionMessage): void {
      void bridge
        .sendAgentRuntimeMessage({ runtimeId, message })
        .then((result) => {
          if (result.runtimeId && result.runtimeId !== runtimeId) {
            emit({
              type: 'globalError',
              message: `Home Agent runtime received a response for '${result.runtimeId}' while '${runtimeId}' was active.`,
            });
            return;
          }
          for (const hostMessage of result.messages) {
            emit(hostMessage);
          }
        })
        .catch((error: unknown) => {
          emit({
            type: 'globalError',
            message: `Home Agent runtime bridge failed: ${describeUnknownError(error)}`,
          });
        });
    },
    subscribe(
      listener: (message: ExtensionToWebviewMessage) => void,
    ): AgentHostRuntimeSubscription {
      listeners.add(listener);
      return {
        dispose(): void {
          listeners.delete(listener);
        },
      };
    },
    getState<T>(): T | undefined {
      return runtimeState as T | undefined;
    },
    setState<T>(state: T): void {
      runtimeState = state;
    },
  };
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
