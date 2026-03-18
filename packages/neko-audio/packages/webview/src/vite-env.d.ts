/// <reference types="vite/client" />

interface Window {
  acquireVsCodeApi?: () => {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
  };
}
