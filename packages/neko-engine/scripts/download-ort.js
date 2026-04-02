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

// Must match ort crate version in Cargo.toml
const ORT_VERSION = '1.20.1';
const BASE_URL = `https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}`;
const BIN_DIR = path.resolve(__dirname, '..', 'bin');

/** @type {Record<string, { archive: string; innerPath: string; dest: string; ext: 'tgz' | 'zip' }>} */
const PLATFORMS = {
  'darwin-arm64': {
    archive: `onnxruntime-osx-arm64-${ORT_VERSION}.tgz`,
    innerPath: `onnxruntime-osx-arm64-${ORT_VERSION}/lib/libonnxruntime.${ORT_VERSION}.dylib`,
    dest: `libonnxruntime-darwin-arm64.${ORT_VERSION}.dylib`,
    ext: 'tgz',
  },
  'darwin-x64': {
    archive: `onnxruntime-osx-x86_64-${ORT_VERSION}.tgz`,
    innerPath: `onnxruntime-osx-x86_64-${ORT_VERSION}/lib/libonnxruntime.${ORT_VERSION}.dylib`,
    dest: `libonnxruntime-darwin-x64.${ORT_VERSION}.dylib`,
    ext: 'tgz',
  },
  'linux-x64': {
    archive: `onnxruntime-linux-x64-${ORT_VERSION}.tgz`,
    innerPath: `onnxruntime-linux-x64-${ORT_VERSION}/lib/libonnxruntime.so.${ORT_VERSION}`,
    dest: `libonnxruntime-linux-x64.so.${ORT_VERSION}`,
    ext: 'tgz',
  },
  'win32-x64': {
    archive: `onnxruntime-win-x64-${ORT_VERSION}.zip`,
    innerPath: `onnxruntime-win-x64-${ORT_VERSION}/lib/onnxruntime.dll`,
    dest: 'onnxruntime-win-x64.dll',
    ext: 'zip',
  },
};

/**
 * @param {string} platformKey - e.g. 'darwin-arm64'
 */
function downloadPlatform(platformKey) {
  const cfg = PLATFORMS[platformKey];
  const destPath = path.join(BIN_DIR, cfg.dest);

  if (fs.existsSync(destPath)) {
    console.log(`  [skip]     ${cfg.dest}  (already present)`);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ort-'));
  const archivePath = path.join(tmpDir, cfg.archive);

  try {
    // Download
    console.log(`  [download] ${cfg.archive}`);
    execFileSync('curl', ['-fsSL', '--retry', '3', '-o', archivePath, `${BASE_URL}/${cfg.archive}`], {
      stdio: 'inherit',
    });

    // Extract specific file
    if (cfg.ext === 'tgz') {
      execFileSync('tar', ['xzf', archivePath, '-C', tmpDir, cfg.innerPath], { stdio: 'inherit' });
      fs.copyFileSync(path.join(tmpDir, cfg.innerPath), destPath);
    } else {
      // zip — unzip -j strips directory structure, outputs directly to BIN_DIR
      execFileSync('unzip', ['-j', '-o', archivePath, cfg.innerPath, '-d', BIN_DIR], {
        stdio: 'inherit',
      });
      const extracted = path.join(BIN_DIR, path.basename(cfg.innerPath));
      if (extracted !== destPath) {
        fs.renameSync(extracted, destPath);
      }
    }

    console.log(`  [done]     ${cfg.dest}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

fs.mkdirSync(BIN_DIR, { recursive: true });

const downloadAll = process.argv.includes('--all');
const shouldClean = process.argv.includes('--clean');
const platformIdx = process.argv.indexOf('--platform');
const explicitPlatform = platformIdx !== -1 ? process.argv[platformIdx + 1] : null;
const currentKey = `${process.platform}-${process.arch}`;

let targets;
if (downloadAll) {
  targets = Object.keys(PLATFORMS);
} else if (explicitPlatform) {
  if (!(explicitPlatform in PLATFORMS)) {
    console.error(`Unknown platform: "${explicitPlatform}". Valid: ${Object.keys(PLATFORMS).join(', ')}`);
    process.exit(1);
  }
  targets = [explicitPlatform];
} else {
  targets = [currentKey].filter((k) => k in PLATFORMS);
}

if (targets.length === 0) {
  console.warn(`Warning: no ORT config for platform "${currentKey}". Skipping.`);
  process.exit(0);
}

// Clean other platforms' dylibs when --clean is specified
if (shouldClean) {
  const keepDests = new Set(targets.map((t) => PLATFORMS[t].dest));
  for (const key of Object.keys(PLATFORMS)) {
    const destPath = path.join(BIN_DIR, PLATFORMS[key].dest);
    if (!keepDests.has(PLATFORMS[key].dest) && fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
      console.log(`  [clean] ${PLATFORMS[key].dest}`);
    }
  }
}

console.log(`Downloading ORT ${ORT_VERSION} for: ${targets.join(', ')}`);
for (const t of targets) {
  downloadPlatform(t);
}
console.log(`\nORT dylibs written to: ${BIN_DIR}`);
