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
import { render } from 'ink';
import { Command } from 'commander';
import { loadConfig, validateConfig, listProviders, getProviderModels } from './core/config';
import type { CLIConfig } from './core/types';
import { runAgent, runInteractive } from './core/runner';
import { formatExperimentReport, runExperiment, type ExperimentSuiteName } from './core/experiment';
import { formatResult } from './core/formatter';
import { App } from './components/App';
import { detectCapabilities } from './utils/terminal';
import chalk from 'chalk';

const program = new Command();

program.name('nekoagent').description('Neko AI Agent — Professional Terminal UI').version('0.0.1');

// Default: interactive TUI mode
program
  .command('interactive', { isDefault: true })
  .alias('i')
  .description('Start interactive TUI mode')
  .option('-p, --provider <provider>', 'AI provider (anthropic, openai, deepseek)')
  .option('-m, --model <model>', 'Model ID')
  .option('-k, --api-key <key>', 'API key')
  .option('-v, --verbose', 'Enable verbose output')
  .option('-r, --resume [id]', 'Resume a previous conversation (omit id to pick from list)')
  .action(async (opts: Record<string, unknown>) => {
    await handleInteractive(opts);
  });

// Single-shot run
program
  .command('run <prompt>')
  .description('Run agent with a single prompt')
  .option('-p, --provider <provider>', 'AI provider')
  .option('-m, --model <model>', 'Model ID')
  .option('-k, --api-key <key>', 'API key')
  .option('-s, --stream', 'Stream output')
  .option('-n, --max-iterations <n>', 'Max iterations', '10')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds')
  .option('-f, --format <format>', 'Output format (text, json, markdown)', 'text')
  .action(async (prompt: string, opts: Record<string, unknown>) => {
    await handleRun(prompt, opts);
  });

program
  .command('experiment <prompt>')
  .description('Run ablation experiments and write JSON/Markdown reports')
  .option('-p, --provider <provider>', 'AI provider')
  .option('-m, --model <model>', 'Model ID')
  .option('-k, --api-key <key>', 'API key')
  .option('-s, --suite <suite>', 'Suite (standard, group, parameter)', 'standard')
  .option('-r, --repetitions <n>', 'Repetitions per variant', '1')
  .option('-t, --timeout <ms>', 'Timeout per variant in milliseconds')
  .option('-o, --output-dir <dir>', 'Output directory (default: .neko/experiments)')
  .option('-i, --isolation <mode>', 'Isolation mode (none, metadata-only, workspace-root)')
  .action(async (prompt: string, opts: Record<string, unknown>) => {
    await handleExperiment(prompt, opts);
  });

// Config command
const configCmd = program.command('config').description('Manage configuration');

configCmd
  .command('show')
  .description('Show current configuration')
  .action(() => {
    const config = loadConfig();
    console.log(chalk.bold('\nCurrent Configuration:\n'));
    console.log(`  Provider:    ${config.provider}`);
    console.log(`  Model:       ${config.model}`);
    console.log(
      `  API Key:     ${config.apiKey ? '***' + config.apiKey.slice(-4) : chalk.red('Not set')}`,
    );
    console.log(`  Base URL:    ${config.baseUrl ?? 'Default'}`);
    console.log(`  Max Tokens:  ${config.maxTokens}`);
    console.log(`  Temperature: ${config.temperature}`);
    console.log(`  Work Dir:    ${config.workDir}`);
    console.log(`  Skills Dir:  ${config.skillsDir ?? 'Not set'}`);
    console.log(`  MCP Servers: ${config.mcpServers.length}`);
    console.log('');
  });

configCmd
  .command('providers')
  .description('List available providers')
  .action(() => {
    const providers = listProviders();
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

configCmd
  .command('models')
  .description('List available models for current provider')
  .option('-p, --provider <provider>', 'Provider to list models for')
  .action((opts: Record<string, unknown>) => {
    const config = loadConfig();
    const providerId = (opts['provider'] as string) ?? config.provider;
    const models = getProviderModels(providerId);
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

program.parse();

// ============================================================================
// Handlers
// ============================================================================

/**
 * Handle interactive TUI mode
 */
async function handleInteractive(opts: Record<string, unknown>): Promise<void> {
  const overrides: Partial<CLIConfig> = {};
  if (typeof opts['provider'] === 'string') overrides.provider = opts['provider'];
  if (typeof opts['model'] === 'string') overrides.model = opts['model'];
  if (typeof opts['apiKey'] === 'string') overrides.apiKey = opts['apiKey'];
  if (opts['verbose']) overrides.verbose = true;

  const config = loadConfig(process.cwd(), overrides);

  const validation = validateConfig(config);
  if (!validation.valid) {
    console.error(chalk.red('Configuration errors:'));
    for (const error of validation.errors) {
      console.error(chalk.red(`  • ${error}`));
    }
    console.error(chalk.gray('\nSet your API key:'));
    console.error(chalk.gray('  export ANTHROPIC_API_KEY=sk-ant-...'));
    console.error(chalk.gray('  # or'));
    console.error(chalk.gray('  nekoagent config set apiKey sk-ant-...'));
    process.exit(1);
  }

  const capabilities = detectCapabilities();
  if (!capabilities.supportsColor) {
    chalk.level = 0;
  }

  // --resume flag: use readline-based interactive mode (supports resume prompt)
  const resumeFlag = opts['resume'];
  if (resumeFlag !== undefined) {
    const resumeId = typeof resumeFlag === 'string' ? resumeFlag : undefined;
    await runInteractive(config, undefined, undefined, { resumeId });
    return;
  }

  console.log(chalk.cyan.bold('\n  Neko Agent'));
  console.log(chalk.gray(`  Model: ${config.model}`));
  console.log(chalk.gray(`  Mode:  auto`));
  console.log(chalk.gray('  Type /help for commands, /exit to quit\n'));

  const { waitUntilExit } = render(<App config={config} />);
  await waitUntilExit();
}

/**
 * Handle single-shot run command
 */
async function handleRun(prompt: string, opts: Record<string, unknown>): Promise<void> {
  const config = loadConfig(process.cwd(), {
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

  const result = await runAgent({
    config,
    runOptions: {
      prompt,
      interactive: false,
      stream: Boolean(opts['stream']),
      maxIterations,
      timeout,
    },
    onOutput: (text) => process.stdout.write(text),
    onToolCall: (name) => console.log(chalk.dim(`  [tool] ${name}`)),
    onThinking: (thought) => console.log(chalk.dim(`  [thinking] ${thought.slice(0, 100)}`)),
  });

  if (format !== 'text' || !result.success) {
    console.log(formatResult(result, format));
  }

  process.exit(result.success ? 0 : 1);
}

async function handleExperiment(prompt: string, opts: Record<string, unknown>): Promise<void> {
  const config = loadConfig(process.cwd(), {
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
