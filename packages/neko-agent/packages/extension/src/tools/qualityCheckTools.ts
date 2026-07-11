import * as vscode from 'vscode';
import {
  createLegacyQualityCheckTools as createSkillsQualityCheckTools,
  type IAudioAnalyzer,
  type IFrameExtractor,
  type MediaQualityChatModelRef,
  type LegacyMediaQualityGenerator,
  type MediaQualityLLMService,
  type LegacyQualityCheckToolsDeps as SkillsQualityCheckToolsDeps,
} from '@neko/skills';
import type { Tool } from './types';
import { getLogger } from '../base';

const logger = getLogger('QualityCheckTools');

export type { IAudioAnalyzer, IFrameExtractor };

export interface QualityCheckToolsDeps {
  createService: () => MediaQualityLLMService;
  mediaGenerator: LegacyMediaQualityGenerator;
  chatModel?: MediaQualityChatModelRef;
  audioAnalyzer?: IAudioAnalyzer;
  frameExtractor?: IFrameExtractor;
}

export function createLegacyQualityCheckTools(deps: QualityCheckToolsDeps): Tool[] {
  const skillsDeps: SkillsQualityCheckToolsDeps = {
    createService: deps.createService,
    mediaGenerator: deps.mediaGenerator,
    readFileAsBase64,
    locale: vscode.env.language,
    logger,
    ...(deps.chatModel ? { chatModel: deps.chatModel } : {}),
    ...(deps.audioAnalyzer ? { audioAnalyzer: deps.audioAnalyzer } : {}),
    ...(deps.frameExtractor ? { frameExtractor: deps.frameExtractor } : {}),
  };

  return createSkillsQualityCheckTools(skillsDeps);
}

async function readFileAsBase64(filePath: string): Promise<string> {
  const uri = vscode.Uri.file(filePath);
  const content = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(content).toString('base64');
}
