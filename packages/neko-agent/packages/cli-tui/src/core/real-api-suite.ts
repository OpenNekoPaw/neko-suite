import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ChatMessage, IService } from '@neko/shared';
import { createCliRunResultArtifact, type CliRunResultArtifact } from './run-result';
import { loadConfig, validateConfig } from './config';
import { runAgent } from './runner';
import { DEFAULT_CLI_CONFIG, type CLIConfig, type CLIResult, type RunOptions } from './types';

export const TUI_REAL_API_SUITE_SCHEMA = 'neko.tui-real-api-suite.v1';
export const TUI_REAL_API_SUITE_RUN_SCHEMA = 'neko.tui-real-api-suite-run.v1';

export type TuiRealApiCaseVerdict = 'pass' | 'fail' | 'skipped';

export type TuiRealApiCheck =
  | { readonly kind: 'exit-code'; readonly equals: number }
  | { readonly kind: 'non-empty-output' }
  | { readonly kind: 'output-contains'; readonly text: string }
  | { readonly kind: 'output-not-contains'; readonly text: string }
  | { readonly kind: 'error-contains'; readonly text: string }
  | { readonly kind: 'stderr-contains'; readonly text: string }
  | { readonly kind: 'timeout'; readonly expected: boolean }
  | { readonly kind: 'model-capability'; readonly capability: string; readonly expected: boolean }
  | { readonly kind: 'content-evidence'; readonly text: string };

export interface TuiRealApiSuiteDefaults {
  readonly workDir?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly maxIterations?: number;
  readonly timeoutMs?: number;
  readonly stream?: boolean;
}

export interface TuiRealApiCase {
  readonly id: string;
  readonly prompt: string;
  readonly promptId?: string;
  readonly description?: string;
  readonly enabled?: boolean;
  readonly skipReason?: string;
  readonly workDir?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly maxIterations?: number;
  readonly timeoutMs?: number;
  readonly stream?: boolean;
  readonly requiredCapabilities?: readonly string[];
  readonly checks: readonly TuiRealApiCheck[];
}

export interface TuiRealApiSuiteManifest {
  readonly schema: typeof TUI_REAL_API_SUITE_SCHEMA;
  readonly name: string;
  readonly description?: string;
  readonly defaults?: TuiRealApiSuiteDefaults;
  readonly interactiveEvidencePath?: string;
  readonly cases: readonly TuiRealApiCase[];
}

export interface TuiRealApiCheckResult {
  readonly kind: TuiRealApiCheck['kind'];
  readonly passed: boolean;
  readonly message: string;
}

export interface TuiRealApiCaseExecution {
  readonly caseId: string;
  readonly promptId?: string;
  readonly command: readonly string[];
  readonly workDir: string;
  readonly provider: string;
  readonly model: string;
  readonly modelCapabilities?: readonly string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly result: CLIResult;
  readonly config?: CLIConfig;
}

export interface TuiRealApiCaseResult {
  readonly case: TuiRealApiCase;
  readonly verdict: TuiRealApiCaseVerdict;
  readonly checks: readonly TuiRealApiCheckResult[];
  readonly execution?: TuiRealApiCaseExecution;
  readonly resultArtifact?: CliRunResultArtifact;
  readonly stdoutPath?: string;
  readonly stderrPath?: string;
  readonly resultPath?: string;
  readonly skippedReason?: string;
}

export interface TuiRealApiSuiteRunManifest {
  readonly schema: typeof TUI_REAL_API_SUITE_RUN_SCHEMA;
  readonly name: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outputDir: string;
  readonly configSource: {
    readonly userConfigPath: string;
    readonly workspaceConfigPath?: string;
  };
  readonly cases: readonly {
    readonly id: string;
    readonly verdict: TuiRealApiCaseVerdict;
    readonly provider?: string;
    readonly model?: string;
    readonly stdoutPath?: string;
    readonly stderrPath?: string;
    readonly resultPath?: string;
  }[];
}

export interface TuiRealApiSuiteResult {
  readonly manifest: TuiRealApiSuiteManifest;
  readonly outputDir: string;
  readonly manifestPath: string;
  readonly reportPath: string;
  readonly caseResults: readonly TuiRealApiCaseResult[];
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly aiSummary?: string;
  readonly aiSummaryError?: string;
}

