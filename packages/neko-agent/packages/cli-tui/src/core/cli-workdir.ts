import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface CliWorkDirOptions {
  readonly positionalWorkDir?: unknown;
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
  const cwdValue = readWorkDirOption(options.cwd, '--cwd option');
  const workDirValue = readWorkDirOption(options.workDir, '--work-dir option');
  const optionValue = resolveOptionWorkDir(cwdValue, workDirValue);
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
  cwdValue: string | undefined,
  workDirValue: string | undefined,
): string | undefined {
  if (cwdValue && workDirValue) {
    const cwdResolved = path.resolve(expandHomeDir(cwdValue));
    const workDirResolved = path.resolve(expandHomeDir(workDirValue));
    if (cwdResolved !== workDirResolved) {
      throw new Error(
        `Conflicting working directories: --cwd ${cwdResolved} differs from --work-dir ${workDirResolved}`,
      );
    }
  }
  return cwdValue ?? workDirValue;
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
