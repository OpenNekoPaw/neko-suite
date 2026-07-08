import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { AgentStep } from '@neko/agent';
import type { CLIConfig, CLIResult, RunOptions } from './types';

export const CLI_RUN_RESULT_SCHEMA = 'neko.cli-run-result.v1';

export interface CliRunResultConfigSnapshot {
  readonly provider: string;
  readonly providerType: string;
  readonly providerRequiresApiKey: boolean;
  readonly model: string;
  readonly chatModel?: {
    readonly providerId: string;
    readonly modelId: string;
    readonly capabilities?: readonly string[];
  };
  readonly workDir: string;
  readonly hasApiKey: boolean;
  readonly apiKey: '<redacted>' | '<unset>';
  readonly baseUrl?: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly outputFormat: CLIConfig['outputFormat'];
}

export interface CliRunResultArtifact {
  readonly schema: typeof CLI_RUN_RESULT_SCHEMA;
  readonly command: readonly string[];
  readonly prompt: string;
  readonly workDir: string;
  readonly provider: string;
  readonly model: string;
  readonly modelCapabilities?: readonly string[];
  readonly config: CliRunResultConfigSnapshot;
  readonly runOptions: {
    readonly interactive: boolean;
    readonly stream: boolean;
    readonly maxIterations: number;
    readonly timeout?: number;
  };
  readonly success: boolean;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly output?: string;
  readonly error?: string;
  readonly stepCount: number;
  readonly steps?: readonly AgentStep[];
}

export interface CreateCliRunResultArtifactInput {
  readonly config: CLIConfig;
  readonly runOptions: RunOptions;
  readonly result: CLIResult;
  readonly command?: readonly string[];
  readonly exitCode?: number;
}

export function createCliRunResultArtifact(
  input: CreateCliRunResultArtifactInput,
): CliRunResultArtifact {
  const provider = input.config.chatModel?.providerId ?? input.config.provider;
  const model = input.config.chatModel?.modelId ?? input.config.model;
  const steps = input.result.agentResult?.steps;
  return {
    schema: CLI_RUN_RESULT_SCHEMA,
    command: input.command ?? [],
    prompt: input.runOptions.prompt,
    workDir: input.config.workDir,
    provider,
    model,
    ...(input.config.chatModel?.capabilities
      ? { modelCapabilities: input.config.chatModel.capabilities }
      : {}),
    config: createConfigSnapshot(input.config),
    runOptions: {
      interactive: input.runOptions.interactive,
      stream: input.runOptions.stream,
      maxIterations: input.runOptions.maxIterations,
      ...(input.runOptions.timeout !== undefined ? { timeout: input.runOptions.timeout } : {}),
    },
    success: input.result.success,
    exitCode: input.exitCode ?? (input.result.success ? 0 : 1),
    durationMs: input.result.duration,
    ...(input.result.output !== undefined ? { output: input.result.output } : {}),
    ...(input.result.error !== undefined ? { error: input.result.error } : {}),
    stepCount: steps?.length ?? 0,
    ...(steps ? { steps } : {}),
  };
}

export async function writeCliRunResultArtifact(
  filePath: string,
  artifact: CliRunResultArtifact,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
}

export function createConfigSnapshot(config: CLIConfig): CliRunResultConfigSnapshot {
  return {
    provider: config.provider,
    providerType: config.providerType,
    providerRequiresApiKey: config.providerRequiresApiKey,
    model: config.model,
    ...(config.chatModel
      ? {
          chatModel: {
            providerId: config.chatModel.providerId,
            modelId: config.chatModel.modelId,
            ...(config.chatModel.capabilities
              ? { capabilities: config.chatModel.capabilities }
              : {}),
          },
        }
      : {}),
    workDir: config.workDir,
    hasApiKey: Boolean(config.apiKey),
    apiKey: config.apiKey ? '<redacted>' : '<unset>',
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    outputFormat: config.outputFormat,
  };
}