export interface TuiRealApiAiSummaryOptions {
  readonly service: IService;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelCapabilities?: readonly string[];
  readonly maxTokens?: number;
}

export interface RunTuiRealApiSuiteOptions {
  readonly manifest: TuiRealApiSuiteManifest;
  readonly outputDir?: string;
  readonly now?: Date;
  readonly executeCase?: TuiRealApiCaseExecutor;
  readonly aiSummary?: TuiRealApiAiSummaryOptions;
}

export type TuiRealApiCaseExecutor = (
  input: TuiRealApiCaseExecutionInput,
) => Promise<TuiRealApiCaseExecution>;

export interface TuiRealApiCaseExecutionInput {
  readonly manifest: TuiRealApiSuiteManifest;
  readonly case: TuiRealApiCase;
  readonly workDir: string;
  readonly provider?: string;
  readonly model?: string;
  readonly maxIterations: number;
  readonly timeoutMs?: number;
  readonly stream: boolean;
}

export function createDefaultTuiRealApiSuiteManifest(input: {
  readonly workDir: string;
  readonly provider?: string;
  readonly model?: string;
}): TuiRealApiSuiteManifest {
  return {
    schema: TUI_REAL_API_SUITE_SCHEMA,
    name: 'default-tui-real-api-validation',
    description:
      'Default opt-in TUI real API validation matrix. Expensive or fixture-specific cases are disabled until explicitly enabled in a copied manifest.',
    defaults: {
      workDir: input.workDir,
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.model ? { model: input.model } : {}),
      maxIterations: 8,
      timeoutMs: 120_000,
      stream: false,
    },
    cases: [
      {
        id: 'baseline-chinese',
        promptId: 'baseline',
        prompt: '不要调用工具；只根据这句话用中文一句话回答：Neko TUI 真实 API 验证正在检查什么？',
        checks: [{ kind: 'exit-code', equals: 0 }, { kind: 'non-empty-output' }],
      },
      {
        id: 'workspace-context',
        promptId: 'workspace',
        prompt: '请说明当前工作目录在本轮任务中有什么作用。不要编造文件内容。',
        checks: [{ kind: 'exit-code', equals: 0 }, { kind: 'non-empty-output' }],
      },
      {
        id: 'invalid-model-visible-error',
        promptId: 'invalid-model',
        model: '__neko_invalid_real_api_suite_model__',
        prompt: '这个用例应在调用真实 provider 前失败。',
        checks: [
          { kind: 'exit-code', equals: 1 },
          { kind: 'error-contains', text: 'not found' },
        ],
      },
      {
        id: 'media-library-variable',
        promptId: 'media-library',
        enabled: false,
        skipReason: 'Enable in a copied manifest after confirming the workspace defines ${A}.',
        prompt: '请检查 @${A}/README.md 是否可访问，并说明结果。',
        checks: [{ kind: 'non-empty-output' }],
      },
      {
        id: 'epub-vision',
        promptId: 'epub-vision',
        enabled: false,
        skipReason: 'Enable with a vision-capable model and a local EPUB fixture.',
        requiredCapabilities: ['vision'],
        prompt: '@${A}/epub/animation/Blame/[Kmoe][BLAME！(新裝版)]卷01.epub 分析前2页内容',
        checks: [
          { kind: 'exit-code', equals: 0 },
          { kind: 'model-capability', capability: 'vision', expected: true },
          { kind: 'content-evidence', text: 'ReadImage' },
        ],
      },
      {
        id: 'timeout-visible-error',
        promptId: 'timeout',
        enabled: false,
        skipReason: 'Enable only when intentionally testing timeout handling.',
        timeoutMs: 1,
        prompt: '请稍后再回答。',
        checks: [
          { kind: 'exit-code', equals: 1 },
          { kind: 'timeout', expected: true },
        ],
      },
    ],
  };
}

export async function loadTuiRealApiSuiteManifest(
  manifestPath: string,
): Promise<TuiRealApiSuiteManifest> {
  const content = await fs.readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(content) as unknown;
  return parseTuiRealApiSuiteManifest(parsed, manifestPath);
}

