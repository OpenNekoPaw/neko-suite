import * as vscode from 'vscode';
import {
  createQualityCheckTools as createAgentQualityCheckTools,
  type IAudioAnalyzer,
  type IFrameExtractor,
  type MediaQualityChatModelRef,
  type MediaQualityGenerator,
  type MediaQualityLLMService,
  type QualityCheckToolsDeps as AgentQualityCheckToolsDeps,
} from '@neko/agent/validation';
import type { Tool } from './types';
import { getLogger } from '../base';

const logger = getLogger('QualityCheckTools');

export type { IAudioAnalyzer, IFrameExtractor };

export interface QualityCheckToolsDeps {
  createService: () => MediaQualityLLMService;
  mediaGenerator: MediaQualityGenerator;
  chatModel?: MediaQualityChatModelRef;
  audioAnalyzer?: IAudioAnalyzer;
  frameExtractor?: IFrameExtractor;
}

export function createQualityCheckTools(deps: QualityCheckToolsDeps): Tool[] {
  const agentDeps: AgentQualityCheckToolsDeps = {
    createService: deps.createService,
    mediaGenerator: deps.mediaGenerator,
    readFileAsBase64,
    logger,
    ...(deps.chatModel ? { chatModel: deps.chatModel } : {}),
    ...(deps.audioAnalyzer ? { audioAnalyzer: deps.audioAnalyzer } : {}),
    ...(deps.frameExtractor ? { frameExtractor: deps.frameExtractor } : {}),
  };

  return createAgentQualityCheckTools(agentDeps);
}

async function readFileAsBase64(filePath: string): Promise<string> {
  const uri = vscode.Uri.file(filePath);
  const content = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(content).toString('base64');
}
