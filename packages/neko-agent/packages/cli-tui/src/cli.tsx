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
import { PROVIDERS } from './core/types';
import type { CLIConfig } from './core/types';
import { runAgent } from './core/runner';
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
      const envSet = process.env[p.envKey] ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${chalk.cyan(p.id)} (${p.name})`);
      console.log(`    Default Model: ${p.defaultModel}`);
      console.log(`    Env Key: ${p.envKey} ${envSet}`);
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
    const provider = PROVIDERS[providerId];
    if (!provider) {
      console.error(chalk.red(`Unknown provider: ${providerId}`));
      process.exit(1);
    }
    const models = getProviderModels(providerId);
    console.log(chalk.bold(`\nModels for ${provider.name}:\n`));
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