export function parseTuiRealApiSuiteManifest(
  value: unknown,
  sourceLabel = 'manifest',
): TuiRealApiSuiteManifest {
  if (!isRecord(value)) {
    throw new Error(`${sourceLabel} must be a JSON object.`);
  }
  if (value['schema'] !== TUI_REAL_API_SUITE_SCHEMA) {
    throw new Error(`${sourceLabel}.schema must be ${TUI_REAL_API_SUITE_SCHEMA}.`);
  }
  const name = readNonEmptyString(value['name'], `${sourceLabel}.name`);
  const description = readOptionalString(value['description'], `${sourceLabel}.description`);
  const defaults = readDefaults(value['defaults'], `${sourceLabel}.defaults`);
  const interactiveEvidencePath = readOptionalString(
    value['interactiveEvidencePath'],
    `${sourceLabel}.interactiveEvidencePath`,
  );
  const rawCases = value['cases'];
  if (!Array.isArray(rawCases) || rawCases.length === 0) {
    throw new Error(`${sourceLabel}.cases must be a non-empty array.`);
  }
  const cases = rawCases.map((item, index) => readCase(item, `${sourceLabel}.cases[${index}]`));
  return {
    schema: TUI_REAL_API_SUITE_SCHEMA,
    name,
    ...(description ? { description } : {}),
    ...(defaults ? { defaults } : {}),
    ...(interactiveEvidencePath ? { interactiveEvidencePath } : {}),
    cases,
  };
}

