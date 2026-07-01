import { afterEach, describe, it } from 'vitest';
import {
  SAFE_ECHO_TOOL_NAME,
  assertHarnessStatus,
  assertNoErrors,
  assertStreamedText,
  assertToolCall,
  assertToolResult,
  createAgentHarness,
  createPlatformHarness,
  resolveAgentRealApiProfile,
} from '@neko-agent/test-utils/real-api';
import { ToolRegistry } from '../tools/tool-registry';

const disposables: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const dispose of disposables.splice(0).reverse()) {
    await dispose();
  }
});

describe('Agent real workflow harness', () => {
  it('drives a real model through a required safe tool call', async () => {
    const profile = resolveAgentRealApiProfile({ requireConfig: true });
    if (profile.profile === 'mock') {
      throw new Error('Agent real workflow harness requires a non-mock profile');
    }

    const platformHarness = createPlatformHarness({
      profile,
      toolRegistry: new ToolRegistry(),
    });
    disposables.push(() => platformHarness.dispose());

    const harness = await createAgentHarness({
      profile,
      service: platformHarness.service,
      providerId: platformHarness.providerId,
      modelId: platformHarness.modelId,
      systemPrompt: [
        'You are running a Neko Agent real API harness test.',
        `When the user asks for ${SAFE_ECHO_TOOL_NAME}, you must call that tool exactly once before answering.`,
        'After receiving the tool result, answer with a short confirmation.',
      ].join('\n'),
      maxIterations: 3,
    });
    disposables.push(() => harness.dispose());

    const evidence = await harness.run(
      `Call ${SAFE_ECHO_TOOL_NAME} with message "real-api-ok", then confirm the result.`,
    );

    assertNoErrors(evidence);
    assertHarnessStatus(evidence, 'passed');
    assertToolCall(evidence, SAFE_ECHO_TOOL_NAME);
    assertToolResult(evidence, SAFE_ECHO_TOOL_NAME);
    assertStreamedText(evidence);
  }, 180_000);
});
