import * as vscode from 'vscode';
import { NEKO_EXTENSION_IDS, type NekoAssetsAPI } from '@neko/shared';

export async function getNekoAssetsApi(): Promise<NekoAssetsAPI> {
  const extension = vscode.extensions.getExtension<NekoAssetsAPI>(NEKO_EXTENSION_IDS.NEKO_ASSETS);
  if (!extension) {
    throw new Error('Neko Assets extension API is unavailable.');
  }
  if (!extension.isActive) {
    await extension.activate();
  }
  if (!extension.exports || typeof extension.exports.getAllEntities !== 'function') {
    throw new Error('Neko Assets extension API does not expose getAllEntities().');
  }
  return extension.exports;
}
