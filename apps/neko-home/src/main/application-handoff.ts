import type { NekoApplicationHandoffPort } from '@neko/host/application';

export interface HomeExternalOpenPort {
  openExternal(uri: string): Promise<void>;
}

export function createHomeApplicationHandoffPort(
  external: HomeExternalOpenPort,
): NekoApplicationHandoffPort {
  return {
    async handoff(request) {
      if (request.target.toolId !== 'neko-vscode') {
        throw new Error(`Home professional tool is not registered: ${request.target.toolId}`);
      }
      const payload = encodeURIComponent(JSON.stringify(request.target));
      await external.openExternal(`vscode://neko.neko-suite/open?handoff=${payload}`);
      return { accepted: true, requestId: request.requestId };
    },
  };
}