export async function runTuiRealApiSuite(
  options: RunTuiRealApiSuiteOptions,
): Promise<TuiRealApiSuiteResult> {
  const startedAt = options.now ?? new Date();
  const outputDir = path.resolve(
    options.outputDir ??
      path.join(process.cwd(), 'reports', 'tui-real-api', formatTimestampForPath(startedAt)),
  );
  const casesDir = path.join(outputDir, 'cases');
  await fs.mkdir(casesDir, { recursive: true });

  const executeCase = options.executeCase ?? executeTuiRealApiCase;
  const caseResults: TuiRealApiCaseResult[] = [];
  for (const testCase of options.manifest.cases) {
    if (testCase.enabled === false) {
      caseResults.push({
        case: testCase,
        verdict: 'skipped',
        checks: [],
        skippedReason: testCase.skipReason ?? 'Case is disabled.',
      });
      continue;
    }
    const executionInput = resolveCaseExecutionInput(options.manifest, testCase);
    const execution = await executeCase(executionInput);
    const checks = evaluateTuiRealApiCase(testCase, execution);
    const verdict: TuiRealApiCaseVerdict = checks.every((check) => check.passed) ? 'pass' : 'fail';
    const basename = sanitizeFileSegment(testCase.id);
    const stdoutPath = path.join(casesDir, `${basename}.stdout.md`);
    const stderrPath = path.join(casesDir, `${basename}.stderr.log`);
    const resultPath = path.join(casesDir, `${basename}.result.json`);
    const resultArtifact = createCliRunResultArtifact({
      config: execution.config ?? createDefaultExecutionConfig(execution),
      runOptions: createRunOptionsForExecution(executionInput),
      result: execution.result,
      command: execution.command,
      exitCode: execution.exitCode,
    });
    await fs.writeFile(stdoutPath, execution.stdout, 'utf8');
    await fs.writeFile(stderrPath, execution.stderr, 'utf8');
    await fs.writeFile(
      resultPath,
      `${JSON.stringify(
        {
          case: testCase,
          verdict,
          checks,
          execution: serializeExecution(execution),
          resultArtifact,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    caseResults.push({
      case: testCase,
      verdict,
      checks,
      execution,
      resultArtifact,
      stdoutPath,
      stderrPath,
      resultPath,
    });
  }

  const completedAt = new Date();
  const baseResult = summarizeSuiteResult(options.manifest, outputDir, caseResults);
  const aiSummaryResult = options.aiSummary
    ? await createAiSuiteSummary(baseResult, options.aiSummary)
    : {};
  const report = formatTuiRealApiSuiteReport({
    ...baseResult,
    ...aiSummaryResult,
  });
  const reportPath = path.join(outputDir, 'summary.md');
  const manifestPath = path.join(outputDir, 'manifest.json');
  const runManifest: TuiRealApiSuiteRunManifest = {
    schema: TUI_REAL_API_SUITE_RUN_SCHEMA,
    name: options.manifest.name,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    outputDir,
    configSource: {
      userConfigPath: path.join(process.env['HOME'] ?? '~', '.neko', 'config.toml'),
      ...(options.manifest.defaults?.workDir
        ? {
            workspaceConfigPath: path.join(
              options.manifest.defaults.workDir,
              '.neko',
              'config.toml',
            ),
          }
        : {}),
    },
    cases: caseResults.map((result) => ({
      id: result.case.id,
      verdict: result.verdict,
      ...(result.execution
        ? { provider: result.execution.provider, model: result.execution.model }
        : {}),
      ...(result.stdoutPath ? { stdoutPath: result.stdoutPath } : {}),
      ...(result.stderrPath ? { stderrPath: result.stderrPath } : {}),
      ...(result.resultPath ? { resultPath: result.resultPath } : {}),
    })),
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(runManifest, null, 2)}\n`, 'utf8');
  await fs.writeFile(reportPath, report, 'utf8');
  return {
    ...baseResult,
    ...aiSummaryResult,
    manifestPath,
    reportPath,
  };
}

export function evaluateTuiRealApiCase(
  testCase: TuiRealApiCase,
  execution: TuiRealApiCaseExecution,
): readonly TuiRealApiCheckResult[] {
  const checks = [
    ...(testCase.requiredCapabilities ?? []).map<TuiRealApiCheck>((capability) => ({
      kind: 'model-capability',
      capability,
      expected: true,
    })),
    ...testCase.checks,
  ];
  return checks.map((check) => evaluateCheck(check, execution));
}

export function formatTuiRealApiSuiteReport(input: {
  readonly manifest: TuiRealApiSuiteManifest;
  readonly outputDir: string;
  readonly caseResults: readonly TuiRealApiCaseResult[];
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly aiSummary?: string;
  readonly aiSummaryError?: string;
}): string {
  const lines = [
    `# ${input.manifest.name}`,
    '',
    input.manifest.description,
    '',
    '## Summary',
    '',
    `- Output Dir: ${input.outputDir}`,
    `- Passed: ${input.passed}`,
    `- Failed: ${input.failed}`,
    `- Skipped: ${input.skipped}`,
    `- Interactive TUI Coverage: ${
      input.manifest.interactiveEvidencePath
        ? `attached (${input.manifest.interactiveEvidencePath})`
        : 'not covered by run-mode suite'
    }`,
    '',
    '## Cases',
    '',
    '| Case | Verdict | Provider | Model | Duration | Artifacts |',
    '| --- | --- | --- | --- | ---: | --- |',
    ...input.caseResults.map(formatCaseRow),
    '',
    '## Deterministic Checks',
    '',
    ...input.caseResults.flatMap(formatCaseChecks),
    '',
    '## AI-Assisted Summary',
    '',
    input.aiSummary
      ? input.aiSummary
      : input.aiSummaryError
        ? `AI summary failed: ${input.aiSummaryError}`
        : 'AI summary was not requested. Deterministic verdicts are the source of truth.',
    '',
    '## Residual Risk',
    '',
    input.manifest.interactiveEvidencePath
      ? '- Interactive evidence was provided separately; review it alongside this report.'
      : '- `neko run` validates non-interactive Agent execution only. Terminal input, autocomplete, slash UI, queue controls, i18n rendering, and focus behavior need PTY/manual smoke evidence.',
    '',
  ];
  return `${lines.filter((line): line is string => line !== undefined).join('\n')}\n`;
}

async function executeTuiRealApiCase(
  input: TuiRealApiCaseExecutionInput,
): Promise<TuiRealApiCaseExecution> {
  const command = buildCaseCommand(input);
  const started = Date.now();
  const config = loadConfig(input.workDir, {
    provider: input.provider,
    model: input.model,
  });
  const validation = validateConfig(config);
  if (!validation.valid) {
    const error = `Configuration errors: ${validation.errors.join('; ')}`;
    const durationMs = Date.now() - started;
    return {
      caseId: input.case.id,
      ...(input.case.promptId ? { promptId: input.case.promptId } : {}),
      command,
      workDir: input.workDir,
      provider: config.chatModel?.providerId ?? config.provider,
      model: config.chatModel?.modelId ?? config.model,
      modelCapabilities: config.chatModel?.capabilities,
      stdout: '',
      stderr: error,
      exitCode: 1,
      durationMs,
      timedOut: false,
      config,
      result: {
        success: false,
        error,
        duration: durationMs,
      },
    };
  }
  const stdout: string[] = [];
  const stderr: string[] = [];
  const runOptions = createRunOptionsForExecution(input);
  const result = await runAgent({
    config,
    runOptions,
    onOutput: (text) => stdout.push(text),
    onToolCall: (name) => stdout.push(`\n[tool] ${name}\n`),
    onThinking: (thought) => stdout.push(`\n[thinking] ${thought.slice(0, 100)}\n`),
  });
  if (result.error) {
    stderr.push(result.error);
  }
  return {
    caseId: input.case.id,
    ...(input.case.promptId ? { promptId: input.case.promptId } : {}),
    command,
    workDir: input.workDir,
    provider: config.chatModel?.providerId ?? config.provider,
    model: config.chatModel?.modelId ?? config.model,
    modelCapabilities: config.chatModel?.capabilities,
    stdout: stdout.join(''),
    stderr: stderr.join('\n'),
    exitCode: result.success ? 0 : 1,
    durationMs: result.duration,
    timedOut: Boolean(result.error?.includes('timed out')),
    result,
    config,
  };
}

async function createAiSuiteSummary(
  result: Omit<TuiRealApiSuiteResult, 'manifestPath' | 'reportPath'>,
  options: TuiRealApiAiSummaryOptions,
): Promise<{ readonly aiSummary?: string; readonly aiSummaryError?: string }> {
  const prompt = [
    'Summarize this Neko TUI real API validation run in Chinese.',
    'Do not override deterministic pass/fail verdicts; call out suspicious outputs as reviewer notes.',
    JSON.stringify(
      {
        suite: result.manifest.name,
        passed: result.passed,
        failed: result.failed,
        skipped: result.skipped,
        cases: result.caseResults.map((caseResult) => ({
          id: caseResult.case.id,
          verdict: caseResult.verdict,
          checks: caseResult.checks,
          output: caseResult.execution?.result.output?.slice(0, 1200),
          error: caseResult.execution?.result.error,
        })),
      },
      null,
      2,
    ),
  ].join('\n\n');
  try {
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
    const response = await options.service.chat(messages, {
      providerId: options.providerId,
      modelId: options.modelId,
      modelCapabilities: options.modelCapabilities,
      maxTokens: options.maxTokens ?? 1200,
    });
    return { aiSummary: readMessageContent(response.message.content) };
  } catch (error) {
    return { aiSummaryError: error instanceof Error ? error.message : String(error) };
  }
}

function serializeExecution(
  execution: TuiRealApiCaseExecution,
): Omit<TuiRealApiCaseExecution, 'config'> {
  return {
    caseId: execution.caseId,
    ...(execution.promptId ? { promptId: execution.promptId } : {}),
    command: execution.command,
    workDir: execution.workDir,
    provider: execution.provider,
    model: execution.model,
    ...(execution.modelCapabilities ? { modelCapabilities: execution.modelCapabilities } : {}),
    stdout: execution.stdout,
    stderr: execution.stderr,
    exitCode: execution.exitCode,
    durationMs: execution.durationMs,
    timedOut: execution.timedOut,
    result: execution.result,
  };
}

function readMessageContent(content: ChatMessage['content']): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

function summarizeSuiteResult(
  manifest: TuiRealApiSuiteManifest,
  outputDir: string,
  caseResults: readonly TuiRealApiCaseResult[],
): Omit<TuiRealApiSuiteResult, 'manifestPath' | 'reportPath'> {
  return {
    manifest,
    outputDir,
    caseResults,
    passed: caseResults.filter((result) => result.verdict === 'pass').length,
    failed: caseResults.filter((result) => result.verdict === 'fail').length,
    skipped: caseResults.filter((result) => result.verdict === 'skipped').length,
  };
}

function resolveCaseExecutionInput(
  manifest: TuiRealApiSuiteManifest,
  testCase: TuiRealApiCase,
): TuiRealApiCaseExecutionInput {
  const workDir = testCase.workDir ?? manifest.defaults?.workDir;
  if (!workDir) {
    throw new Error(`TUI real API case "${testCase.id}" requires workDir.`);
  }
  return {
    manifest,
    case: testCase,
    workDir,
    provider: testCase.provider ?? manifest.defaults?.provider,
    model: testCase.model ?? manifest.defaults?.model,
    maxIterations: testCase.maxIterations ?? manifest.defaults?.maxIterations ?? 10,
    timeoutMs: testCase.timeoutMs ?? manifest.defaults?.timeoutMs,
    stream: testCase.stream ?? manifest.defaults?.stream ?? false,
  };
}

function createRunOptionsForExecution(input: TuiRealApiCaseExecutionInput): RunOptions {
  return {
    prompt: input.case.prompt,
    interactive: false,
    stream: input.stream,
    maxIterations: input.maxIterations,
    ...(input.timeoutMs !== undefined ? { timeout: input.timeoutMs } : {}),
  };
}

function evaluateCheck(
  check: TuiRealApiCheck,
  execution: TuiRealApiCaseExecution,
): TuiRealApiCheckResult {
  switch (check.kind) {
    case 'exit-code':
      return checkResult(
        check.kind,
        execution.exitCode === check.equals,
        `exitCode=${execution.exitCode}, expected=${check.equals}`,
      );
    case 'non-empty-output':
      return checkResult(
        check.kind,
        Boolean(execution.result.output?.trim()),
        'assistant output must be non-empty',
      );
    case 'output-contains':
      return checkResult(
        check.kind,
        (execution.result.output ?? execution.stdout).includes(check.text),
        `output contains "${check.text}"`,
      );
    case 'output-not-contains':
      return checkResult(
        check.kind,
        !(execution.result.output ?? execution.stdout).includes(check.text),
        `output does not contain "${check.text}"`,
      );
    case 'error-contains':
      return checkResult(
        check.kind,
        (execution.result.error ?? '').includes(check.text),
        `error contains "${check.text}"`,
      );
    case 'stderr-contains':
      return checkResult(
        check.kind,
        execution.stderr.includes(check.text),
        `stderr contains "${check.text}"`,
      );
    case 'timeout':
      return checkResult(
        check.kind,
        execution.timedOut === check.expected,
        `timedOut=${execution.timedOut}, expected=${check.expected}`,
      );
    case 'model-capability': {
      const hasCapability = execution.modelCapabilities?.includes(check.capability) ?? false;
      return checkResult(
        check.kind,
        hasCapability === check.expected,
        `model capability ${check.capability}=${hasCapability}, expected=${check.expected}`,
      );
    }
    case 'content-evidence':
      return checkResult(
        check.kind,
        execution.stdout.includes(check.text) ||
          execution.stderr.includes(check.text) ||
          Boolean(execution.result.output?.includes(check.text)),
        `content evidence contains "${check.text}"`,
      );
  }
}

function checkResult(
  kind: TuiRealApiCheck['kind'],
  passed: boolean,
  message: string,
): TuiRealApiCheckResult {
  return { kind, passed, message };
}

function readDefaults(value: unknown, label: string): TuiRealApiSuiteDefaults | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);
  const workDir = readOptionalString(value['workDir'], `${label}.workDir`);
  const provider = readOptionalString(value['provider'], `${label}.provider`);
  const model = readOptionalString(value['model'], `${label}.model`);
  const maxIterations = readOptionalPositiveInteger(
    value['maxIterations'],
    `${label}.maxIterations`,
  );
  const timeoutMs = readOptionalPositiveInteger(value['timeoutMs'], `${label}.timeoutMs`);
  return {
    ...(workDir ? { workDir } : {}),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(maxIterations !== undefined ? { maxIterations } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(value['stream'] !== undefined
      ? { stream: readBoolean(value['stream'], `${label}.stream`) }
      : {}),
  };
}

