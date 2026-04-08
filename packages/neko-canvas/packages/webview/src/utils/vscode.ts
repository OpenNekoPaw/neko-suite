import type { VSCodeAPI } from '../hooks/useVSCodeMessages';

declare global {
  interface Window {
    vscode?: VSCodeAPI;
    __vscode_api__?: VSCodeAPI;
  }
}

export function setGlobalVSCodeApi(vscode: VSCodeAPI): void {
  if (typeof window === 'undefined') return;
  window.vscode = vscode;
  window.__vscode_api__ = vscode;
}

export function getGlobalVSCodeApi(): VSCodeAPI {
  if (typeof window === 'undefined') return null;
  return window.vscode ?? window.__vscode_api__ ?? null;
}
