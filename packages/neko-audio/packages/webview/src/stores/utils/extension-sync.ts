/**
 * Extension Sync — send EditOperation to Extension Host
 */

import { postMessage } from '../../shared/useVscodeMessage';
import type { EditOperation } from '@neko/shared';

export function syncOperationToExtension(op: EditOperation): void {
  postMessage({ type: 'operationApplied', operation: op });
}
