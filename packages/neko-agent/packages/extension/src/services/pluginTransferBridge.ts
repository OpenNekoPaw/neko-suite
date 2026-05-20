import * as vscode from 'vscode';
import {
  buildRuntimePluginTransferPlan,
  buildRuntimePluginsAvailableMessage,
  expandRuntimePluginTransferInputs,
} from '@neko/agent/runtime';
import type { PluginTransferPayload } from '@neko-agent/types';
import { getLogger, handleError } from '../base';

const logger = getLogger('PluginTransferBridge');

export interface PluginTransferBridgeResult {
  readonly success: boolean;
  readonly executed: number;
  readonly results: unknown[];
  readonly unsupported: Array<{ target: string; reason?: string }>;
  readonly error?: string;
}

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
): Promise<PluginTransferBridgeResult> {
  const results: unknown[] = [];
  const unsupported: PluginTransferBridgeResult['unsupported'] = [];
  try {
    const inputs = expandRuntimePluginTransferInputs({ target, assetPath, mediaType, payload });

    for (const input of inputs) {
      const plan = buildRuntimePluginTransferPlan(input);

      if (plan.status === 'execute-command') {
        results.push(await vscode.commands.executeCommand(plan.command, plan.payload));
        continue;
      }

      if (plan.status === 'reveal-file') {
        results.push(
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(plan.filePath)),
        );
        continue;
      }

      unsupported.push({ target: plan.target, reason: plan.reason });
      logger.warn(`Unsupported sendToPlugin target: ${plan.target}`, { reason: plan.reason });
    }
    return {
      success: unsupported.length === 0,
      executed: results.length,
      results,
      unsupported,
    };
  } catch (err) {
    logger.error(`Failed to send to ${target}:`, err);
    void handleError(
      err instanceof Error
        ? err
        : new Error(`Failed to send to ${target}. Is the extension installed?`),
      { showToUser: true, severity: 'warning' },
    );
    return {
      success: false,
      executed: results.length,
      results,
      unsupported,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function postPluginsAvailable(webview: vscode.Webview): void {
  webview.postMessage(
    buildRuntimePluginsAvailableMessage({
      hasExtension: (extensionId) => !!vscode.extensions.getExtension(extensionId),
    }),
  );
}
