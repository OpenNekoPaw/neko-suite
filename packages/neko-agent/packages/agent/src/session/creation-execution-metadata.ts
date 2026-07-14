import type { Skill } from '@neko/shared';
import { createSkillCreationKind } from './creation-kind';

export interface SkillExecutionAgentCreationMetadata {
  readonly creationId: string;
  readonly iterationId: string;
  readonly promptChainId: string;
  readonly checkpointId?: string;
}

/**
 * Explicit slash Skill execution always enters Agent-native creation as prompt-chain guidance.
 * Skill schema fields do not control creation routing; non-slash activation paths
 * should inject metadata explicitly when they need the same entry signal.
 */
export function createSkillExecutionCreationMetadata(
  skill: Skill | undefined,
  creation?: SkillExecutionAgentCreationMetadata,
): Record<string, unknown> | undefined {
  if (!skill) {
    return undefined;
  }

  const creationKind = createSkillCreationKind(skill.name);
  return {
    agentCreation: {
      ...(creation
        ? {
            creationId: creation.creationId,
            iterationId: creation.iterationId,
            promptChainId: creation.promptChainId,
            skillName: skill.name,
            ...(creation.checkpointId ? { checkpointId: creation.checkpointId } : {}),
          }
        : {}),
      entrySignal: 'prompt-chain-skill',
      taskShape: 'multi-step',
      creationKind,
    },
  };
}

export function mergeCreationExecutionMetadata(
  base?: Record<string, unknown>,
  overrides?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!base && !overrides) return undefined;

  const merged: Record<string, unknown> = {
    ...(base ?? {}),
    ...(overrides ?? {}),
  };

  const baseCreation = asRecord(base?.['agentCreation']);
  const overrideCreation = asRecord(overrides?.['agentCreation']);
  if (baseCreation || overrideCreation) {
    merged['agentCreation'] = {
      ...(baseCreation ?? {}),
      ...(overrideCreation ?? {}),
    };
  }

  return merged;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