function readCase(value: unknown, label: string): TuiRealApiCase {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);
  const id = readNonEmptyString(value['id'], `${label}.id`);
  const prompt = readNonEmptyString(value['prompt'], `${label}.prompt`);
  const promptId = readOptionalString(value['promptId'], `${label}.promptId`);
  const description = readOptionalString(value['description'], `${label}.description`);
  const skipReason = readOptionalString(value['skipReason'], `${label}.skipReason`);
  const workDir = readOptionalString(value['workDir'], `${label}.workDir`);
  const provider = readOptionalString(value['provider'], `${label}.provider`);
  const model = readOptionalString(value['model'], `${label}.model`);
  const maxIterations = readOptionalPositiveInteger(
    value['maxIterations'],
    `${label}.maxIterations`,
  );
  const timeoutMs = readOptionalPositiveInteger(value['timeoutMs'], `${label}.timeoutMs`);
  const requiredCapabilities = readOptionalStringArray(
    value['requiredCapabilities'],
    `${label}.requiredCapabilities`,
  );
  const checksValue = value['checks'];
  if (!Array.isArray(checksValue) || checksValue.length === 0) {
    throw new Error(`${label}.checks must be a non-empty array.`);
  }
  return {
    id,
    prompt,
    ...(promptId ? { promptId } : {}),
    ...(description ? { description } : {}),
    ...(value['enabled'] !== undefined
      ? { enabled: readBoolean(value['enabled'], `${label}.enabled`) }
      : {}),
    ...(skipReason ? { skipReason } : {}),
    ...(workDir ? { workDir } : {}),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(maxIterations !== undefined ? { maxIterations } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(value['stream'] !== undefined
      ? { stream: readBoolean(value['stream'], `${label}.stream`) }
      : {}),
    ...(requiredCapabilities ? { requiredCapabilities } : {}),
    checks: checksValue.map((check, index) => readCheck(check, `${label}.checks[${index}]`)),
  };
}

