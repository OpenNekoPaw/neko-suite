import * as fsp from 'node:fs/promises';
import * as vscode from 'vscode';
import type { NekoCanvasAPI } from '@neko/shared';
import {
  CanvasGenerationRuntime,
  buildCanvasMediaOutputDataUrl,
  planCanvasImageSource,
  type CanvasMediaOutput,
  type CanvasPromptMessage,
} from '@neko/agent/runtime';
import { NEKO_PLUGIN_EXTENSION_IDS } from '@neko-agent/types';
import { getRootLogger, ServiceCollection } from '../base';
import { IPlatform } from '../bootstrap';

/**
 * Resolve an image reference (data URL / file path / http URL) to a
 * `{ base64, mimeType }` pair for downstream IP-Adapter / multimodal use.
 */
async function resolveImageToBase64(
  source: string,
): Promise<{ base64: string; mimeType: string } | undefined> {
  const plan = planCanvasImageSource(source);
  if (!plan) return undefined;

  try {
    switch (plan.kind) {
      case 'data-url':
        return plan.result;
      case 'remote-url': {
        const response = await fetch(plan.url);
        if (!response.ok) return undefined;
        const buffer = await response.arrayBuffer();
        const mimeType = response.headers.get('content-type') ?? plan.fallbackMimeType;
        return { base64: Buffer.from(buffer).toString('base64'), mimeType };
      }
      case 'local-file': {
        const buffer = await fsp.readFile(plan.path);
        return { base64: buffer.toString('base64'), mimeType: plan.mimeType };
      }
      case 'base64':
        return { base64: plan.base64, mimeType: plan.mimeType };
    }
  } catch {
    return undefined;
  }
}

async function fetchOutputAsDataUrl(output: CanvasMediaOutput): Promise<string | undefined> {
  const response = await fetch(output.url);
  if (!response.ok) return undefined;

  const buffer = await response.arrayBuffer();
  return buildCanvasMediaOutputDataUrl(
    output,
    Buffer.from(buffer).toString('base64'),
    response.headers.get('content-type'),
  );
}

/**
 * Build the canvas generation runtime with VSCode/platform bridge adapters.
 *
 * Extension owns only host access here: VSCode command APIs, cross-extension
 * Canvas lookup and network/file bytes. Prompt construction,
 * reference selection and media request assembly stay inside @neko/agent.
 */
export function createCanvasGenerationRuntime(
  services: ServiceCollection,
): CanvasGenerationRuntime {
  const platform = services.get(IPlatform);
  const media = platform?.media;

  return new CanvasGenerationRuntime({
    ...(platform
      ? {
          chat: {
            chat: async (
              messages: readonly CanvasPromptMessage[],
              options?: { maxTokens?: number },
            ) => {
              const service = platform.createService();
              return service.chat(
                messages.map((message) => ({ role: message.role, content: message.content })),
                options,
              );
            },
          },
        }
      : {}),
    ...(media
      ? {
          media: {
            generateImage: (request) => media.generateImage(request),
            waitForTask: (taskId, timeoutMs) => media.waitForTask(taskId, timeoutMs),
          },
        }
      : {}),
    resolveCanvasNode: async (nodeId) => {
      const canvasExt = vscode.extensions.getExtension<NekoCanvasAPI>(
        NEKO_PLUGIN_EXTENSION_IDS.canvas,
      );
      if (!canvasExt) return undefined;
      const canvasApi = canvasExt.isActive ? canvasExt.exports : await canvasExt.activate();
      return canvasApi?.nodes?.get(nodeId);
    },
    resolveImageSource: resolveImageToBase64,
    fetchOutputAsDataUrl,
    logger: getRootLogger(),
  });
}
