import * as vscode from 'vscode';
import { NekoAuthService } from '@neko/auth-core';
import type { AuthConfig } from '@neko/shared';
import { VscodeTokenStorage } from './vscode-token-storage';
import { NekoAuthAPIImpl } from './auth-api';
import type { NekoAuthAPI } from './auth-api';

/** Read AuthConfig from VSCode workspace settings (`neko.auth.*`). */
function loadAuthConfig(): AuthConfig {
  const cfg = vscode.workspace.getConfiguration('neko.auth');
  return {
    clientId: cfg.get<string>('clientId', ''),
    authUrl: cfg.get<string>('authUrl', ''),
    tokenUrl: cfg.get<string>('tokenUrl', ''),
    scopes: cfg.get<string[]>('scopes', ['openid', 'profile', 'email']),
    redirectPort: cfg.get<number>('redirectPort', 6419),
  };
}

export async function activate(context: vscode.ExtensionContext): Promise<NekoAuthAPI> {
  const storage = new VscodeTokenStorage(context.secrets);
  const config = loadAuthConfig();

  const service = new NekoAuthService(storage, config, (url) =>
    vscode.env.openExternal(vscode.Uri.parse(url)),
  );

  const api = new NekoAuthAPIImpl(service, context);
  return api;
}

export function deactivate(): void {
  // Cleanup handled via context.subscriptions (NekoAuthAPIImpl is registered there)
}
