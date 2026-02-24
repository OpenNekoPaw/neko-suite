/**
 * Extension Sync — send EditOperation to Extension Host
 *
 * Called from operationHistorySlice after state changes
 * (pushOperation, opUndo, opRedo) to keep Extension model in sync.
 */

import { postMessage } from '@neko/shared/vscode';
import type { EditOperation } from '@neko/shared';

export function syncOperationToExtension(op: EditOperation): void {
  postMessage({ type: 'operationApplied', operation: op });
}
