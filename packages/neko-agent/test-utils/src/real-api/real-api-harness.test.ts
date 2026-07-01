import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ToolRegistry } from '@neko/agent';
import { writeConfigFile } from '@neko/shared/config/config-reader';
import {
  AGENT_REAL_API_ENV,
  FAILING_TOOL_NAME,
  SAFE_ECHO_TOOL_NAME,
  SAFE_WRITE_TOOL_NAME,
  VALIDATOR_TOOL_NAME,
  assertDiagnostic,
  assertHarnessStatus,
  assertIdcWorkflowEvidence,
  assertInterrupted,
  assertNoErrors,
  assertStreamedText,
  assertToolCall,
  assertToolFailure,
  assertToolResult,
  createAgentHarness,
  createAgentEventRecorder,
  createPlatformHarness,
  createSafeHarnessToolRegistry,
  resolveAgentRealApiProfile,
  toAgentRunEvidenceJson,
} from './index';

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-real-api-harness-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('real-api config files', () => {
  it('defaults to mock profile without requiring real API configuration', () => {
    const profile = resolveAgentRealApiProfile({ env: {} });

    expect(profile.profile).toBe('mock');
    expect(profile.realApi).toBe(false);
    expect(profile.configPath).toBeUndefined();
  });

  it('requires explicit config.toml for the real profile and does not fall back', () => {
    expect(() =>
      resolveAgentRealApiProfile({
        env: { [AGENT_REAL_API_ENV.profile]: 'real' },
      }),
    ).toThrow('requires NEKO_AGENT_TEST_CONFIG to point at config.toml');
  });

  it('records explicit real config.toml paths', async () => {
    const configPath = path.join(await createTempRoot(), 'config.toml');
    writeConfigFile(configPath, {
      providers: [],
      models: [],
    });

    const profile = resolveAgentRealApiProfile({
      env: {
        [AGENT_REAL_API_ENV.profile]: 'real',
        [AGENT_REAL_API_ENV.config]: configPath,
      },
    });

    expect(profile.profile).toBe('real');
    expect(profile.realApi).toBe(true);
    expect(profile.configPath).toBe(configPath);
  });

  it('accepts explicit mock.toml paths for mock harness configuration', async () => {
    const configPath = path.join(await createTempRoot(), 'mock.toml');
    writeConfigFile(configPath, {
      providers: [],
      models: [],
    });

    const profile = resolveAgentRealApiProfile({
      env: {
        [AGENT_REAL_API_ENV.profile]: 'mock',
        [AGENT_REAL_API_ENV.config]: configPath,
      },
    });

    expect(profile.profile).toBe('mock');
    expect(profile.realApi).toBe(false);
    expect(profile.configPath).toBe(configPath);
  });

  it('rejects unsupported real config filenames', async () => {
    const configPath = path.join(await createTempRoot(), 'service.config.toml');

    expect(() =>
      resolveAgentRealApiProfile({
        env: {
          [AGENT_REAL_API_ENV.profile]: 'real',
          [AGENT_REAL_API_ENV.config]: configPath,
        },
      }),
    ).toThrow('only supports config.toml');
  });

  it('rejects unsupported mock config filenames', async () => {
    const configPath = path.join(await createTempRoot(), 'mock.config.toml');

    expect(() =>
      resolveAgentRealApiProfile({
        env: {
          [AGENT_REAL_API_ENV.profile]: 'mock',
          [AGENT_REAL_API_ENV.config]: configPath,
        },
      }),
    ).toThrow('only supports mock.toml');
  });

  it('selects real config.toml from the real API flag without falling back to mock', () => {
    expect(() =>
      resolveAgentRealApiProfile({
        env: { [AGENT_REAL_API_ENV.realApi]: '1' },
      }),
    ).toThrow('Profile "real" requires NEKO_AGENT_TEST_CONFIG');
  });

  it('does not let the real API flag run against the mock profile', () => {
    expect(() =>
      resolveAgentRealApiProfile({
        env: {
          [AGENT_REAL_API_ENV.realApi]: '1',
          [AGENT_REAL_API_ENV.profile]: 'mock',
        },
      }),
    ).toThrow('requires NEKO_AGENT_TEST_PROFILE=real');
  });

  it('does not let explicit real harness commands run against mock profile', () => {
    expect(() =>
      resolveAgentRealApiProfile({
        env: {},
        requireConfig: true,
      }),
    ).toThrow('requires a non-mock profile');
  });
});

