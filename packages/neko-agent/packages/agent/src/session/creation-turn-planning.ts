import type { Skill } from '@neko/shared';
import type { StageTaskShape } from '@neko-agent/types';
import type { StageEntrySignal } from '../skill/activation/stage-planner';
import type { ExecutionMode } from './types';
import type { TaskShapeSignals } from '../executor/react-loop-runner';

export interface CreationTurnMetadata {
  entrySignal?: StageEntrySignal;
  taskShape?: StageTaskShape;
  creationKind?: string;
}

export interface CreationTurnPlanningContext {
  input: string;
  executionMode: ExecutionMode;
  activeSkill?: Skill;
  metadata?: Record<string, unknown>;
}

const CREATION_ARTIFACT_REF_RE = /@(?:draft|plan|task)-[a-z0-9._-]+/i;
const MULTI_STEP_HINT_RE =
  /\b(?:and then|then|after that|next|finally|for each|batch|series|multiple|several|all of)\b|(?:然后|接着|再|最后|依次|批量|多个|一系列)/i;
const READ_ONLY_RE =
  /\b(?:read|review|analyze|analyse|inspect|explain|summarize|summarise|check|list|show|find|search|compare)\b|(?:读取|查看|分析|解释|总结|检查|列出|展示|搜索|比较)/i;
const THINK_ONLY_RE =
  /\b(?:brainstorm|ideate|think|concept|strategy|plan out|outline|recommend|suggest)\b|(?:头脑风暴|构思|想法|策略|建议|思路|方案)/i;
const VAGUE_CREATIVE_RE =
  /\b(?:create|make|design|generate|craft|build|edit|produce)\b.*\b(?:video|image|cover|poster|storyboard|campaign|script|music)\b|(?:做|制作|设计|生成|创作|剪|剪辑).*(?:视频|图片|封面|海报|分镜|脚本|音乐)/i;
const SPECIFIC_DELIVERY_RE =
  /\b\d+\b|(?:1080p|4k|16:9|9:16|mp4|png|jpg|timeline|shot|scene|track)|(?:秒|镜头|场景|轨道|导出|时间线)/i;
const HIGH_RISK_RE =
  /\b(?:delete|remove|drop|destroy|purge|wipe|reset|overwrite|truncate)\b|(?:删除|移除|清空|销毁|重置|覆盖)/i;

function extractCreationTurnMetadata(
  metadata: Record<string, unknown> | undefined,
): CreationTurnMetadata | undefined {
  if (!metadata) return undefined;
  const raw = metadata['agentCreation'];
  if (!raw || typeof raw !== 'object') return undefined;
  const creation = raw as Record<string, unknown>;
  const next: CreationTurnMetadata = {};

  if (isStageEntrySignal(creation['entrySignal'])) {
    next.entrySignal = creation['entrySignal'];
  }
  if (isStageTaskShape(creation['taskShape'])) {
    next.taskShape = creation['taskShape'];
  }
  if (typeof creation['creationKind'] === 'string' && creation['creationKind'].trim().length > 0) {
    next.creationKind = creation['creationKind'].trim();
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

export function classifyCreationTaskShape(
  signals: TaskShapeSignals,
  context: CreationTurnPlanningContext | null,
): StageTaskShape {
  if (signals.lastHadError) return 'retry';
  if (!context) {
    return signals.round === 0
      ? 'multi-step'
      : signals.lastHadToolCalls
        ? 'multi-step'
        : 'pure-think';
  }

  const metadata = extractCreationTurnMetadata(context.metadata);
  if (metadata?.taskShape) return metadata.taskShape;

  if (signals.round > 0) {
    return signals.lastHadToolCalls ? 'multi-step' : 'pure-think';
  }

  const input = context.input.trim();
  if (input.length === 0) return 'clarification';

  if (looksLikeClarification(input)) return 'clarification';
  if (looksLikeThinkOnly(input)) return 'pure-think';
  if (looksLikeMultiStep(input)) return 'multi-step';
  if (READ_ONLY_RE.test(input)) return 'single-read';
  return 'single-write';
}

export function classifyCreationEntrySignal(
  signals: TaskShapeSignals & { taskShape: StageTaskShape },
  context: CreationTurnPlanningContext | null,
): StageEntrySignal {
  if (!context) {
    return signals.round > 0
      ? 'atomic-instruction'
      : inferDefaultEntrySignal(signals.taskShape, '');
  }

  const metadata = extractCreationTurnMetadata(context.metadata);
  if (metadata?.entrySignal) return metadata.entrySignal;

  if (signals.round > 0) return 'atomic-instruction';

  const input = context.input.trim();
  if (CREATION_ARTIFACT_REF_RE.test(input)) return 'referenced-artifact';
  if (HIGH_RISK_RE.test(input)) return 'high-risk-forced';
  if (looksLikeVagueCreative(input)) return 'vague-creative';
  return inferDefaultEntrySignal(signals.taskShape, input);
}

export function resolveCreationKind(context: CreationTurnPlanningContext | null): string {
  if (!context) return 'agent-turn';

  const metadata = extractCreationTurnMetadata(context.metadata);
  if (metadata?.creationKind) return metadata.creationKind;
  if (context.executionMode === 'plan') return 'plan-mode';
  if (CREATION_ARTIFACT_REF_RE.test(context.input)) return 'artifact-resume';
  return 'agent-turn';
}

function inferDefaultEntrySignal(taskShape: StageTaskShape, input: string): StageEntrySignal {
  switch (taskShape) {
    case 'single-read':
    case 'single-write':
    case 'clarification':
      return 'atomic-instruction';
    case 'multi-step':
      return looksLikeVagueCreative(input) ? 'vague-creative' : 'multi-step';
    case 'pure-think':
    case 'plan-only':
    case 'retry':
      return 'vague-creative';
  }
}

function looksLikeClarification(input: string): boolean {
  if (input.endsWith('?') || input.endsWith('？')) return true;
  return /^(?:what|why|how|which|can you|could you|would you|是否|怎么|如何|为什么|能否|可以|请解释)/i.test(
    input,
  );
}

function looksLikeThinkOnly(input: string): boolean {
  return THINK_ONLY_RE.test(input) && !SPECIFIC_DELIVERY_RE.test(input);
}

function looksLikeMultiStep(input: string): boolean {
  return MULTI_STEP_HINT_RE.test(input);
}

function looksLikeVagueCreative(input: string): boolean {
  return VAGUE_CREATIVE_RE.test(input) && !SPECIFIC_DELIVERY_RE.test(input);
}

function isStageEntrySignal(value: unknown): value is StageEntrySignal {
  return (
    value === 'atomic-instruction' ||
    value === 'multi-step' ||
    value === 'vague-creative' ||
    value === 'referenced-artifact' ||
    value === 'prompt-chain-skill' ||
    value === 'high-risk-forced'
  );
}

function isStageTaskShape(value: unknown): value is StageTaskShape {
  return (
    value === 'single-read' ||
    value === 'single-write' ||
    value === 'multi-step' ||
    value === 'pure-think' ||
    value === 'retry' ||
    value === 'plan-only' ||
    value === 'clarification'
  );
}
