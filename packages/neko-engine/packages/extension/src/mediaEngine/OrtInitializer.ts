/**
 * ORT (ONNX Runtime) dylib initializer.
 *
 * Sets ORT_DYLIB_PATH from the bundled bin/ directory before the first
 * ML inference call. Because the Rust engine runs in-process (N-API),
 * process.env mutations in TypeScript are immediately visible to Rust's
 * std::env::var() — no IPC or restart needed.
 *
 * Must be called in activate() before NativeEngine.create().
 */

import * as path from 'path';
import * as fs from 'fs';
import type * as vscode from 'vscode';

type PackageConfig = {
  ortVersion: string;
  targets: Record<
    string,
    {
      ort?: {
        destTemplate?: string;
      };
    }
  >;
};

let cachedPackageConfig: PackageConfig | null = null;

function isPackageConfig(value: unknown): value is PackageConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const ortVersion = Reflect.get(value, 'ortVersion');
  const targets = Reflect.get(value, 'targets');
  return typeof ortVersion === 'string' && !!targets && typeof targets === 'object';
}

function loadPackageConfig(
  extensionUri: vscode.Uri,
  logger: { warn(msg: string): void },
): PackageConfig | null {
  if (cachedPackageConfig) {
    return cachedPackageConfig;
  }

  const configPath = path.join(extensionUri.fsPath, 'scripts', 'package-config.json');

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown;
    if (!isPackageConfig(parsed)) {
      logger.warn(`[ORT] invalid package config: ${configPath}`);
      return null;
    }

    cachedPackageConfig = parsed;
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[ORT] failed to load package config from ${configPath}: ${message}`);
    return null;
  }
}

function expandOrtTemplate(template: string, ortVersion: string): string {
  return template.replaceAll('{ortVersion}', ortVersion);
}

function resolveOrtFilename(
  extensionUri: vscode.Uri,
  logger: { warn(msg: string): void },
): string | null {
  const config = loadPackageConfig(extensionUri, logger);
  if (!config) {
    return null;
  }

  const key = `${process.platform}-${process.arch}`;
  const target = config.targets[key];
  const template = target?.ort?.destTemplate;

  return typeof template === 'string' ? expandOrtTemplate(template, config.ortVersion) : null;
}

/**
 * Initialize ORT_DYLIB_PATH from the bundled bin/ directory.
 *
 * Safe to call multiple times — no-op if the env var is already set
 * (respects user-supplied ORT_DYLIB_PATH for custom installs).
 */
export function initOrtDylib(
  extensionUri: vscode.Uri,
  logger: { info(msg: string): void; warn(msg: string): void },
): void {
  if (process.env['ORT_DYLIB_PATH']) {
    logger.info(`[ORT] using existing ORT_DYLIB_PATH: ${process.env['ORT_DYLIB_PATH']}`);
    return;
  }

  const key = `${process.platform}-${process.arch}`;
  const filename = resolveOrtFilename(extensionUri, logger);

  if (!filename) {
    logger.warn(`[ORT] no bundled dylib for platform "${key}". ML inference unavailable.`);
    return;
  }

  const bundledPath = path.join(extensionUri.fsPath, 'bin', filename);

  if (fs.existsSync(bundledPath)) {
    process.env['ORT_DYLIB_PATH'] = bundledPath;
    logger.info(`[ORT] dylib initialized: ${bundledPath}`);
  } else {
    logger.warn(
      `[ORT] bundled dylib not found: ${bundledPath}. ` +
        `Run 'node scripts/download-ort.js' to download. ML inference unavailable.`,
    );
  }
}
