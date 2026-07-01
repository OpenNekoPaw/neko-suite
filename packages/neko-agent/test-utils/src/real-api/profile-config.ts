import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const AGENT_REAL_API_ENV = {
  profile: 'NEKO_AGENT_TEST_PROFILE',
  config: 'NEKO_AGENT_TEST_CONFIG',
  realApi: 'NEKO_AGENT_REAL_API',
  workDir: 'NEKO_AGENT_TEST_WORKDIR',
  timeoutMs: 'NEKO_AGENT_TEST_TIMEOUT_MS',
} as const;

export type AgentTestProfile = 'mock' | 'real';

export interface AgentRealApiProfileConfig {
  readonly profile: AgentTestProfile;
  readonly configPath?: string;
  readonly realApi: boolean;
  readonly workDir?: string;
  readonly timeoutMs: number;
}

export interface ResolveAgentRealApiProfileOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly profile?: AgentTestProfile;
  readonly configPath?: string;
  readonly realApi?: boolean;
  readonly workDir?: string;
  readonly timeoutMs?: number;
  readonly requireConfig?: boolean;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export function resolveAgentRealApiProfile(
  options: ResolveAgentRealApiProfileOptions = {},
): AgentRealApiProfileConfig {
  const env = options.env ?? process.env;
  const realApiRequested = options.realApi ?? isTruthy(env[AGENT_REAL_API_ENV.realApi]);
  const profile = parseAgentTestProfile(
    options.profile ?? env[AGENT_REAL_API_ENV.profile] ?? (realApiRequested ? 'real' : 'mock'),
  );
  const configPath = options.configPath ?? env[AGENT_REAL_API_ENV.config];
  const realApi = profile === 'real' || realApiRequested;
  const workDir = options.workDir ?? env[AGENT_REAL_API_ENV.workDir];
  const timeoutMs = parseTimeoutMs(options.timeoutMs ?? env[AGENT_REAL_API_ENV.timeoutMs]);

  if (realApiRequested && profile === 'mock') {
    throw new Error('NEKO_AGENT_REAL_API=1 requires NEKO_AGENT_TEST_PROFILE=real or no profile.');
  }

  if (options.requireConfig && profile === 'mock') {
    throw new Error('Explicit real API harness requires a non-mock profile.');
  }

  if ((options.requireConfig || profile !== 'mock') && !configPath) {
    throw new Error(
      `Profile "${profile}" requires ${AGENT_REAL_API_ENV.config} to point at config.toml.`,
    );
  }

  if (configPath) {
    assertSupportedConfigFileName(profile, configPath);
  }

  if (configPath && !fs.existsSync(configPath)) {
    throw new Error(`Agent test config does not exist for profile "${profile}": ${configPath}`);
  }

  return {
    profile,
    ...(configPath ? { configPath: path.resolve(configPath) } : {}),
    realApi,
    ...(workDir ? { workDir: path.resolve(workDir) } : {}),
    timeoutMs,
  };
}

export function defaultAgentTestProfilePath(profile: AgentTestProfile): string {
  return path.join(os.homedir(), '.neko', profile === 'real' ? 'config.toml' : 'mock.toml');
}

function parseAgentTestProfile(value: string): AgentTestProfile {
  switch (value) {
    case 'mock':
    case 'real':
      return value;
    default:
      throw new Error(
        `Unsupported ${AGENT_REAL_API_ENV.profile}: ${value}. Expected mock or real.`,
      );
  }
}

function assertSupportedConfigFileName(profile: AgentTestProfile, configPath: string): void {
  const expectedFileName = profile === 'mock' ? 'mock.toml' : 'config.toml';
  const actualFileName = path.basename(configPath);
  if (actualFileName !== expectedFileName) {
    throw new Error(
      `Profile "${profile}" only supports ${expectedFileName}; received ${actualFileName}.`,
    );
  }
}

function parseTimeoutMs(value: number | string | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${AGENT_REAL_API_ENV.timeoutMs}: ${String(value)}`);
  }
  return parsed;
}

function isTruthy(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}
