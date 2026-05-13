import type { WebviewToExtensionMessage } from '../types';

interface VSCodeApi {
  postMessage(message: WebviewToExtensionMessage): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VSCodeApi;
  }
}

const vscodeApi = window.acquireVsCodeApi?.();

export function postMessage(message: WebviewToExtensionMessage): void {
  vscodeApi?.postMessage(message);
}
