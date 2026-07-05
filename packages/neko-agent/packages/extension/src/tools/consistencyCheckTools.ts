import * as vscode from 'vscode';
import {
  createConsistencyCheckTools as createSkillsConsistencyCheckTools,
  type ConsistencyCheckToolsDeps as SkillsConsistencyCheckToolsDeps,
  type ConsistencyChatModelRef,
  type ConsistencyFrameExtractor,
  type ConsistencyLLMService,
  type IClipScorer,
} from '@neko/skills';
import type { Tool } from './types';
import { getLogger } from '../base';

const logger = getLogger('ConsistencyCheckTools');

export type IFrameExtractor = ConsistencyFrameExtractor;

export interface ConsistencyCheckToolsDeps {
  createService: () => ConsistencyLLMService;
  chatModel?: ConsistencyChatModelRef;
  clipScorer?: IClipScorer;
  frameExtractor?: ConsistencyFrameExtractor;
}

export function createConsistencyCheckTools(deps: ConsistencyCheckToolsDeps): Tool[] {
  const skillsDeps: SkillsConsistencyCheckToolsDeps = {
    createService: deps.createService,
    locale: vscode.env.language,
    logger,
    ...(deps.chatModel ? { chatModel: deps.chatModel } : {}),
    ...(deps.clipScorer ? { clipScorer: deps.clipScorer } : {}),
    ...(deps.frameExtractor ? { frameExtractor: deps.frameExtractor } : {}),
  };

  return createSkillsConsistencyCheckTools(skillsDeps);
}