function readCheck(value: unknown, label: string): TuiRealApiCheck {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);
  const kind = readNonEmptyString(value['kind'], `${label}.kind`);
  switch (kind) {
    case 'exit-code':
      return { kind, equals: readInteger(value['equals'], `${label}.equals`) };
    case 'non-empty-output':
      return { kind };
    case 'output-contains':
    case 'output-not-contains':
    case 'error-contains':
    case 'stderr-contains':
    case 'content-evidence':
      return { kind, text: readNonEmptyString(value['text'], `${label}.text`) };
    case 'timeout':
      return { kind, expected: readBoolean(value['expected'], `${label}.expected`) };
    case 'model-capability':
      return {
        kind,
        capability: readNonEmptyString(value['capability'], `${label}.capability`),
        expected: readBoolean(value['expected'], `${label}.expected`),
      };
    default:
      throw new Error(`${label}.kind is unsupported: ${kind}`);
  }
}

function buildCaseCommand(input: TuiRealApiCaseExecutionInput): readonly string[] {
  return [
    'neko',
    'run',
    '--cd',
    input.workDir,
    ...(input.provider ? ['--provider', input.provider] : []),
    ...(input.model ? ['--model', input.model] : []),
    '--max-iterations',
    String(input.maxIterations),
    ...(input.timeoutMs !== undefined ? ['--timeout', String(input.timeoutMs)] : []),
    input.case.prompt,
  ];
}

