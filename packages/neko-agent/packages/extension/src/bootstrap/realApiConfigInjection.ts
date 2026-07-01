import { existsSync } from 'node:fs';
import { basename } from 'node:path';

export interface AgentRealApiUserConfigManagerOptions {
  readonly filePath?: string;
}

export interface ResolveAgentRealApiUserConfigManagerOptionsInput {
  readonly extensionMode: number;
  readonly productionExtensionMode: number;
  readonly env: NodeJS.ProcessEnv;
}

const AGENT_TEST_CONFIG_ENV = 'NEKO_AGENT_TEST_CONFIG';
const AGENT_TEST_PROFILE_ENV = 'NEKO_AGENT_TEST_PROFILE';
const AGENT_REAL_API_ENV = 'NEKO_AGENT_REAL_API';
const AGENT_REAL_API_CONFIG_FILE_NAME = 'config.toml';

export function resolveAgentRealApiUserConfigManagerOptions(
  input: ResolveAgentRealApiUserConfigManagerOptionsInput,
): AgentRealApiUserConfigManagerOptions {
  if (input.extensionMode === input.productionExtensionMode) {
    return {};
  }

  const realApi = isTruthy(input.env[AGENT_REAL_API_ENV]);
  const filePath = input.env[AGENT_TEST_CONFIG_ENV];
  if (!realApi) {
    return {};
  }
  const profile = input.env[AGENT_TEST_PROFILE_ENV];
  if (profile && profile !== 'real') {
    throw new Error(
      `${AGENT_REAL_API_ENV}=1 requires ${AGENT_TEST_PROFILE_ENV}=real or no profile.`,
    );
  }
  if (!filePath) {
    throw new Error(
      `${AGENT_REAL_API_ENV}=1 requires ${AGENT_TEST_CONFIG_ENV} to point at ${AGENT_REAL_API_CONFIG_FILE_NAME}.`,
    );
  }
  if (basename(filePath) !== AGENT_REAL_API_CONFIG_FILE_NAME) {
    throw new Error(
      `${AGENT_TEST_CONFIG_ENV} must point at ${AGENT_REAL_API_CONFIG_FILE_NAME} for real API tests.`,
    );
  }
  if (!existsSync(filePath)) {
    throw new Error(`${AGENT_TEST_CONFIG_ENV} does not exist for real API tests: ${filePath}`);
  }

  return { filePath };
}

function isTruthy(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}
