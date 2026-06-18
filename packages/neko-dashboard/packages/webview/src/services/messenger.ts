import { postMessage as postRawMessage } from '@neko/shared/vscode';
import type { WebviewToExtensionMessage } from '../types';

export function postMessage(message: WebviewToExtensionMessage): void {
  postRawMessage(message);
}
