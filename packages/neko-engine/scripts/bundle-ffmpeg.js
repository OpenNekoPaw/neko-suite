#!/usr/bin/env node
/**
 * Bundle FFmpeg shared libraries for platform-specific VSIX packaging.
 *
 * Copies FFmpeg dylibs into packages/native-napi/ (same dir as .node file)
 * so the dynamic linker finds them via @loader_path (macOS) / $ORIGIN (Linux).
 *
 * Sources:
 *   macOS  — Homebrew installation
 *   Linux  — BtbN pre-built shared builds (same source as Dockerfile)
 *   Windows — BtbN pre-built Windows builds
 *
 * Usage:
 *   node scripts/bundle-ffmpeg.js                         # current platform
 *   node scripts/bundle-ffmpeg.js --platform darwin-arm64 # specific platform
 *   node scripts/bundle-ffmpeg.js --clean                 # remove bundled libs
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ENGINE_DIR = path.resolve(__dirname, '..');
const NAPI_DIR = path.join(ENGINE_DIR, 'packages', 'native-napi');

// FFmpeg libraries to bundle (core set used by ffmpeg-next crate)
const FFMPEG_LIBS = [
  'avcodec',
  'avformat',
  'avutil',
  'swscale',
  'swresample',
  'avfilter',
];

// BtbN FFmpeg version (must match what's used in Dockerfile / CI)
const BTBN_TAG = 'latest';
const BTBN_VERSION = '7.1';
const BTBN_BASE = 'https://github.com/BtbN/FFmpeg-Builds/releases/download';

// ── Platform configs ────────────────────────────────────────────────────────

const PLATFORMS = {
  'darwin-arm64': {
    type: 'homebrew',
    brewPrefix: '/opt/homebrew/opt/ffmpeg',
    nodeFile: 'neko-engine.darwin-arm64.node',
  },
  'darwin-x64': {
    type: 'homebrew',
    brewPrefix: '/usr/local/opt/ffmpeg',
    nodeFile: 'neko-engine.darwin-x64.node',
  },
  'linux-x64': {
    type: 'btbn',
    archive: `ffmpeg-n${BTBN_VERSION}-${BTBN_TAG}-linux64-gpl-shared-${BTBN_VERSION}.tar.xz`,
    nodeFile: 'neko-engine.linux-x64-gnu.node',
  },
  'win32-x64': {
    type: 'btbn',
    archive: `ffmpeg-n${BTBN_VERSION}-${BTBN_TAG}-win64-gpl-shared-${BTBN_VERSION}.zip`,
    nodeFile: 'neko-engine.win32-x64-msvc.node',
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`  ${msg}`);
}

/** Remove all bundled FFmpeg libs from NAPI_DIR */
function cleanBundledLibs() {
  const patterns = [/\.dylib$/, /\.so/, /avcodec.*\.dll$/, /avformat.*\.dll$/, /avutil.*\.dll$/, /swscale.*\.dll$/, /swresample.*\.dll$/, /avfilter.*\.dll$/];
  for (const f of fs.readdirSync(NAPI_DIR)) {
    if (patterns.some((p) => p.test(f))) {
      fs.unlinkSync(path.join(NAPI_DIR, f));
      log(`[clean] ${f}`);
    }
  }
}

// ── macOS: copy from Homebrew + rewrite install names ───────────────────────

function bundleMacOS(cfg) {
  const libDir = path.join(cfg.brewPrefix, 'lib');

  if (!fs.existsSync(libDir)) {
    console.error(`ERROR: Homebrew FFmpeg not found at ${cfg.brewPrefix}`);
    console.error('  Install: brew install ffmpeg');
    process.exit(1);
  }

  log(`[source] ${libDir}`);

  // Find and copy versioned dylibs
  const copied = [];
  for (const lib of FFMPEG_LIBS) {
    // Find the main versioned dylib (e.g. libavcodec.61.dylib)
    const files = fs.readdirSync(libDir).filter((f) =>
      f.startsWith(`lib${lib}.`) && f.endsWith('.dylib') && !f.endsWith('.dylib.dSYM')
    );

    // Pick the shortest versioned name (e.g. libavcodec.61.dylib over libavcodec.61.3.100.dylib)
    const sorted = files.sort((a, b) => a.length - b.length);
    const mainLib = sorted.find((f) => /^lib\w+\.\d+\.dylib$/.test(f)) || sorted[0];

    if (!mainLib) {
      console.error(`ERROR: lib${lib} not found in ${libDir}`);
      process.exit(1);
    }

    const src = path.join(libDir, mainLib);
    const dest = path.join(NAPI_DIR, mainLib);
    fs.copyFileSync(src, dest);
    copied.push(mainLib);
    log(`[copy]   ${mainLib}`);
  }

  // Rewrite install names in the .node file
  const nodeFile = path.join(NAPI_DIR, cfg.nodeFile);
  if (fs.existsSync(nodeFile)) {
    log(`[patch]  ${cfg.nodeFile} — rewriting dylib paths to @loader_path/`);
    for (const lib of copied) {
      const oldPath = path.join(libDir, lib);
      const newPath = `@loader_path/${lib}`;
      try {
        execFileSync('install_name_tool', ['-change', oldPath, newPath, nodeFile], { stdio: 'pipe' });
      } catch {
        // May fail if the old path doesn't match exactly; also try rpath form
        try {
          execFileSync('install_name_tool', ['-change', `@rpath/${lib}`, newPath, nodeFile], { stdio: 'pipe' });
        } catch {
          // Ignore — path may already be correct
        }
      }
    }
  }

  // Rewrite inter-library references in copied dylibs
  for (const lib of copied) {
    const libPath = path.join(NAPI_DIR, lib);
    // Change the dylib's own id
    execFileSync('install_name_tool', ['-id', `@loader_path/${lib}`, libPath], { stdio: 'pipe' });

    // Change references to other FFmpeg libs
    for (const otherLib of copied) {
      if (otherLib === lib) continue;
      const oldRef = path.join(libDir, otherLib);
      const newRef = `@loader_path/${otherLib}`;
      try {
        execFileSync('install_name_tool', ['-change', oldRef, newRef, libPath], { stdio: 'pipe' });
      } catch {
        // Ignore
      }
    }
  }

  // Ad-hoc codesign (required on macOS 11+)
  log('[sign]   ad-hoc codesigning modified files');
  if (fs.existsSync(nodeFile)) {
    execFileSync('codesign', ['--force', '--sign', '-', nodeFile], { stdio: 'pipe' });
  }
  for (const lib of copied) {
    execFileSync('codesign', ['--force', '--sign', '-', path.join(NAPI_DIR, lib)], { stdio: 'pipe' });
  }

  return copied;
}

