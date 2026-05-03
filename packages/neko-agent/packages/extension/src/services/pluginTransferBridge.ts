import * as vscode from 'vscode';
import {
  buildRuntimePluginTransferPlan,
  buildRuntimePluginsAvailableMessage,
} from '@neko/agent/runtime';
import { getLogger, handleError } from '../base';

const logger = getLogger('PluginTransferBridge');

/**
 * Dispatch a generated asset to another neko-suite plugin.
 *
 * This is an Extension-host bridge because it calls VSCode commands exposed by
 * sibling extensions. The webview and agent only deal with target identifiers
 * and asset paths.
 */
export async function sendGeneratedAssetToPlugin(target: string, assetPath: string): Promise<void> {
  try {
    const plan = buildRuntimePluginTransferPlan({ target, assetPath });

    if (plan.status === 'execute-command') {
      await vscode.commands.executeCommand(plan.command, plan.payload);
      return;
    }

    if (plan.status === 'reveal-file') {
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(plan.filePath));
      return;
    }

    logger.warn(`Unknown sendToPlugin target: ${plan.target}`);
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
