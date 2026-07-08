/**
 * CLI Entry Point
 *
 * Parses command-line arguments with Commander,
 * loads configuration, and renders the Ink application.
 *
 * Commands:
 * - (default) interactive mode → full TUI
 * - run <prompt>              → single-shot execution
 * - config                    → config management
 */

import React from 'react';
import * as path from 'node:path';
import { render } from 'ink';
import { Command } from 'commander';
import { createFileConversationStorage, ToolRegistry } from '@neko/agent';
import { loadConfig, validateConfig, listProviders, getProviderModels } from './core/config';
import type { CLIConfig } from './core/types';
import { runAgent, runInteractive } from './core/runner';
import { formatExperimentReport, runExperiment, type ExperimentSuiteName } from './core/experiment';
import { formatResult } from './core/formatter';
import { createCLIPlatform } from './core/platform-bootstrap';
import { resolveCliWorkDir } from './core/cli-workdir';
import { joinPromptParts, resolveDefaultCliInvocation } from './core/cli-invocation';
import { createCliRunResultArtifact, writeCliRunResultArtifact } from './core/run-result';
import {
  createDefaultTuiRealApiSuiteManifest,
  loadTuiRealApiSuiteManifest,
  runTuiRealApiSuite,
} from './core/real-api-suite';
import { formatTuiLabel, getTuiLabels } from './core/tui-locale';
import { App } from './components/App';
import { detectCapabilities } from './utils/terminal';
import chalk from 'chalk';

function addWorkDirOptions(command: Command): Command {
  return command
    .option('-C, --cd <dir>', 'Working directory for workspace config and file tools')
    .option('--cwd <dir>', 'Working directory for workspace config and file tools')
    .option('--work-dir <dir>', 'Working directory for workspace config and file tools');
}

function addInteractiveOptions(command: Command): Command {
  return command
    .option('-p, --provider <provider>', 'AI provider (anthropic, openai, deepseek)')
    .option('-m, --model <model>', 'Model ID')
    .option('-k, --api-key <key>', 'API key')
    .option('-v, --verbose', 'Enable verbose output');
}

function addResumeOption(command: Command): Command {
  return command.option(
    '-r, --resume [id]',
    'Resume a previous conversation (omit id to continue the most recent)',
  );
}

function addRunOptions(command: Command): Command {
  return command
    .option('-s, --stream', 'Stream output')
    .option('-n, --max-iterations <n>', 'Max iterations', '10')
    .option('-t, --timeout <ms>', 'Timeout in milliseconds')
    .option('-f, --format <format>', 'Output format (text, json, markdown)', 'text')
    .option('--result-file <path>', 'Write structured run result JSON to a file');
}

function withGlobalOptions(
  program: Command,
  opts: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...program.opts(),
    ...opts,
  };
}