// ── Linux / Windows: download BtbN pre-built ────────────────────────────────

function bundleBtbN(cfg, platform) {
  const url = `${BTBN_BASE}/${BTBN_TAG}/${cfg.archive}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-'));
  const archivePath = path.join(tmpDir, cfg.archive);

  try {
    log(`[download] ${cfg.archive}`);
    execFileSync('curl', ['-fsSL', '--retry', '3', '-o', archivePath, url], { stdio: 'inherit' });

    // Extract
    const extractDir = path.join(tmpDir, 'extracted');
    fs.mkdirSync(extractDir);

    if (cfg.archive.endsWith('.tar.xz')) {
      execFileSync('tar', ['xJf', archivePath, '-C', extractDir, '--strip-components=1'], { stdio: 'inherit' });
    } else {
      // zip (Windows)
      execFileSync('unzip', ['-o', archivePath, '-d', extractDir], { stdio: 'inherit' });
      // zip may have a top-level directory
      const entries = fs.readdirSync(extractDir);
      if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
        const inner = path.join(extractDir, entries[0]);
        for (const f of fs.readdirSync(inner)) {
          fs.renameSync(path.join(inner, f), path.join(extractDir, f));
        }
        fs.rmdirSync(inner);
      }
    }

    // Find lib directory
    let libDir;
    if (fs.existsSync(path.join(extractDir, 'lib'))) {
      libDir = path.join(extractDir, 'lib');
    } else if (fs.existsSync(path.join(extractDir, 'bin'))) {
      // Windows: DLLs are in bin/
      libDir = path.join(extractDir, 'bin');
    } else {
      console.error('ERROR: Cannot find lib/ or bin/ in extracted FFmpeg archive');
      process.exit(1);
    }

    const copied = [];
    const isWindows = platform === 'win32-x64';

    for (const lib of FFMPEG_LIBS) {
      if (isWindows) {
        // Windows: avcodec-61.dll pattern
        const dll = fs.readdirSync(libDir).find((f) =>
          f.startsWith(`${lib}-`) && f.endsWith('.dll')
        );
        if (dll) {
          fs.copyFileSync(path.join(libDir, dll), path.join(NAPI_DIR, dll));
          copied.push(dll);
          log(`[copy]   ${dll}`);
        }
      } else {
        // Linux: libavcodec.so.61 pattern
        const soFiles = fs.readdirSync(libDir).filter((f) =>
          f.startsWith(`lib${lib}.so`)
        );
        // Copy all symlink targets and symlinks
        for (const so of soFiles) {
          const src = path.join(libDir, so);
          const dest = path.join(NAPI_DIR, so);
          // Resolve symlinks — copy the actual file
          const realSrc = fs.realpathSync(src);
          fs.copyFileSync(realSrc, dest);
          copied.push(so);
          log(`[copy]   ${so}`);
        }
      }
    }

    // Linux: patch RPATH on .node file
    if (!isWindows) {
      const nodeFile = path.join(NAPI_DIR, cfg.nodeFile);
      if (fs.existsSync(nodeFile)) {
        log(`[patch]  ${cfg.nodeFile} — setting RPATH to $ORIGIN`);
        try {
          execFileSync('patchelf', ['--set-rpath', '$ORIGIN', nodeFile], { stdio: 'pipe' });
        } catch {
          log('[warn]   patchelf not found — install with: sudo apt-get install patchelf');
          log('[warn]   The .node file may fail to load FFmpeg libs at runtime');
        }
      }
    }

    return copied;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  // Parse args
  const args = process.argv.slice(2);

  if (args.includes('--clean')) {
    console.log('Cleaning bundled FFmpeg libs...');
    cleanBundledLibs();
    return;
  }

  const platformIdx = args.indexOf('--platform');
  const platformKey = platformIdx !== -1
    ? args[platformIdx + 1]
    : `${process.platform}-${process.arch}`;

  const cfg = PLATFORMS[platformKey];
  if (!cfg) {
    console.error(`Unknown platform: "${platformKey}"`);
    console.error(`Valid platforms: ${Object.keys(PLATFORMS).join(', ')}`);
    process.exit(1);
  }

  console.log(`Bundling FFmpeg libs for: ${platformKey}`);

  // Clean previous libs
  cleanBundledLibs();

  let copied;
  if (cfg.type === 'homebrew') {
    copied = bundleMacOS(cfg);
  } else {
    copied = bundleBtbN(cfg, platformKey);
  }

  console.log(`\nBundled ${copied.length} FFmpeg libraries to: ${NAPI_DIR}`);
}

main();
