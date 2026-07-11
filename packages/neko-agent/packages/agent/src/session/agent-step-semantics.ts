import type { AgentStep } from '@neko/shared';

export type AgentStepSemanticClass = 'transport-fragment' | 'semantic-step';

export interface AgentStepSemanticClassification {
  readonly class: AgentStepSemanticClass;
  readonly projectsWorkingMemory: boolean;
}

/**
 * Classifies executor output by Agent semantics rather than delivery frequency.
 * Provider text fragments are display transport only; all other executor steps
 * represent a semantic boundary even when a particular step produces no
 * persisted working-memory entry.
 */
export function classifyAgentStepSemantics(step: AgentStep): AgentStepSemanticClassification {
  const stepType = step.type;
  switch (stepType) {
    case 'content_delta':
      return { class: 'transport-fragment', projectsWorkingMemory: false };
    case 'think':
      return {
        class: 'semantic-step',
        projectsWorkingMemory: Boolean(step.content || step.thinking || step.toolCalls?.length),
      };
    case 'act':
      return {
        class: 'semantic-step',
        projectsWorkingMemory: Boolean(step.toolResults?.length),
      };
    case 'respond':
      return { class: 'semantic-step', projectsWorkingMemory: Boolean(step.content) };
    case 'observe':
      return { class: 'semantic-step', projectsWorkingMemory: false };
    default:
      return assertNeverAgentStepType(stepType);
  }
}

function assertNeverAgentStepType(stepType: never): never {
  throw new Error(`Unhandled AgentStep type: ${String(stepType)}`);
}