export function createCliProgram(): Command {
  const program = new Command();

  addResumeOption(addInteractiveOptions(addWorkDirOptions(program)));
  program
    .name('neko')
    .usage('[options] [prompt...]\n       neko [options] <command> [args]')
    .description('Neko AI Agent — Professional Terminal UI')
    .version('0.0.1')
    .argument('[prompt...]', 'Optional user prompt to start the session')
    .action(async (promptParts: string[] | undefined, opts: Record<string, unknown>) => {
      await runCliAction(() => handleDefault(promptParts ?? [], opts, program));
    });

  addResumeOption(
    addInteractiveOptions(
      addWorkDirOptions(
        program
          .command('interactive')
          .alias('i')
          .description('Start interactive TUI mode')
          .argument('[workDir]', 'Working directory for workspace config and file tools')
          .argument('[prompt...]', 'Optional user prompt to submit after startup'),
      ),
    ),
  ).action(
    async (
      workDir: string | undefined,
      promptParts: string[] | undefined,
      opts: Record<string, unknown>,
    ) => {
      await runCliAction(() =>
        handleInteractive({
          ...opts,
          positionalWorkDir: workDir,
          prompt: joinPromptParts(promptParts),
          program,
        }),
      );
    },
  );

  addInteractiveOptions(
    addRunOptions(
      addWorkDirOptions(
        program
          .command('run')
          .description('Run agent with a single prompt')
          .argument('<prompt...>', 'Prompt to execute'),
      ),
    ),
  ).action(async (promptParts: string[], opts: Record<string, unknown>) => {
    await runCliAction(() => handleRun(joinRequiredPromptParts(promptParts), opts, program));
  });

  addInteractiveOptions(
    addWorkDirOptions(
      program
        .command('experiment')
        .description('Run ablation experiments and write JSON/Markdown reports')
        .argument('<prompt...>', 'Prompt to use for every experiment variant')
        .option('-s, --suite <suite>', 'Suite (standard, group, parameter)', 'standard')
        .option('-r, --repetitions <n>', 'Repetitions per variant', '1')
        .option('-t, --timeout <ms>', 'Timeout per variant in milliseconds')
        .option('-o, --output-dir <dir>', 'Output directory (default: .neko/experiments)')
        .option('-i, --isolation <mode>', 'Isolation mode (none, metadata-only, workspace-root)'),
    ),
  ).action(async (promptParts: string[], opts: Record<string, unknown>) => {
    await runCliAction(() => handleExperiment(joinRequiredPromptParts(promptParts), opts, program));
  });

  addInteractiveOptions(
    addWorkDirOptions(
      program
        .command('real-api-suite')
        .description('Run TUI real API validation cases and write a Markdown report')
        .option('--manifest <path>', 'Suite manifest JSON path')
        .option('-o, --output-dir <dir>', 'Output directory (default: reports/tui-real-api/<timestamp>)')
        .option('--ai-summary', 'Generate an optional AI-assisted qualitative summary')
        .option('--summary-provider <provider>', 'Provider override for AI summary')
        .option('--summary-model <model>', 'Model override for AI summary'),
    ),
  ).action(async (opts: Record<string, unknown>) => {
    await runCliAction(() => handleRealApiSuite(opts, program));
  });

  addInteractiveOptions(
    addWorkDirOptions(
      program
        .command('resume')
        .description('Resume a previous interactive session')
        .argument('[id]', 'Conversation id to resume; omit to continue the most recent')
        .argument('[prompt...]', 'Optional prompt to submit after resume')
        .option('--last', 'Continue the most recent conversation'),
    ),
  ).action(
    async (
      id: string | undefined,
      promptParts: string[] | undefined,
      opts: Record<string, unknown>,
    ) => {
      await runCliAction(() => handleResumeCommand(id, promptParts, opts, program));
    },
  );

  program
    .command('completion')
    .description('Generate shell completion scripts')
    .argument('[shell]', 'Shell type (bash, zsh, fish)', 'zsh')
    .action((shell: string) => {
      runSyncCliAction(() => {
        console.log(generateCompletionScript(parseCompletionShell(shell)));
      });
    });

  registerConfigCommands(program);
  return program;
}

async function runCliAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    failCli(error);
  }
}

function runSyncCliAction(action: () => void): void {
  try {
    action();
  } catch (error) {
    failCli(error);
  }
}

function failCli(error: unknown): never {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
}

