import * as vscode from 'vscode';
import { AccountAiCatalogClient, NekoAuthService } from '@neko/auth-core';
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
    aiCatalogUrl: cfg.get<string>('aiCatalogUrl', ''),
    scopes: cfg.get<string[]>('scopes', ['openid', 'profile', 'email']),
    redirectPort: cfg.get<number>('redirectPort', 6419),
  };

  // Fallback: read from config.json and let explicit VSCode settings override
  // individual fields. This keeps account catalog URL independent from OAuth
  // endpoint placement without exposing tokens outside the auth boundary.
  const workDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const jsonConfig = loadAuthConfigFromJson(workDir);
  const mergedConfig: AuthConfig = {
    clientId: vscodeConfig.clientId || jsonConfig.clientId,
    authUrl: vscodeConfig.authUrl || jsonConfig.authUrl,
    tokenUrl: vscodeConfig.tokenUrl || jsonConfig.tokenUrl,
    aiCatalogUrl: vscodeConfig.aiCatalogUrl || jsonConfig.aiCatalogUrl,
    scopes: vscodeConfig.scopes.length > 0 ? vscodeConfig.scopes : jsonConfig.scopes,
    redirectPort: vscodeConfig.redirectPort ?? jsonConfig.redirectPort,
  };

  if (isAuthConfigured(mergedConfig)) {
    return mergedConfig;
  }

  // Neither configured — return VSCode config (empty, will trigger AuthNotConfiguredError)
  return mergedConfig;
}

export async function activate(context: vscode.ExtensionContext): Promise<NekoAuthAPI> {
  const storage = new VscodeTokenStorage(context.secrets);
  const config = loadAuthConfig();

  const service = new NekoAuthService(storage, config, (url) =>
    vscode.env.openExternal(vscode.Uri.parse(url)),
  );

  const accountAiCatalog = new AccountAiCatalogClient({ catalogUrl: config.aiCatalogUrl });
  const api = new NekoAuthAPIImpl(service, context, accountAiCatalog);
  return api;
}

export function deactivate(): void {
  // Cleanup handled via context.subscriptions (NekoAuthAPIImpl is registered there)
}
