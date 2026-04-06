import * as vscode from 'vscode';
import { NekoAuthService } from '@neko/auth-core';
import type { AuthConfig } from '@neko/shared';
// Node.js subpath import — resolved by esbuild at bundle time.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — root tsconfig lacks moduleResolution:bundler; esbuild resolves correctly
import {
  loadAuthConfigFromJson,
  isAuthConfigured,
} from '@neko/shared/config/auth-config-loader.ts';
import { VscodeTokenStorage } from './vscode-token-storage';
import { NekoAuthAPIImpl } from './auth-api';
import type { NekoAuthAPI } from './auth-api';

/**
 * Load AuthConfig with layered fallback:
 *   1. VSCode workspace settings (`neko.auth.*`) — highest priority
 *   2. config.json (`~/.neko/config.json` + `.neko/config.json`) — fallback
 */
function loadAuthConfig(): AuthConfig {
  const cfg = vscode.workspace.getConfiguration('neko.auth');
  const vscodeConfig: AuthConfig = {
    clientId: cfg.get<string>('clientId', ''),
    authUrl: cfg.get<string>('authUrl', ''),
    tokenUrl: cfg.get<string>('tokenUrl', ''),
    scopes: cfg.get<string[]>('scopes', ['openid', 'profile', 'email']),
    redirectPort: cfg.get<number>('redirectPort', 6419),
  };

  // If VSCode settings have auth URLs configured, use them
  if (vscodeConfig.authUrl || vscodeConfig.clientId) {
    return vscodeConfig;
  }

  // Fallback: read from config.json
  const workDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const jsonConfig = loadAuthConfigFromJson(workDir);
  if (isAuthConfigured(jsonConfig)) {
    return jsonConfig;
  }

  // Neither configured — return VSCode config (empty, will trigger AuthNotConfiguredError)
  return vscodeConfig;
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
