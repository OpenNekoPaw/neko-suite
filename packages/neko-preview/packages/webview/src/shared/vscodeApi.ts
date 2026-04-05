/**
 * Shared VSCode webview API singleton.
 *
 * acquireVsCodeApi() can only be called once per webview, so all
 * consumers must share the same instance.
 */

import { getLogger } from '../utils/logger';

const logger = getLogger('vscodeApi');

export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): Record<string, unknown> | null;
  setState(state: unknown): void;
}

let vscodeApi: VsCodeApi | null = null;

export function getVscodeApi(): VsCodeApi {
  if (!vscodeApi) {
    vscodeApi = (window.acquireVsCodeApi?.() as VsCodeApi | undefined) ?? null;
    if (!vscodeApi) {
      // Fallback for dev mode (outside VSCode)
      logger.warn('acquireVsCodeApi not available, using mock');
      vscodeApi = {
        postMessage: (msg) => logger.info(`[mock postMessage] ${JSON.stringify(msg)}`),
        getState: () => null,
        setState: () => {},
      };
    }
  }
  return vscodeApi;
}