describe('safe harness tools', () => {
  it('registers echo, write, failing, and validator tools', async () => {
    const workDir = await createTempRoot();
    const registry = createSafeHarnessToolRegistry({ workDir });

    expect(registry.has(SAFE_ECHO_TOOL_NAME)).toBe(true);
    expect(registry.has(SAFE_WRITE_TOOL_NAME)).toBe(true);
    expect(registry.has(FAILING_TOOL_NAME)).toBe(true);

    const echo = await registry.execute(SAFE_ECHO_TOOL_NAME, { message: 'hello' });
    expect(echo).toMatchObject({ success: true, data: { message: 'hello' } });
  });

  it('blocks writes outside the harness work directory', async () => {
    const workDir = await createTempRoot();
    const registry = createSafeHarnessToolRegistry({ workDir });

    const result = await registry.execute(SAFE_WRITE_TOOL_NAME, {
      relativePath: '../escape.txt',
      content: 'bad',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('escapes work directory');
  });
});

describe('agent event recorder assertions', () => {
  it('records text, tool calls, tool results, diagnostics, and status', () => {
    const profile = resolveAgentRealApiProfile({ env: {} });
    const recorder = createAgentEventRecorder(
      profile,
      (() => {
        let now = 100;
        return () => now++;
      })(),
    );

    recorder.record({ type: 'text_delta', content: 'hello ' });
    recorder.record({
      type: 'tool_call',
      toolCall: { id: 'call-1', name: SAFE_ECHO_TOOL_NAME, arguments: { message: 'x' } },
    });
    recorder.record({
      type: 'tool_result',
      toolResult: { toolCallId: 'call-1', success: true, data: { message: 'x' } },
    });
    recorder.record({
      type: 'tool_result',
      toolResult: {
        toolCallId: 'call-2',
        success: false,
        data: null,
        error: 'validator-missing-marker:READY',
      },
    });
    recorder.record({ type: 'text_delta', content: 'world' });
    recorder.record({ type: 'done' });

    const evidence = recorder.finish();

    assertHarnessStatus(evidence, 'passed');
    assertStreamedText(evidence);
    assertToolCall(evidence, SAFE_ECHO_TOOL_NAME);
    assertToolResult(evidence, SAFE_ECHO_TOOL_NAME);
    assertDiagnostic(evidence, 'validator-missing-marker');
    assertNoErrors(evidence);
    expect(toAgentRunEvidenceJson(evidence)).toContain('"profile": "mock"');
  });

  it('does not let supplemental evaluator evidence override an internal failure', () => {
    const profile = resolveAgentRealApiProfile({ env: {} });
    const recorder = createAgentEventRecorder(profile);
    recorder.record({ type: 'error', error: new Error('internal harness failure') });

    const evidence = recorder.finish();
    const evaluatorResult = { evaluator: 'deepeval-placeholder', score: 1, passed: true };

    expect(evaluatorResult.passed).toBe(true);
    expect(() => assertHarnessStatus(evidence, 'passed')).toThrow('Expected harness status passed');
  });
});

describe('agent harness mock workflow', () => {
  it('records safe tool calls and tool results in mock profile', async () => {
    const profile = resolveAgentRealApiProfile({ env: {} });
    const harness = await createAgentHarness({
      profile,
      mockStreamCalls: [
        [
          {
            type: 'tool_call',
            id: 'call-echo',
            name: SAFE_ECHO_TOOL_NAME,
            arguments: { message: 'ok' },
          },
        ],
        [{ type: 'text', content: 'done' }],
      ],
      maxIterations: 3,
    });

    try {
      const evidence = await harness.run(`Call ${SAFE_ECHO_TOOL_NAME} with message "ok".`);

      assertHarnessStatus(evidence, 'passed');
      assertToolCall(evidence, SAFE_ECHO_TOOL_NAME);
      assertToolResult(evidence, SAFE_ECHO_TOOL_NAME);
      assertStreamedText(evidence);
    } finally {
      await harness.dispose();
    }
  });

  it('records validator diagnostics and subsequent repair evidence', async () => {
    const profile = resolveAgentRealApiProfile({ env: {} });
    const harness = await createAgentHarness({
      profile,
      mockStreamCalls: [
        [
          {
            type: 'tool_call',
            id: 'call-validator-1',
            name: VALIDATOR_TOOL_NAME,
            arguments: { content: 'draft without marker', requiredMarker: 'READY' },
          },
        ],
        [
          {
            type: 'tool_call',
            id: 'call-validator-2',
            name: VALIDATOR_TOOL_NAME,
            arguments: { content: 'draft READY', requiredMarker: 'READY' },
          },
        ],
        [{ type: 'text', content: 'repaired READY' }],
      ],
      maxIterations: 4,
    });

    try {
      const evidence = await harness.run('Validate and repair the artifact marker.');

      assertHarnessStatus(evidence, 'passed');
      assertDiagnostic(evidence, 'validator-missing-marker:READY');
      assertToolCall(evidence, VALIDATOR_TOOL_NAME);
      expect(evidence.toolResults.some((result) => result.success)).toBe(true);
      assertStreamedText(evidence);
    } finally {
      await harness.dispose();
    }
  });

  it('records failing tool recovery or visible failure evidence', async () => {
    const profile = resolveAgentRealApiProfile({ env: {} });
    const harness = await createAgentHarness({
      profile,
      mockStreamCalls: [
        [
          {
            type: 'tool_call',
            id: 'call-fail',
            name: FAILING_TOOL_NAME,
            arguments: { reason: 'planned harness failure' },
          },
        ],
        [{ type: 'text', content: 'escalated after tool failure' }],
      ],
      maxIterations: 3,
    });

    try {
      const evidence = await harness.run('Call the failing tool and escalate visibly.');

      assertHarnessStatus(evidence, 'passed');
      assertToolCall(evidence, FAILING_TOOL_NAME);
      assertToolFailure(evidence, 'planned harness failure');
      assertDiagnostic(evidence, 'planned harness failure');
      assertStreamedText(evidence);
    } finally {
      await harness.dispose();
    }
  });

  it('records IDC stage evidence without adding observe/evaluate/review stages', async () => {
    const profile = resolveAgentRealApiProfile({ env: {} });
    const harness = await createAgentHarness({
      profile,
      idcStage: 'plan',
      mockSteps: [{ type: 'text', content: 'plan evidence recorded' }],
    });

    try {
      const evidence = await harness.run('Create a plan artifact.');

      assertHarnessStatus(evidence, 'passed');
      assertIdcWorkflowEvidence(evidence);
    } finally {
      await harness.dispose();
    }
  });

  it('records timeout as interrupted instead of success', async () => {
    const profile = resolveAgentRealApiProfile({ env: {}, timeoutMs: 1 });
    const harness = await createAgentHarness({
      profile,
      mockSteps: [{ type: 'text', content: 'late response' }],
      mockStreamDelayMs: 10,
    });

    try {
      const evidence = await harness.run('Timeout before the provider completes.');

      assertInterrupted(evidence);
    } finally {
      await harness.dispose();
    }
  });

  it('records provider errors as failed harness evidence', async () => {
    const profile = resolveAgentRealApiProfile({ env: {} });
    const harness = await createAgentHarness({
      profile,
      mockSteps: [{ type: 'error', message: 'mock provider failure' }],
    });

    try {
      const evidence = await harness.run('Trigger provider failure.');

      expect(evidence.status).toBe('failed');
      expect(evidence.errors.join('\n')).toContain('mock provider failure');
    } finally {
      await harness.dispose();
    }
  });
});
