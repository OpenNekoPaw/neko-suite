import * as vscode from 'vscode';
import type { IInstallTarget } from '@neko/shared';

export const NEKO_MARKET_EXTENSION_ID = 'neko.neko-market';

export interface NekoMarketAPI {
  registerInstallTarget(target: IInstallTarget, kind?: string): vscode.Disposable;
}
