import * as vscode from 'vscode';
import type { AccountAiCatalogSnapshot, IAuthSession } from '@neko/shared';
import type { AccountAiCatalogClient, NekoAuthService } from '@neko/auth-core';

export type CloudProvider = 'github' | 'gitlab' | 's3';

/**
 * NekoAuthAPI — the public API exported by the neko.neko-auth extension.
 *
 * Consumers access it via:
 *   vscode.extensions.getExtension<NekoAuthAPI>('neko.neko-auth')?.exports
 */
export interface NekoAuthAPI {
  getSession(): Promise<IAuthSession | null>;
  login(options?: { force?: boolean }): Promise<IAuthSession>;
  logout(): Promise<void>;
  /** Fires whenever the session changes (login, logout, or token refresh). */
  onDidChangeSession: vscode.Event<IAuthSession | null>;
  /** Phase 2 stub — returns null until cloud token service is implemented. */
  getCloudToken(provider: CloudProvider): Promise<string | null>;
  /** Returns the secret-free Neko official account AI catalog snapshot when available. */
  getAccountAiCatalog(options?: {
    forceRefresh?: boolean;
  }): Promise<AccountAiCatalogSnapshot | null>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class NekoAuthAPIImpl implements NekoAuthAPI, vscode.Disposable {
  private readonly _onDidChangeSession = new vscode.EventEmitter<IAuthSession | null>();
  readonly onDidChangeSession = this._onDidChangeSession.event;

  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly service: NekoAuthService,
    context: vscode.ExtensionContext,
    private readonly accountAiCatalog?: AccountAiCatalogClient,
  ) {
    this.disposables.push(this._onDidChangeSession);
    context.subscriptions.push(this);

    // Broadcast session changes on silent token refresh (NKAT-001)
    this.service.onDidRefresh = (session) => {
      this._onDidChangeSession.fire(session);
    };
  }

  getSession(): Promise<IAuthSession | null> {
    return this.service.getSession();
  }

  async login(options?: { force?: boolean }): Promise<IAuthSession> {
    const session = await this.service.login(options);
    this._onDidChangeSession.fire(session);
    return session;
  }

  async logout(): Promise<void> {
    await this.service.logout();
    this._onDidChangeSession.fire(null);
  }

  /** Phase 2 stub — getCloudToken for provider-specific OAuth */
  getCloudToken(_provider: CloudProvider): Promise<string | null> {
    return Promise.resolve(null);
  }

  async getAccountAiCatalog(): Promise<AccountAiCatalogSnapshot | null> {
    if (!this.accountAiCatalog) return null;
    const session = await this.service.getSession();
    if (!session) return null;
    return this.accountAiCatalog.fetchCatalog(session);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
