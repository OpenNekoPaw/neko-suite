import { describe, expect, it } from 'vitest';
import type { AgentStep } from '@neko/shared';
import { classifyAgentStepSemantics } from '../agent-step-semantics';

function step(overrides: Partial<AgentStep> & Pick<AgentStep, 'type'>): AgentStep {
  return {
    content: '',
    timestamp: 1,
    ...overrides,
  };
}

describe('classifyAgentStepSemantics', () => {
  it('classifies provider content deltas as transport-only fragments', () => {
    expect(classifyAgentStepSemantics(step({ type: 'content_delta', content: 'chunk' }))).toEqual({
      class: 'transport-fragment',
      projectsWorkingMemory: false,
    });
  });

  it.each([
    step({ type: 'think', content: 'answer' }),
    step({
      type: 'think',
      toolCalls: [{ id: 'call-1', name: 'Read', arguments: {} }],
    }),
    step({ type: 'respond', content: 'answer' }),
    step({
      type: 'act',
      toolResults: [{ callId: 'call-1', name: 'Read', success: true, data: 'ok' }],
    }),
  ])('classifies persisted executor output as a semantic step', (input) => {
    expect(classifyAgentStepSemantics(input)).toEqual({
      class: 'semantic-step',
      projectsWorkingMemory: true,
    });
  });

  it('keeps observe as a semantic boundary without claiming a memory mutation', () => {
    expect(classifyAgentStepSemantics(step({ type: 'observe' }))).toEqual({
      class: 'semantic-step',
      projectsWorkingMemory: false,
    });
  });

  it('keeps replacement retries transport-only until the final semantic step', () => {
    expect(
      classifyAgentStepSemantics(
        step({
          type: 'content_delta',
          content: 'replacement',
          deltaKind: 'assistant_text_replacement',
          replacement: { reason: 'output-validation-retry', attempt: 2 },
        }),
      ),
    ).toEqual({ class: 'transport-fragment', projectsWorkingMemory: false });
  });
});
