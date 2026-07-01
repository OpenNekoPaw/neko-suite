import type { AgentRunEvidence, AgentHarnessStatus } from './evidence';

export function assertHarnessStatus(
  evidence: AgentRunEvidence,
  expected: AgentHarnessStatus,
): void {
  if (evidence.status !== expected) {
    throw new Error(`Expected harness status ${expected}, received ${evidence.status}`);
  }
}

export function assertStreamedText(evidence: AgentRunEvidence): void {
  if (!evidence.text.trim()) {
    throw new Error('Expected streamed or final assistant text in evidence');
  }
}

export function assertToolCall(evidence: AgentRunEvidence, toolName: string): void {
  if (!evidence.toolCalls.some((toolCall) => toolCall.name === toolName)) {
    throw new Error(`Expected tool call ${toolName} in evidence`);
  }
}

export function assertToolResult(evidence: AgentRunEvidence, toolName: string): void {
  const toolCallIds = new Set(
    evidence.toolCalls
      .filter((toolCall) => toolCall.name === toolName)
      .map((toolCall) => toolCall.id),
  );
  if (!evidence.toolResults.some((toolResult) => toolResult.id && toolCallIds.has(toolResult.id))) {
    throw new Error(`Expected tool result ${toolName} in evidence`);
  }
}

export function assertDiagnostic(evidence: AgentRunEvidence, pattern: string | RegExp): void {
  const matches = evidence.diagnostics.some((diagnostic) =>
    typeof pattern === 'string' ? diagnostic.includes(pattern) : pattern.test(diagnostic),
  );
  if (!matches) {
    throw new Error(`Expected diagnostic ${String(pattern)} in evidence`);
  }
}

export function assertToolFailure(evidence: AgentRunEvidence, pattern?: string | RegExp): void {
  const failedResult = evidence.toolResults.find((toolResult) => !toolResult.success);
  if (!failedResult) {
    throw new Error('Expected failed tool result in evidence');
  }
  if (pattern) {
    const error = failedResult.error ?? '';
    const matches = typeof pattern === 'string' ? error.includes(pattern) : pattern.test(error);
    if (!matches) {
      throw new Error(
        `Expected failed tool result matching ${String(pattern)}, received: ${error}`,
      );
    }
  }
}

export function assertInterrupted(evidence: AgentRunEvidence, pattern?: string | RegExp): void {
  if (evidence.status !== 'interrupted') {
    throw new Error(`Expected interrupted harness status, received ${evidence.status}`);
  }
  if (pattern) {
    const text = [...evidence.errors, ...evidence.diagnostics, evidence.text].join('\n');
    const matches = typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text);
    if (!matches) {
      throw new Error(`Expected interrupted evidence matching ${String(pattern)}`);
    }
  }
}

export function assertIdcWorkflowEvidence(evidence: AgentRunEvidence): void {
  const serialized = JSON.stringify(evidence.events);
  if (!/\b(?:draft|plan|apply)\b/i.test(serialized)) {
    throw new Error('Expected Draft, Plan, or Apply IDC evidence');
  }
  if (/\b(?:observe|evaluate|review)\b/i.test(serialized)) {
    throw new Error('Observe, Evaluate, or Review must not be represented as IDC stages');
  }
}

export function assertNoErrors(evidence: AgentRunEvidence): void {
  if (evidence.errors.length > 0) {
    throw new Error(`Expected no Agent errors, received: ${evidence.errors.join('; ')}`);
  }
}
