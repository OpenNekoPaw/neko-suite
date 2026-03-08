#!/usr/bin/env node
/**
 * Neko Suite Agent CLI
 *
 * Command-line interface for running the Neko Suite AI Agent standalone.
 *
 * Usage:
 *   neko-agent run "your prompt here"
 *   neko-agent interactive
 *   neko-agent config set provider anthropic
 */

import { Command } from 'commander';
import ora from 'ora';
import * as fs from 'node:fs';
import { loadConfig, saveGlobalConfig, validateConfig, listProviders } from './config';
import { runAgent, runInteractive } from './runner';
import { formatResult } from './formatter';
import { theme, BRAILLE_SPINNER } from './theme';
import type { CLIConfig, RunOptions } from './types';
import { PROVIDERS } from './types';

const VERSION = '0.0.1';

/**
 * Create the CLI program
 */
function createProgram(): Command {
  const program = new Command();

  program
    .name('nekoagent')
    .description('NekoAgent CLI - Run AI agents from the command line')
    .version(VERSION);

  // Run command
  program
    .command('run')
    .description('Run the agent with a prompt')
    .argument('<prompt>', 'The prompt or task for the agent')
    .option('-p, --provider <provider>', 'LLM provider (anthropic, openai, deepseek)')
    .option('-m, --model <model>', 'Model ID')
    .option('-k, --api-key <key>', 'API key')
    .option('-u, --base-url <url>', 'API base URL')
    .option('-t, --temperature <temp>', 'Temperature (0-1)', parseFloat)
    .option('--max-tokens <tokens>', 'Max tokens', parseInt)
    .option('--max-iterations <n>', 'Max agent iterations', parseInt, 10)
    .option('--timeout <ms>', 'Timeout in milliseconds', parseInt)
    .option('-i, --input <file>', 'Read prompt from file')
    .option('-o, --output <file>', 'Write result to file')
    .option('-f, --format <format>', 'Output format (text, json, markdown)', 'text')
    .option('-v, --verbose', 'Verbose output')
    .option('-s, --stream', 'Stream output')
    .action(async (prompt: string, options: Record<string, unknown>) => {
      await handleRun(prompt, options);
    });

  // Interactive command
  program
    .command('interactive')
    .alias('i')
    .description('Start interactive mode')
    .option('-p, --provider <provider>', 'LLM provider')
    .option('-m, --model <model>', 'Model ID')
    .option('-k, --api-key <key>', 'API key')
    .option('-v, --verbose', 'Verbose output')
    .option('--resume [id]', 'Resume a previous session (latest if no id)')
    .option('--continue', 'Continue the most recent session')
    .action(async (options: Record<string, unknown>) => {
      await handleInteractive(options);
    });

  // Config command
  const configCmd = program
    .command('config')
    .description('Manage configuration');

  configCmd
    .command('show')
    .description('Show current configuration')
    .action(() => {
      handleConfigShow();
    });

  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      handleConfigSet(key, value);
    });

  configCmd
    .command('providers')
    .description('List available providers')
    .action(() => {
      handleListProviders();
    });

  return program;
}

/**
 * Handle run command
 */
