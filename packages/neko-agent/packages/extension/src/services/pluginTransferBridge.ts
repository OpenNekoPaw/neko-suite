import * as vscode from 'vscode';
import {
  buildRuntimePluginTransferPlan,
  buildRuntimePluginsAvailableMessage,
  expandRuntimePluginTransferInputs,
} from '@neko/agent/runtime';
import type { PluginTransferPayload } from '@neko-agent/types';
import { getLogger, handleError } from '../base';

const logger = getLogger('PluginTransferBridge');

/**
 * Dispatch a generated asset to another neko-suite plugin.
 *
 * This is an Extension-host bridge because it calls VSCode commands exposed by
 * sibling extensions. The webview and agent only deal with target identifiers
 * and asset paths.
 */
export async function sendGeneratedAssetToPlugin(
  target: string,
  assetPath?: string,
  mediaType?: string,
  payload?: PluginTransferPayload,
): Promise<void> {
  try {
    const inputs = expandRuntimePluginTransferInputs({ target, assetPath, mediaType, payload });

    for (const input of inputs) {
      const plan = buildRuntimePluginTransferPlan(input);

      if (plan.status === 'execute-command') {
        await vscode.commands.executeCommand(plan.command, plan.payload);
        continue;
      }

      if (plan.status === 'reveal-file') {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(plan.filePath));
        continue;
      }

      logger.warn(`Unknown sendToPlugin target: ${plan.target}`);
    }
  } catch (err) {
    logger.error(`Failed to send to ${target}:`, err);
    void handleError(
      err instanceof Error
        ? err
        : new Error(`Failed to send to ${target}. Is the extension installed?`),
      { showToUser: true, severity: 'warning' },
    );
  }
}

export function postPluginsAvailable(webview: vscode.Webview): void {
  webview.postMessage(
    buildRuntimePluginsAvailableMessage({
      hasExtension: (extensionId) => !!vscode.extensions.getExtension(extensionId),
    }),
  );
}
