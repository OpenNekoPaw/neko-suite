import type { Webview } from 'vscode';
import type { NekoAuthAPI } from './auth-api';

/**
 * AuthBridge — handles auth-related postMessage traffic between webviews and
 * the extension host.
 *
 * Message protocol:
 *   Webview → Extension:
 *     { type: 'auth:getStatus' }
 *     { type: 'auth:login', force?: boolean }
 *     { type: 'auth:logout' }
 *
 *   Extension → Webview:
 *     { type: 'auth:status', session: IAuthSession | null }
 *     { type: 'auth:loginResult', session: IAuthSession }
 *     { type: 'auth:logoutResult' }
 *     { type: 'auth:error', error: string }
 */
export class AuthBridge {
  constructor(
    private readonly api: NekoAuthAPI,
    private readonly webview: Webview,
  ) {}

  /** Returns true if the message was handled by this bridge. */
  async handleMessage(message: { type: string; force?: boolean }): Promise<boolean> {
    switch (message.type) {
      case 'auth:getStatus': {
        const session = await this.api.getSession();
        this.webview.postMessage({ type: 'auth:status', session });
        return true;
      }

      case 'auth:login': {
        try {
          const session = await this.api.login({ force: message.force });
          this.webview.postMessage({ type: 'auth:loginResult', session });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          this.webview.postMessage({ type: 'auth:error', error });
        }
        return true;
      }

      case 'auth:logout': {
        await this.api.logout();
        this.webview.postMessage({ type: 'auth:logoutResult' });
        return true;
      }

      default:
        return false;
    }
  }
}