async function handleRun(
  prompt: string,
  options: Record<string, unknown>
): Promise<void> {
  // Load configuration
  const config = loadConfig(process.cwd(), {
    provider: options.provider as string | undefined,
    model: options.model as string | undefined,
    apiKey: options.apiKey as string | undefined,
    baseUrl: options.baseUrl as string | undefined,
    temperature: options.temperature as number | undefined,
    maxTokens: options.maxTokens as number | undefined,
    verbose: options.verbose as boolean | undefined,
    outputFormat: options.format as 'text' | 'json' | 'markdown' | undefined,
  });

  // Validate configuration
  const validation = validateConfig(config);
  if (!validation.valid) {
    console.error(theme.error('Configuration errors:'));
    for (const error of validation.errors) {
      console.error(theme.error(`  - ${error}`));
    }
    process.exit(1);
  }

  // Read prompt from file if specified
  let finalPrompt = prompt;
  if (options.input) {
    try {
      finalPrompt = fs.readFileSync(options.input as string, 'utf-8');
    } catch (error) {
      console.error(theme.error(`Failed to read input file: ${options.input}`));
      process.exit(1);
    }
  }

  // Run options
  const runOptions: RunOptions = {
    prompt: finalPrompt,
    interactive: false,
    stream: options.stream as boolean ?? false,
    maxIterations: options.maxIterations as number ?? 10,
    timeout: options.timeout as number | undefined,
    inputFile: options.input as string | undefined,
    outputFile: options.output as string | undefined,
  };

  // Show spinner with braille frames (aligned with opencode TUI)
  const spinner = ora({
    spinner: BRAILLE_SPINNER,
    text: 'Running agent...',
    isEnabled: !config.verbose && config.outputFormat === 'text',
  }).start();

  // Run agent
  const result = await runAgent({
    config,
    runOptions,
    onOutput: config.verbose ? (text) => console.log(text) : undefined,
    onToolCall: config.verbose
      ? (name, args) => console.log(theme.info(`[Tool] ${name}`), args)
      : undefined,
    onThinking: config.verbose
      ? (thought) => console.log(theme.muted(`[Thinking] ${thought}`))
      : undefined,
  });

  spinner.stop();

  // Format and output result
  const formatted = formatResult(result, config.outputFormat);

  if (options.output) {
    fs.writeFileSync(options.output as string, formatted);
    console.log(theme.success(`Result written to ${options.output}`));
  } else {
    console.log(formatted);
  }

  // Exit with appropriate code
  process.exit(result.success ? 0 : 1);
}

/**
 * Handle interactive command
 */
async function handleInteractive(options: Record<string, unknown>): Promise<void> {
  const config = loadConfig(process.cwd(), {
    provider: options.provider as string | undefined,
    model: options.model as string | undefined,
    apiKey: options.apiKey as string | undefined,
    verbose: options.verbose as boolean | undefined,
  });

  const validation = validateConfig(config);
  if (!validation.valid) {
    console.error(theme.error('Configuration errors:'));
    for (const error of validation.errors) {
      console.error(theme.error(`  - ${error}`));
    }
    process.exit(1);
  }

  await runInteractive(config);
}

/**
 * Handle config show command
 */
function handleConfigShow(): void {
  const config = loadConfig();

  console.log(theme.bold('\nCurrent Configuration:\n'));
  console.log(`  Provider:    ${config.provider}`);
  console.log(`  Model:       ${config.model}`);
  console.log(`  API Key:     ${config.apiKey ? '***' + config.apiKey.slice(-4) : theme.error('Not set')}`);
  console.log(`  Base URL:    ${config.baseUrl ?? 'Default'}`);
  console.log(`  Max Tokens:  ${config.maxTokens}`);
  console.log(`  Temperature: ${config.temperature}`);
  console.log(`  Work Dir:    ${config.workDir}`);
  console.log(`  Skills Dir:  ${config.skillsDir ?? 'Not set'}`);
  console.log(`  MCP Servers: ${config.mcpServers.length}`);
  console.log('');
}

/**
 * Handle config set command
 */
function handleConfigSet(key: string, value: string): void {
  const validKeys = ['provider', 'model', 'apiKey', 'baseUrl', 'maxTokens', 'temperature', 'skillsDir'];

  if (!validKeys.includes(key)) {
    console.error(theme.error(`Invalid config key: ${key}`));
    console.error(`Valid keys: ${validKeys.join(', ')}`);
    process.exit(1);
  }

  let parsedValue: string | number = value;
  if (key === 'maxTokens') {
    parsedValue = parseInt(value, 10);
  } else if (key === 'temperature') {
    parsedValue = parseFloat(value);
  }

  saveGlobalConfig({ [key]: parsedValue });
  console.log(theme.success(`Set ${key} = ${value}`));
}

/**
 * Handle list providers command
 */
function handleListProviders(): void {
  console.log(theme.bold('\nAvailable Providers:\n'));

  for (const provider of listProviders()) {
    const envSet = process.env[provider.envKey] ? theme.success('✓') : theme.error('✗');
    console.log(`  ${theme.info(provider.id)} (${provider.name})`);
    console.log(`    Default Model: ${provider.defaultModel}`);
    console.log(`    Env Key: ${provider.envKey} ${envSet}`);
    console.log(`    Models: ${provider.models.join(', ')}`);
    console.log('');
  }
}

// Run CLI
const program = createProgram();

// Default to interactive mode if no command specified
if (process.argv.length <= 2) {
  handleInteractive({}).catch((error) => {
    console.error(theme.error(`Error: ${error.message}`));
    process.exit(1);
  });
} else {
  program.parse();
}
