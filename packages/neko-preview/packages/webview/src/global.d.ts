// Global type augmentations for VSCode webview runtime
interface Window {
  /** VSCode Webview API - injected by the VSCode runtime */
  acquireVsCodeApi?: () => {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
  };
}
