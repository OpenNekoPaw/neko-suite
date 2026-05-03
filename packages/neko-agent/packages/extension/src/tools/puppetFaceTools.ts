/**
 * Puppet Face Tools - VSCode bridge for AI-assisted puppet face parameters.
 *
 * Business rules live in @neko/agent's PuppetFaceRuntime. This file only wires
 * VSCode command invocation, image file access, and NekoPuppetAPI application.
 */

import * as vscode from 'vscode';
import { promises as fsp } from 'node:fs';
import type { NekoPuppetAPI } from '@neko/shared';
import {
  createPuppetFaceTools as createAgentPuppetFaceTools,
  detectPuppetFaceImageMimeType,
  type PuppetFaceImageInput,
} from '@neko/agent/tools';
import { NEKO_AGENT_LLM_GENERATE_COMMAND, NEKO_PUPPET_EXTENSION_ID } from '@neko-agent/types';
import { getLogger } from '../base';
import type { Tool } from './types';

const logger = getLogger('PuppetFaceTools');

export function createPuppetFaceTools(): Tool[] {
  const ext = vscode.extensions.getExtension<NekoPuppetAPI>(NEKO_PUPPET_EXTENSION_ID);

  if (!ext) {
    logger.info('NekoPuppet extension not found, skipping puppet face tools');
    return [];
  }

  const getAPI = async (): Promise<NekoPuppetAPI> => {
    if (ext.isActive) {
      return ext.exports;
    }
    return ext.activate() as Promise<NekoPuppetAPI>;
  };

  return createAgentPuppetFaceTools({
    generateWithLLM: async (systemPrompt, userPrompt) => {
      const result = await vscode.commands.executeCommand<string>(
        NEKO_AGENT_LLM_GENERATE_COMMAND,
        systemPrompt,
        userPrompt,
      );
      if (typeof result !== 'string' || result.length === 0) {
        throw new Error('LLM returned empty response');
      }
      return result;
    },
    readImagePayload,
    getCurrentFaceParams: async () => (await getAPI()).getCurrentFaceParams(),
    applyFaceParams: async (params) => {
      await (await getAPI()).setFaceParams(params);
    },
    logger,
  });
}

async function readImagePayload(imagePath: string): Promise<PuppetFaceImageInput> {
  try {
    await fsp.access(imagePath);
    const imageBuffer = await fsp.readFile(imagePath);
    return {
      imageBase64: imageBuffer.toString('base64'),
      mimeType: detectPuppetFaceImageMimeType(imagePath),
    };
  } catch (error) {
    throw new Error(`Failed to read image "${imagePath}": ${String(error)}`);
  }
}