function registerConfigCommands(program: Command): void {
  const configCmd = program.command('config').description('Manage configuration');

  configCmd
    .command('show')
    .description('Show current configuration')
    .option('-C, --cwd <dir>', 'Working directory for workspace config')
    .option('--work-dir <dir>', 'Working directory for workspace config')
    .action((opts: Record<string, unknown>) => {
      runSyncCliAction(() => {
        const workDir = resolveCliWorkDir(withGlobalOptions(program, opts));
        const config = loadConfig(workDir);
        console.log(chalk.bold('\nCurrent Configuration:\n'));
        console.log(`  Provider:    ${config.provider}`);
        console.log(`  Model:       ${config.model}`);
        console.log(
          `  API Key:     ${config.apiKey ? '***' + config.apiKey.slice(-4) : chalk.red('Not set')}`,
        );
        console.log(`  Base URL:    ${config.baseUrl ?? 'Default'}`);
        console.log(`  Max Output Tokens: ${config.maxTokens}`);
        console.log(`  Temperature: ${config.temperature}`);
        console.log(`  Work Dir:    ${config.workDir}`);
        console.log(`  Skills Dir:  ${config.skillsDir ?? 'Not set'}`);
        console.log(`  MCP Servers: ${config.mcpServers.length}`);
        console.log('');
      });
    });

  configCmd
    .command('providers')
    .description('List available providers')
    .option('-C, --cwd <dir>', 'Working directory for workspace config')
    .option('--work-dir <dir>', 'Working directory for workspace config')
    .action((opts: Record<string, unknown>) => {
      runSyncCliAction(() => {
        const workDir = resolveCliWorkDir(withGlobalOptions(program, opts));
        const providers = listProviders(workDir);
        console.log(chalk.bold('\nAvailable Providers:\n'));
        for (const p of providers) {
          const keyStatus = p.hasApiKey ? chalk.green('✓') : chalk.red('✗');
          console.log(`  ${chalk.cyan(p.id)} (${p.displayName})`);
          console.log(`    Type: ${p.type}`);
          console.log(`    API Key: ${keyStatus}`);
          console.log(`    Models: ${p.models.length > 0 ? p.models.join(', ') : '(none)'}`);
          console.log('');
        }
      });
    });

  configCmd
    .command('models')
    .description('List available models for current provider')
    .option('-C, --cwd <dir>', 'Working directory for workspace config')
    .option('--work-dir <dir>', 'Working directory for workspace config')
    .option('-p, --provider <provider>', 'Provider to list models for')
    .action((opts: Record<string, unknown>) => {
      runSyncCliAction(() => {
        const workDir = resolveCliWorkDir(withGlobalOptions(program, opts));
        const config = loadConfig(workDir);
        const providerId = (opts['provider'] as string) ?? config.provider;
        const models = getProviderModels(providerId, workDir);
        if (models.length === 0) {
          console.error(chalk.red(`No models configured for provider: ${providerId}`));
          process.exit(1);
        }
        console.log(chalk.bold(`\nModels for ${providerId}:\n`));
        for (const m of models) {
          const marker = m === config.model ? chalk.green('* ') : '  ';
          console.log(`  ${marker}${m}`);
        }
        console.log('\n  (* = current model)\n');
      });
    });
}

// ============================================================================
// Handlers
// ============================================================================

async function handleDefault(
  promptParts: readonly string[],
  opts: Record<string, unknown>,
  program: Command,
): Promise<void> {
  const invocation = resolveDefaultCliInvocation(promptParts);
  const mergedOpts = {
    ...opts,
    ...(invocation.positionalWorkDir ? { positionalWorkDir: invocation.positionalWorkDir } : {}),
    ...(invocation.prompt ? { prompt: invocation.prompt } : {}),
  };

  if (opts['resume'] !== undefined) {
    await handleResume({
      ...mergedOpts,
      resumeId: typeof opts['resume'] === 'string' ? opts['resume'] : undefined,
      useLast: opts['resume'] === true,
      program,
    });
    return;
  }

  await handleInteractive({ ...mergedOpts, program });
}

/**
 * Handle interactive TUI mode
 */
async function handleInteractive(opts: Record<string, unknown>): Promise<void> {
  const overrides: Partial<CLIConfig> = {};
  if (typeof opts['provider'] === 'string') overrides.provider = opts['provider'];
  if (typeof opts['model'] === 'string') overrides.model = opts['model'];
  if (typeof opts['apiKey'] === 'string') overrides.apiKey = opts['apiKey'];
  if (opts['verbose']) overrides.verbose = true;

  const program = readProgramOption(opts);
  const initialPrompt = typeof opts['prompt'] === 'string' ? opts['prompt'] : undefined;
  const workDir = resolveCliWorkDir(withGlobalOptions(program, opts));
  const config = loadConfig(workDir, overrides);

  const validation = validateConfig(config);
  if (!validation.valid) {
    console.error(chalk.red('Configuration errors:'));
    for (const error of validation.errors) {
      console.error(chalk.red(`  • ${error}`));
    }
    console.error(chalk.gray('\nSet your API key:'));
    console.error(chalk.gray('  export ANTHROPIC_API_KEY=sk-ant-...'));
    console.error(chalk.gray('  # or'));
    console.error(chalk.gray('  update ~/.neko/config.toml'));
    process.exit(1);
  }

  const capabilities = detectCapabilities();
  if (!capabilities.supportsColor) {
    chalk.level = 0;
  }

  // --resume flag: use readline-based interactive mode (supports resume prompt)
  const resumeFlag = opts['resume'];
  if (resumeFlag !== undefined) {
    await handleResume({
      ...opts,
      resumeId: typeof resumeFlag === 'string' ? resumeFlag : undefined,
      useLast: resumeFlag === true,
      prompt: initialPrompt,
      program,
    });
    return;
  }

  const labels = getTuiLabels();
  console.log(chalk.cyan.bold('\n  Neko Agent'));
  console.log(chalk.gray(`  ${labels.chrome.model}: ${config.model}`));
  console.log(chalk.gray(`  ${labels.chrome.workDir}: ${config.workDir}`));
  console.log(
    chalk.gray(`  ${labels.chrome.mode}:  ${formatTuiLabel(labels.executionModes, 'auto')}`),
  );
  console.log(chalk.gray(`  ${labels.chrome.startupHelp}\n`));

  const { waitUntilExit } = render(<App config={config} initialPrompt={initialPrompt} />);
  await waitUntilExit();
}

