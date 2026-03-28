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

// Must stay in sync with ORT_VERSION in scripts/download-ort.js
// and the `ort` crate version in Cargo.toml.
const ORT_VERSION = '1.20.1';

/** Maps Node.js `${platform}-${arch}` to the bundled dylib filename. */
const DYLIB_FILES: Partial<Record<string, string>> = {
  'darwin-arm64': `libonnxruntime-darwin-arm64.${ORT_VERSION}.dylib`,
  'darwin-x64': `libonnxruntime-darwin-x64.${ORT_VERSION}.dylib`,
  'linux-x64': `libonnxruntime-linux-x64.so.${ORT_VERSION}`,
  'win32-x64': 'onnxruntime-win-x64.dll',
};

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
  const filename = DYLIB_FILES[key];

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
