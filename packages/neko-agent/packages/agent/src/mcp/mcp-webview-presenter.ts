import type { MCPTestConfig, MCPTestResult } from './mcp-test-service';

export const MCP_SERVER_TEST_TIMEOUT_MS = 10000;

export interface MCPServerTestInput {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  requestId?: string;
}

export interface MCPServerTestPlan {
  requestId: string;
  config: MCPTestConfig;
}

export interface MCPServerTestResultMessage {
  type: 'mcpServerTestResult';
  requestId: string;
  success: boolean;
  error?: string;
}

export interface MCPServerStoreEntry {
  command: string;
  args: string[];
}

export interface MCPServerTestRuntimeEffects {
  test(config: MCPTestConfig): Promise<MCPTestResult>;
  postMessage(message: MCPServerTestResultMessage): void | Promise<void>;
}

export interface MCPServerTestRuntimeResult {
  requestId: string;
  success: boolean;
  error?: string;
}

export function buildMCPServerTestPlan(input: {
  server: MCPServerTestInput;
  createRequestId?: () => string;
}): MCPServerTestPlan {
  const requestId = input.server.requestId ?? input.createRequestId?.() ?? `mcp-test-${Date.now()}`;

  return {
    requestId,
    config: {
      id: input.server.id,
      name: input.server.name,
      command: input.server.command,
      ...(input.server.args ? { args: input.server.args } : {}),
      ...(input.server.env ? { env: input.server.env } : {}),
      timeout: MCP_SERVER_TEST_TIMEOUT_MS,
    },
  };
}

export function buildMCPServerTestResultMessage(input: {
  requestId: string;
  result?: MCPTestResult;
  error?: unknown;
}): MCPServerTestResultMessage {
  if (input.error !== undefined) {
    return {
      type: 'mcpServerTestResult',
      requestId: input.requestId,
      success: false,
      error: input.error instanceof Error ? input.error.message : 'Unknown error',
    };
  }

  return {
    type: 'mcpServerTestResult',
    requestId: input.requestId,
    success: input.result?.success ?? false,
    ...(input.result?.error !== undefined ? { error: input.result.error } : {}),
  };
}

export async function runMCPServerTestRuntime(
  input: {
    server: MCPServerTestInput;
    createRequestId?: () => string;
  },
  effects: MCPServerTestRuntimeEffects,
): Promise<MCPServerTestRuntimeResult> {
  const plan = buildMCPServerTestPlan(input);

  try {
    const result = await effects.test(plan.config);
    const message = buildMCPServerTestResultMessage({ requestId: plan.requestId, result });
    await effects.postMessage(message);
    return toMCPServerTestRuntimeResult(message);
  } catch (error) {
    const message = buildMCPServerTestResultMessage({ requestId: plan.requestId, error });
    await effects.postMessage(message);
    return toMCPServerTestRuntimeResult(message);
  }
}

export function parseMCPServerArgsInput(argsInput: string | undefined): string[] {
  if (!argsInput) return [];
  return argsInput
    .split(',')
    .map((arg) => arg.trim())
    .filter((arg) => arg.length > 0);
}

export function buildMCPServerStoreEntry(input: {
  command: string;
  argsInput?: string;
}): MCPServerStoreEntry {
  return {
    command: input.command,
    args: parseMCPServerArgsInput(input.argsInput),
  };
}

function toMCPServerTestRuntimeResult(
  message: MCPServerTestResultMessage,
): MCPServerTestRuntimeResult {
  return {
    requestId: message.requestId,
    success: message.success,
    ...(message.error !== undefined ? { error: message.error } : {}),
  };
}