function createDefaultExecutionConfig(execution: TuiRealApiCaseExecution): CLIConfig {
  return {
    ...DEFAULT_CLI_CONFIG,
    provider: execution.provider,
    providerType: 'unknown',
    providerRequiresApiKey: true,
    model: execution.model,
    chatModel: {
      providerId: execution.provider,
      modelId: execution.model,
      ...(execution.modelCapabilities ? { capabilities: execution.modelCapabilities } : {}),
    },
    workDir: execution.workDir,
  };
}

function formatCaseRow(result: TuiRealApiCaseResult): string {
  const execution = result.execution;
  const artifacts = [
    result.stdoutPath ? `[stdout](${result.stdoutPath})` : undefined,
    result.stderrPath ? `[stderr](${result.stderrPath})` : undefined,
    result.resultPath ? `[result](${result.resultPath})` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  return [
    `| ${result.case.id}`,
    result.verdict,
    execution?.provider ?? '',
    execution?.model ?? '',
    execution ? String(execution.durationMs) : '',
    artifacts || result.skippedReason || '',
    '|',
  ].join(' | ');
}

function formatCaseChecks(result: TuiRealApiCaseResult): readonly string[] {
  if (result.verdict === 'skipped') {
    return [
      `### ${result.case.id}`,
      '',
      `- skipped: ${result.skippedReason ?? 'Case is disabled.'}`,
      '',
    ];
  }
  return [
    `### ${result.case.id}`,
    '',
    ...result.checks.map(
      (check) => `- ${check.passed ? 'pass' : 'fail'}: ${check.kind} - ${check.message}`,
    ),
    '',
  ];
}

function formatTimestampForPath(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function sanitizeFileSegment(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!sanitized) {
    throw new Error(`Invalid file segment: ${value}`);
  }
  return sanitized;
}

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function readOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return readNonEmptyString(value, label);
}

function readInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }
  return value;
}

function readOptionalPositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  const number = readInteger(value, label);
  if (number <= 0) {
    throw new Error(`${label} must be positive.`);
  }
  return number;
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function readOptionalStringArray(value: unknown, label: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
