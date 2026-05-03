import {
  createConsistencyCheckTools as createAgentConsistencyCheckTools,
  type ConsistencyCheckToolsDeps as AgentConsistencyCheckToolsDeps,
  type ConsistencyFrameExtractor,
  type ConsistencyLLMService,
  type IClipScorer,
} from '@neko/agent/validation';
import type { Tool } from './types';
import { getLogger } from '../base';

const logger = getLogger('ConsistencyCheckTools');

export type IFrameExtractor = ConsistencyFrameExtractor;

export interface ConsistencyCheckToolsDeps {
  createService: () => ConsistencyLLMService;
  clipScorer?: IClipScorer;
  frameExtractor?: ConsistencyFrameExtractor;
}

export function createConsistencyCheckTools(deps: ConsistencyCheckToolsDeps): Tool[] {
  const agentDeps: AgentConsistencyCheckToolsDeps = {
    createService: deps.createService,
    logger,
    ...(deps.clipScorer ? { clipScorer: deps.clipScorer } : {}),
    ...(deps.frameExtractor ? { frameExtractor: deps.frameExtractor } : {}),
  };

  return createAgentConsistencyCheckTools(agentDeps);
}
