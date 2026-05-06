import type * as vscode from 'vscode';
import type { IInstallTarget } from '@neko/shared';

export interface NekoMarketAPI {
  registerInstallTarget(target: IInstallTarget, kind?: string): vscode.Disposable;
}

export const NEKO_MARKET_EXTENSION_ID = 'neko.neko-market';
