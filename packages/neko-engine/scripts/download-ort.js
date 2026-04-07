#!/usr/bin/env node
/**
 * Download ONNX Runtime dylibs for VSIX bundling.
 *
 * Outputs to packages/neko-engine/bin/ so that the extension can set
 * ORT_DYLIB_PATH at activation time without requiring users to install
 * ONNX Runtime separately.
 *
 * ORT version must match what the `ort` crate expects.
 * ort 2.0.0-rc.12 → ONNX Runtime 1.20.1 binaries.
 *
 * Usage:
 *   node scripts/download-ort.js                         # current platform only
 *   node scripts/download-ort.js --all                   # all 4 platforms
 *   node scripts/download-ort.js --platform darwin-arm64 # specific platform
 *   node scripts/download-ort.js --platform darwin-arm64 --clean  # + remove other platforms
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  BIN_DIR,
  config,
  getCurrentPlatformKey,
  getOrtBaseUrl,
  getSupportedTargets,
  getTargetConfig,
} = require('./package-config');

const BASE_URL = getOrtBaseUrl();

/**
 * @param {string} platformKey - e.g. 'darwin-arm64'
 */
function downloadPlatform(platformKey) {
  const cfg = getTargetConfig(platformKey);
  if (!cfg) {
    throw new Error(`Unknown platform: "${platformKey}". Valid: ${getSupportedTargets().join(', ')}`);
  }

  const destPath = path.join(BIN_DIR, cfg.ort.dest);

  if (fs.existsSync(destPath)) {
    console.log(`  [skip]     ${cfg.ort.dest}  (already present)`);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ort-'));
  const archivePath = path.join(tmpDir, cfg.ort.archive);

  try {
    console.log(`  [download] ${cfg.ort.archive}`);
    execFileSync('curl', ['-fsSL', '--retry', '3', '-o', archivePath, `${BASE_URL}/${cfg.ort.archive}`], {
      stdio: 'inherit',
    });

    if (cfg.ort.ext === 'tgz') {
      execFileSync('tar', ['xzf', archivePath, '-C', tmpDir, cfg.ort.innerPath], { stdio: 'inherit' });
      fs.copyFileSync(path.join(tmpDir, cfg.ort.innerPath), destPath);
    } else {
      execFileSync('unzip', ['-j', '-o', archivePath, cfg.ort.innerPath, '-d', BIN_DIR], {
        stdio: 'inherit',
      });
      const extracted = path.join(BIN_DIR, path.basename(cfg.ort.innerPath));
      if (extracted !== destPath) {
        fs.renameSync(extracted, destPath);
      }
    }

    console.log(`  [done]     ${cfg.ort.dest}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * @param {string[]} argv
 * @returns {{ downloadAll: boolean; explicitPlatform: string | null; shouldClean: boolean }}
 */
function parseArgs(argv) {
  const platformIdx = argv.indexOf('--platform');
  return {
    downloadAll: argv.includes('--all'),
    explicitPlatform: platformIdx === -1 ? null : argv[platformIdx + 1] ?? null,
    shouldClean: argv.includes('--clean'),
  };
}

/**
 * @param {{ downloadAll: boolean; explicitPlatform: string | null }} args
 * @returns {string[]}
 */
function resolveTargets(args) {
  if (args.downloadAll) {
    return getSupportedTargets();
  }

  if (args.explicitPlatform) {
    if (!getTargetConfig(args.explicitPlatform)) {
      throw new Error(`Unknown platform: "${args.explicitPlatform}". Valid: ${getSupportedTargets().join(', ')}`);
    }
    return [args.explicitPlatform];
  }

  const currentKey = getCurrentPlatformKey();
  return getTargetConfig(currentKey) ? [currentKey] : [];
}

/**
 * @param {string[]} targets
 */
function cleanOtherPlatforms(targets) {
  const keepDests = new Set(
    targets.map((target) => {
      const cfg = getTargetConfig(target);
      if (!cfg) {
        throw new Error(`Unknown platform: "${target}"`);
      }
      return cfg.ort.dest;
    }),
  );

  for (const target of getSupportedTargets()) {
    const cfg = getTargetConfig(target);
    if (!cfg) {
      continue;
    }

    const destPath = path.join(BIN_DIR, cfg.ort.dest);
    if (!keepDests.has(cfg.ort.dest) && fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
      console.log(`  [clean] ${cfg.ort.dest}`);
    }
  }
}

function main() {
  fs.mkdirSync(BIN_DIR, { recursive: true });

  const args = parseArgs(process.argv.slice(2));
  const targets = resolveTargets(args);

  if (targets.length === 0) {
    console.warn(`Warning: no ORT config for platform "${getCurrentPlatformKey()}". Skipping.`);
    return;
  }

  if (args.shouldClean) {
    cleanOtherPlatforms(targets);
  }

  console.log(`Downloading ORT ${config.ortVersion} for: ${targets.join(', ')}`);
  for (const target of targets) {
    downloadPlatform(target);
  }
  console.log(`\nORT runtime libraries written to: ${BIN_DIR}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

module.exports = {
  cleanOtherPlatforms,
  downloadPlatform,
  main,
  parseArgs,
  resolveTargets,
};
