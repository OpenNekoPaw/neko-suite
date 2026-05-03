/**
 * VSCode globalState adapter for agent-owned enabled-state runtime.
 */

import type * as vscode from 'vscode';
import type { EnabledStateRecord } from '@neko-agent/types';
import type { EnabledStateRuntimeStorage } from '@neko/agent/runtime';

export function createVSCodeEnabledStateStorage(
  context?: vscode.ExtensionContext,
): EnabledStateRuntimeStorage | undefined {
  if (!context) {
    return undefined;
  }

  return {
    load: (storageKey) => context.globalState.get<EnabledStateRecord>(storageKey),
    save: (storageKey, state) => context.globalState.update(storageKey, state),
  };
}
