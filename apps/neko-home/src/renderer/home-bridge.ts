import type { NekoHomeBridge } from '../shared/contracts';

declare global {
  interface Window {
    readonly nekoHome?: NekoHomeBridge;
  }
}

export function getHomeBridge(): NekoHomeBridge {
  const bridge = window.nekoHome;
  if (!bridge) throw new Error('Neko Home bridge is unavailable.');
  return bridge;
}
