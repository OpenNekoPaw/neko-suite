import type { NekoDesktopBridge } from '../shared/contracts';

declare global {
  interface Window {
    readonly nekoDesktop?: NekoDesktopBridge;
  }
}

export function getDesktopBridge(): NekoDesktopBridge {
  const bridge = window.nekoDesktop;
  if (!bridge) {
    throw new Error('Neko Desktop bridge is unavailable.');
  }
  return bridge;
}