/**
 * Handle single-shot run command
 */
async function handleRun(
  prompt: string,
  opts: Record<string, unknown>,
  program: Command,
): Promise<void> {
  const workDir = resolveCliWorkDir(withGlobalOptions(program, opts));
  const config = loadConfig(workDir, {
    provider: opts['provider'] as string | undefined,
    model: opts['model'] as string | undefined,
    apiKey: opts['apiKey'] as string | undefined,
  });

  const validation = validateConfig(config);
  if (!validation.valid) {
    console.error(chalk.red('Configuration errors:'));
    for (const error of validation.errors) {
      console.error(chalk.red(`  • ${error}`));
    }
    process.exit(1);
  }

  const format = (opts['format'] as 'text' | 'json' | 'markdown') ?? 'text';
  const maxIterations = parseInt(String(opts['maxIterations'] ?? '10'), 10);
  const timeout = opts['timeout'] ? parseInt(String(opts['timeout']), 10) : undefined;
  const resultFile = typeof opts['resultFile'] === 'string' ? opts['resultFile'] : undefined;
  const runOptions = {
    prompt,
    interactive: false,
    stream: Boolean(opts['stream']),
    maxIterations,
    timeout,
  };

  const result = await runAgent({
    config,
    runOptions,
    onOutput: (text) => process.stdout.write(text),
    onToolCall: (name) => console.log(chalk.dim(`  [tool] ${name}`)),
    onThinking: (thought) => console.log(chalk.dim(`  [thinking] ${thought.slice(0, 100)}`)),
  });

  if (resultFile) {
    await writeCliRunResultArtifact(
      path.resolve(resultFile),
      createCliRunResultArtifact({
        config,
        runOptions,
        result,
        command: process.argv.slice(1),
      }),
    );
  }

  if (format !== 'text' || !result.success) {
    console.log(formatResult(result, format));
  }

  process.exit(result.success ? 0 : 1);
}

async function handleRealApiSuite(
  opts: Record<string, unknown>,
  program: Command,
): Promise<void> {
  const workDir = resolveCliWorkDir(withGlobalOptions(program, opts));
  const provider = typeof opts['provider'] === 'string' ? opts['provider'] : undefined;
  const model = typeof opts['model'] === 'string' ? opts['model'] : undefined;
  const manifest =
    typeof opts['manifest'] === 'string'
      ? await loadTuiRealApiSuiteManifest(opts['manifest'])
      : createDefaultTuiRealApiSuiteManifest({
          workDir,
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
        });

  let summaryPlatform: ReturnType<typeof createCLIPlatform> | undefined;
  try {
    const aiSummary =
      opts['aiSummary'] === true
        ? (() => {
            const config = loadConfig(workDir, {
              provider: typeof opts['summaryProvider'] === 'string' ? opts['summaryProvider'] : provider,
              model: typeof opts['summaryModel'] === 'string' ? opts['summaryModel'] : model,
            });
            summaryPlatform = createCLIPlatform({
              workspacePath: workDir,
              toolRegistry: new ToolRegistry(),
            });
            return {
              service: summaryPlatform.service,
              providerId: config.chatModel?.providerId ?? config.provider,
              modelId: config.chatModel?.modelId ?? config.model,
              modelCapabilities: config.chatModel?.capabilities,
            };
          })()
        : undefined;

    const result = await runTuiRealApiSuite({
      manifest,
      ...(typeof opts['outputDir'] === 'string' ? { outputDir: opts['outputDir'] } : {}),
      ...(aiSummary ? { aiSummary } : {}),
    });
    console.log(chalk.cyan.bold('\nTUI real API validation complete'));
    console.log(`Report: ${result.reportPath}`);
    console.log(`Passed: ${result.passed}/${result.caseResults.length}`);
    console.log(`Failed: ${result.failed}`);
    console.log(`Skipped: ${result.skipped}`);
    process.exit(result.failed === 0 ? 0 : 1);
  } finally {
    summaryPlatform?.platform.dispose();
  }
}

