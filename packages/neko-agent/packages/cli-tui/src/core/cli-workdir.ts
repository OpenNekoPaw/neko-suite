import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface CliWorkDirOptions {
  readonly positionalWorkDir?: unknown;
  readonly cd?: unknown;
  readonly cwd?: unknown;
  readonly workDir?: unknown;
}

/**
 * Resolve the CLI working directory from command options.
 * Throws a visible error for invalid paths so callers do not silently load the
 * wrong workspace config.
 */
export function resolveCliWorkDir(options: CliWorkDirOptions = {}): string {
  const positionalValue = readWorkDirOption(
    options.positionalWorkDir,
    'Positional working directory',
  );
  const cdValue = readWorkDirOption(options.cd, '--cd option');
  const cwdValue = readWorkDirOption(options.cwd, '--cwd option');
  const workDirValue = readWorkDirOption(options.workDir, '--work-dir option');
  const optionValue = resolveOptionWorkDir(cdValue, cwdValue, workDirValue);
  if (positionalValue && optionValue) {
    const positionalResolved = path.resolve(expandHomeDir(positionalValue));
    const optionResolved = path.resolve(expandHomeDir(optionValue));
    if (positionalResolved !== optionResolved) {
      throw new Error(
        `Conflicting working directories: positional ${positionalResolved} differs from option ${optionResolved}`,
      );
    }
  }

  const rawValue = positionalValue ?? optionValue;
  const expanded = expandHomeDir(rawValue ?? process.cwd());
  const resolved = path.resolve(expanded);
  assertExistingDirectory(resolved);
  return resolved;
}

function readWorkDirOption(value: unknown, label: string): string | undefined {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

function resolveOptionWorkDir(
  cdValue: string | undefined,
  cwdValue: string | undefined,
  workDirValue: string | undefined,
): string | undefined {
  const provided = [
    { label: '--cd', value: cdValue },
    { label: '--cwd', value: cwdValue },
    { label: '--work-dir', value: workDirValue },
  ].filter((entry): entry is { label: string; value: string } => entry.value !== undefined);

  const first = provided[0];
  if (!first) {
    return undefined;
  }

  const firstResolved = path.resolve(expandHomeDir(first.value));
  for (const next of provided.slice(1)) {
    const nextResolved = path.resolve(expandHomeDir(next.value));
    if (firstResolved !== nextResolved) {
      throw new Error(
        `Conflicting working directories: ${first.label} ${firstResolved} differs from ${next.label} ${nextResolved}`,
      );
    }
  }
  return first.value;
}

function assertExistingDirectory(resolved: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch (error) {
    if (isNodeFileSystemError(error) && error.code === 'ENOENT') {
      throw new Error(`Working directory does not exist: ${resolved}`);
    }
    throw error;
  }
  if (!stat.isDirectory()) {
    throw new Error(`Working directory is not a directory: ${resolved}`);
  }
}

function expandHomeDir(value: string): string {
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function isNodeFileSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