async function handleResumeCommand(
  id: string | undefined,
  promptParts: readonly string[] | undefined,
  opts: Record<string, unknown>,
  program: Command,
): Promise<void> {
  const last = opts['last'] === true;
  const promptFromParts = joinPromptParts(promptParts);
  const prompt = last && id && !promptFromParts ? id : promptFromParts;
  const resumeId = last ? undefined : id;
  await handleResume({
    ...opts,
    resumeId,
    prompt,
    program,
  });
}

async function handleResume(opts: Record<string, unknown>): Promise<void> {
  const overrides: Partial<CLIConfig> = {};
  if (typeof opts['provider'] === 'string') overrides.provider = opts['provider'];
  if (typeof opts['model'] === 'string') overrides.model = opts['model'];
  if (typeof opts['apiKey'] === 'string') overrides.apiKey = opts['apiKey'];
  if (opts['verbose']) overrides.verbose = true;

  const program = readProgramOption(opts);
  const workDir = resolveCliWorkDir(withGlobalOptions(program, opts));
  const config = loadConfig(workDir, overrides);
  const validation = validateConfig(config);
  if (!validation.valid) {
    console.error(chalk.red('Configuration errors:'));
    for (const error of validation.errors) {
      console.error(chalk.red(`  • ${error}`));
    }
    process.exit(1);
  }

  const resumeId =
    typeof opts['resumeId'] === 'string' && opts['resumeId'].trim().length > 0
      ? opts['resumeId']
      : await resolveLatestResumeId(config.workDir);
  await runInteractive(config, undefined, undefined, {
    resumeId,
    initialPrompt: typeof opts['prompt'] === 'string' ? opts['prompt'] : undefined,
  });
}

async function handleExperiment(
  prompt: string,
  opts: Record<string, unknown>,
  program: Command,
): Promise<void> {
  const workDir = resolveCliWorkDir(withGlobalOptions(program, opts));
  const config = loadConfig(workDir, {
    provider: opts['provider'] as string | undefined,
    model: opts['model'] as string | undefined,
    apiKey: opts['apiKey'] as string | undefined,
  });

  const validation = validateConfig(config);
  if (!validation.valid) {
    console.error(chalk.red('Configuration errors:'));
    for (const error of validation.errors) {
      console.error(chalk.red(`  • ${error}`));
    }
    process.exit(1);
  }

  const suite = parseExperimentSuite(opts['suite']);
  const repetitions = parsePositiveInteger(opts['repetitions'], 'repetitions');
  const timeout = opts['timeout'] ? parsePositiveInteger(opts['timeout'], 'timeout') : undefined;
  const isolation = parseIsolationMode(opts['isolation']);

  console.log(chalk.cyan.bold('\nRunning ablation experiment'));
  console.log(chalk.gray(`  Suite:       ${suite}`));
  console.log(chalk.gray(`  Repetitions: ${repetitions}`));
  console.log(chalk.gray(`  Model:       ${config.model}`));
  console.log(chalk.gray(`  WorkDir:     ${config.workDir}`));

  try {
    const { result } = await runExperiment({
      config,
      prompt,
      suite,
      repetitions,
      ...(timeout ? { timeout } : {}),
      ...(typeof opts['outputDir'] === 'string' ? { outputDir: opts['outputDir'] } : {}),
      ...(isolation ? { isolation } : {}),
    });

    console.log('');
    console.log(formatExperimentReport(result));
    process.exit(0);
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

function parseExperimentSuite(value: unknown): ExperimentSuiteName {
  if (value === 'standard' || value === 'group' || value === 'parameter') {
    return value;
  }
  throw new Error(`Invalid suite: ${String(value)}. Expected standard, group, or parameter.`);
}

function parseIsolationMode(
  value: unknown,
): 'none' | 'metadata-only' | 'workspace-root' | undefined {
  if (value === undefined) return undefined;
  if (value === 'none' || value === 'metadata-only' || value === 'workspace-root') {
    return value;
  }
  throw new Error(
    `Invalid isolation mode: ${String(value)}. Expected none, metadata-only, or workspace-root.`,
  );
}

function parsePositiveInteger(value: unknown, label: string): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${String(value)}. Expected a positive integer.`);
  }
  return parsed;
}

function joinRequiredPromptParts(parts: readonly string[] | undefined): string {
  const prompt = joinPromptParts(parts);
  if (!prompt) {
    throw new Error('Prompt is required.');
  }
  return prompt;
}

function readProgramOption(opts: Record<string, unknown>): Command {
  const program = opts['program'];
  if (!(program instanceof Command)) {
    throw new Error('CLI program instance is required.');
  }
  return program;
}

async function resolveLatestResumeId(workDir: string): Promise<string> {
  const storage = createFileConversationStorage(workDir);
  try {
    const conversations = await storage.list();
    const latest = conversations[0];
    if (!latest) {
      throw new Error(`No saved conversations found for workDir: ${workDir}`);
    }
    return latest.id;
  } finally {
    await storage.dispose();
  }
}

type CompletionShell = 'bash' | 'zsh' | 'fish';

function parseCompletionShell(value: string): CompletionShell {
  if (value === 'bash' || value === 'zsh' || value === 'fish') {
    return value;
  }
  throw new Error(`Invalid shell: ${value}. Expected bash, zsh, or fish.`);
}

function generateCompletionScript(shell: CompletionShell): string {
  switch (shell) {
    case 'bash':
      return BASH_COMPLETION_SCRIPT;
    case 'zsh':
      return ZSH_COMPLETION_SCRIPT;
    case 'fish':
      return FISH_COMPLETION_SCRIPT;
  }
}

const COMPLETION_COMMANDS = [
  'interactive',
  'run',
  'experiment',
  'resume',
  'completion',
  'config',
  'help',
];

const COMPLETION_OPTIONS = [
  '-C',
  '--cwd',
  '--cd',
  '--work-dir',
  '-p',
  '--provider',
  '-m',
  '--model',
  '-k',
  '--api-key',
  '-v',
  '--verbose',
  '-r',
  '--resume',
  '-h',
  '--help',
  '-V',
  '--version',
];

const ZSH_COMPLETION_SCRIPT = `#compdef neko

_neko() {
  local -a commands options
  commands=(${COMPLETION_COMMANDS.map((command) => `'${command}'`).join(' ')})
  options=(${COMPLETION_OPTIONS.map((option) => `'${option}'`).join(' ')})
  _arguments \\
    '1:command or prompt:(${COMPLETION_COMMANDS.join(' ')})' \\
    '*::arg:->args' \\
    ${COMPLETION_OPTIONS.map((option) => `'${option}[${option}]'`).join(' \\\n    ')}
}

_neko "$@"
`;

const BASH_COMPLETION_SCRIPT = `_neko_completion() {
  local cur commands options
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  commands="${COMPLETION_COMMANDS.join(' ')}"
  options="${COMPLETION_OPTIONS.join(' ')}"
  if [[ "\${cur}" == -* ]]; then
    COMPREPLY=( $(compgen -W "\${options}" -- "\${cur}") )
  else
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
  fi
}
complete -F _neko_completion neko
`;

const FISH_COMPLETION_SCRIPT = `${COMPLETION_COMMANDS.map(
  (command) => `complete -c neko -f -a ${command}`,
).join('\n')}
${COMPLETION_OPTIONS.map((option) =>
  option.startsWith('--')
    ? `complete -c neko -f -l ${option.slice(2)}`
    : `complete -c neko -f -s ${option.slice(1)}`,
).join('\n')}
`;

const cliEntrypointName = process.argv[1]?.split(/[\\/]/).pop();
if (
  cliEntrypointName === 'cli.tsx' ||
  cliEntrypointName === 'cli.js' ||
  cliEntrypointName === 'neko' ||
  cliEntrypointName === 'nekoagent'
) {
  void createCliProgram().parseAsync(process.argv);
}
